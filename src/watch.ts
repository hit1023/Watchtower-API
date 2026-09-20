import { normalizeContent, sha256, summarizeDifference } from "./content";
import { HttpError } from "./http";
import {
  finishRun,
  insertEvent,
  insertSnapshot,
  latestSnapshot,
  scheduleNextRun,
  startRun,
} from "./repository";
import type { Analysis, EventRow, SnapshotRow, WatchRow } from "./types";
import { fetchPublicUrl } from "./url";

function fallbackAnalysis(before: string, after: string): Analysis {
  const difference = summarizeDifference(before, after);
  return {
    importance: Math.min(1, Math.max(0.1, difference.ratio * 3)),
    category: "content",
    summary: difference.after
      ? `Content changed: ${difference.after.slice(0, 240)}`
      : "Previously visible content was removed.",
    changes: [{ before: difference.before, after: difference.after }],
  };
}

function extractJsonObject(value: string): unknown {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI response did not contain JSON");
  return JSON.parse(value.slice(start, end + 1));
}

function parseAnalysis(value: unknown, fallback: Analysis): Analysis {
  if (value === null || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;
  const importance = typeof candidate.importance === "number" ? candidate.importance : fallback.importance;
  const category = typeof candidate.category === "string" ? candidate.category.slice(0, 80) : fallback.category;
  const summary = typeof candidate.summary === "string" ? candidate.summary.slice(0, 1000) : fallback.summary;
  const changes = Array.isArray(candidate.changes)
    ? candidate.changes.slice(0, 10).flatMap((change) => {
        if (change === null || typeof change !== "object") return [];
        const item = change as Record<string, unknown>;
        if (typeof item.before !== "string" || typeof item.after !== "string") return [];
        return [{ before: item.before.slice(0, 1200), after: item.after.slice(0, 1200) }];
      })
    : fallback.changes;
  return { importance: Math.min(1, Math.max(0, importance)), category, summary, changes };
}

async function analyzeChange(env: Env, watch: WatchRow, before: string, after: string): Promise<Analysis> {
  const fallback = fallbackAnalysis(before, after);
  if (String(env.AI_ENABLED) !== "true") return fallback;
  const difference = summarizeDifference(before, after);
  try {
    const result = await env.AI.run(env.AI_MODEL, {
      messages: [
        {
          role: "system",
          content:
            "You classify webpage changes. Return JSON only with importance (0..1), category, summary, and changes [{before,after}]. Ignore navigation, timestamps, ads, counters, and cosmetic noise unless the instruction asks for them.",
        },
        {
          role: "user",
          content: `Monitoring instruction:\n${watch.instruction}\n\nChanged before:\n${difference.before}\n\nChanged after:\n${difference.after}`,
        },
      ],
      max_tokens: 700,
    });
    const response = typeof result === "object" && result !== null && "response" in result ? result.response : "";
    return typeof response === "string" ? parseAnalysis(extractJsonObject(response), fallback) : fallback;
  } catch (error) {
    console.warn(JSON.stringify({ event: "ai_analysis_failed", watchId: watch.id, error: String(error) }));
    return fallback;
  }
}

export type RunResult = {
  watchId: string;
  snapshotId: string;
  changed: boolean;
  event?: Omit<EventRow, "details_json"> & { details: unknown };
};

export async function runWatch(env: Env, watch: WatchRow): Promise<RunResult> {
  const run = await startRun(env.DB, watch.id);
  try {
    const fetched = await fetchPublicUrl(
      watch.url,
      Number(env.FETCH_TIMEOUT_MS),
      Number(env.MAX_RESPONSE_BYTES),
    );
    const contentType = fetched.response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.match(/(?:text\/|application\/(?:json|xhtml\+xml))/i)) {
      throw new HttpError(415, `Unsupported monitored content type: ${contentType}`);
    }
    const normalized = await normalizeContent(fetched.bytes, contentType);
    if (!normalized) throw new HttpError(422, "Monitored page did not contain extractable text");
    const observedAt = new Date().toISOString();
    const snapshot: SnapshotRow = {
      id: `snapshot_${crypto.randomUUID()}`,
      watch_id: watch.id,
      observed_at: observedAt,
      final_url: fetched.response.url || watch.url,
      status_code: fetched.response.status,
      content_type: contentType,
      content_hash: await sha256(normalized),
      normalized_text: normalized,
      truncated: fetched.truncated ? 1 : 0,
      etag: fetched.response.headers.get("etag"),
      last_modified: fetched.response.headers.get("last-modified"),
    };
    const previous = await latestSnapshot(env.DB, watch.id);
    await scheduleNextRun(env.DB, watch);

    if (previous?.content_hash === snapshot.content_hash) {
      await finishRun(env.DB, run, "completed");
      return { watchId: watch.id, snapshotId: previous.id, changed: false };
    }
    await insertSnapshot(env.DB, snapshot);

    if (!previous) {
      await finishRun(env.DB, run, "completed");
      return { watchId: watch.id, snapshotId: snapshot.id, changed: false };
    }

    const analysis = await analyzeChange(env, watch, previous.normalized_text, normalized);
    if (analysis.importance < watch.importance_threshold) {
      await finishRun(env.DB, run, "completed");
      return { watchId: watch.id, snapshotId: snapshot.id, changed: false };
    }

    const event: EventRow = {
      id: `event_${crypto.randomUUID()}`,
      watch_id: watch.id,
      snapshot_id: snapshot.id,
      previous_snapshot_id: previous.id,
      event_type: "meaningful_change.detected",
      importance: analysis.importance,
      category: analysis.category,
      summary: analysis.summary,
      details_json: JSON.stringify({ changes: analysis.changes, url: snapshot.final_url }),
      created_at: observedAt,
    };
    await insertEvent(env.DB, event);
    await finishRun(env.DB, run, "completed");
    const { details_json, ...rest } = event;
    return { ...rest, watchId: watch.id, snapshotId: snapshot.id, changed: true, event: { ...rest, details: JSON.parse(details_json) } };
  } catch (error) {
    await finishRun(env.DB, run, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

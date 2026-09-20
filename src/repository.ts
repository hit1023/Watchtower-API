import type { EventRow, SnapshotRow, WatchRow } from "./types";

export async function createWatch(
  db: D1Database,
  input: { url: string; instruction: string; intervalMinutes: number; importanceThreshold: number },
): Promise<WatchRow> {
  const id = `watch_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO watches
       (id, url, instruction, interval_minutes, importance_threshold, enabled, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .bind(id, input.url, input.instruction, input.intervalMinutes, input.importanceThreshold, now, now, now)
    .run();
  return (await getWatch(db, id)) as WatchRow;
}

export async function getWatch(db: D1Database, id: string): Promise<WatchRow | null> {
  return db.prepare("SELECT * FROM watches WHERE id = ?").bind(id).first<WatchRow>();
}

export async function listWatches(db: D1Database, limit: number, cursor?: string): Promise<WatchRow[]> {
  if (cursor) {
    const result = await db
      .prepare("SELECT * FROM watches WHERE id > ? ORDER BY id ASC LIMIT ?")
      .bind(cursor, limit)
      .all<WatchRow>();
    return result.results;
  }
  const result = await db.prepare("SELECT * FROM watches ORDER BY id ASC LIMIT ?").bind(limit).all<WatchRow>();
  return result.results;
}

export async function listDueWatches(db: D1Database, now: string, limit = 10): Promise<WatchRow[]> {
  const result = await db
    .prepare("SELECT * FROM watches WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT ?")
    .bind(now, limit)
    .all<WatchRow>();
  return result.results;
}

export async function latestSnapshot(db: D1Database, watchId: string): Promise<SnapshotRow | null> {
  return db
    .prepare("SELECT * FROM snapshots WHERE watch_id = ? ORDER BY observed_at DESC LIMIT 1")
    .bind(watchId)
    .first<SnapshotRow>();
}

export async function insertSnapshot(db: D1Database, snapshot: SnapshotRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO snapshots
       (id, watch_id, observed_at, final_url, status_code, content_type, content_hash, normalized_text, truncated, etag, last_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      snapshot.id,
      snapshot.watch_id,
      snapshot.observed_at,
      snapshot.final_url,
      snapshot.status_code,
      snapshot.content_type,
      snapshot.content_hash,
      snapshot.normalized_text,
      snapshot.truncated,
      snapshot.etag,
      snapshot.last_modified,
    )
    .run();
}

export async function insertEvent(db: D1Database, event: EventRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO events
       (id, watch_id, snapshot_id, previous_snapshot_id, event_type, importance, category, summary, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.id,
      event.watch_id,
      event.snapshot_id,
      event.previous_snapshot_id,
      event.event_type,
      event.importance,
      event.category,
      event.summary,
      event.details_json,
      event.created_at,
    )
    .run();
}

export async function listEvents(
  db: D1Database,
  limit: number,
  watchId?: string,
): Promise<Array<Omit<EventRow, "details_json"> & { details: unknown }>> {
  const query = watchId
    ? db.prepare("SELECT * FROM events WHERE watch_id = ? ORDER BY created_at DESC LIMIT ?").bind(watchId, limit)
    : db.prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT ?").bind(limit);
  const result = await query.all<EventRow>();
  return result.results.map(({ details_json, ...event }) => ({ ...event, details: JSON.parse(details_json) }));
}

export async function startRun(db: D1Database, watchId: string): Promise<{ id: string; startedAt: string }> {
  const id = `run_${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  await db
    .prepare("INSERT INTO runs (id, watch_id, status, started_at) VALUES (?, ?, 'running', ?)")
    .bind(id, watchId, startedAt)
    .run();
  return { id, startedAt };
}

export async function finishRun(
  db: D1Database,
  run: { id: string; startedAt: string },
  status: "completed" | "failed",
  error?: string,
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const durationMs = Date.parse(finishedAt) - Date.parse(run.startedAt);
  await db
    .prepare("UPDATE runs SET status = ?, finished_at = ?, duration_ms = ?, error = ? WHERE id = ?")
    .bind(status, finishedAt, durationMs, error ?? null, run.id)
    .run();
}

export async function scheduleNextRun(db: D1Database, watch: WatchRow): Promise<void> {
  const next = new Date(Date.now() + watch.interval_minutes * 60_000).toISOString();
  await db.prepare("UPDATE watches SET next_run_at = ?, updated_at = ? WHERE id = ?").bind(next, new Date().toISOString(), watch.id).run();
}

import { authorize, error, HttpError, json, readJson } from "./http";
import { createWatch, getWatch, listDueWatches, listEvents, listWatches } from "./repository";
import { validatePublicUrl } from "./url";
import { runWatch } from "./watch";

const MAX_PAGE_SIZE = 100;
const ALLOWED_ORIGINS = new Set(["https://watchtower.s-quad.com"]);

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  const hostname = new URL(request.url).hostname;
  if ((hostname === "127.0.0.1" || hostname === "localhost") && origin.startsWith("http://localhost:")) return origin;
  return null;
}

function withCors(request: Request, response: Response): Response {
  const origin = allowedOrigin(request);
  if (!origin) return response;
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("access-control-allow-headers", "authorization, content-type");
  response.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  response.headers.set("access-control-max-age", "86400");
  response.headers.append("vary", "Origin");
  return response;
}

function integerParam(value: string | null, fallback: number, maximum = MAX_PAGE_SIZE): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new HttpError(400, `limit must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

function parseCreateWatchBody(value: unknown): {
  url: string;
  instruction: string;
  intervalMinutes: number;
  importanceThreshold: number;
} {
  if (value === null || typeof value !== "object") throw new HttpError(400, "Body must be a JSON object");
  const body = value as Record<string, unknown>;
  if (typeof body.url !== "string") throw new HttpError(400, "url is required");
  if (typeof body.instruction !== "string" || body.instruction.trim().length < 3) {
    throw new HttpError(400, "instruction must contain at least 3 characters");
  }
  const intervalMinutes = body.interval_minutes ?? 60;
  if (typeof intervalMinutes !== "number" || !Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 43_200) {
    throw new HttpError(400, "interval_minutes must be an integer between 15 and 43200");
  }
  const importanceThreshold = body.importance_threshold ?? 0.7;
  if (typeof importanceThreshold !== "number" || importanceThreshold < 0 || importanceThreshold > 1) {
    throw new HttpError(400, "importance_threshold must be between 0 and 1");
  }
  return {
    url: validatePublicUrl(body.url).toString(),
    instruction: body.instruction.trim().slice(0, 2000),
    intervalMinutes,
    importanceThreshold,
  };
}

function publicIndex(): Response {
  return json({
    name: "Watchtower API",
    version: "0.1.0",
    description: "Turn meaningful webpage changes into structured events.",
    endpoints: {
      health: "GET /health",
      create_watch: "POST /v1/watches",
      list_watches: "GET /v1/watches",
      get_watch: "GET /v1/watches/{id}",
      run_watch: "POST /v1/watches/{id}/run",
      list_events: "GET /v1/events?watch_id={id}",
    },
  });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (request.method === "GET" && pathname === "/") return publicIndex();
  if (request.method === "GET" && pathname === "/health") {
    return json({ ok: true, environment: env.APP_ENV, time: new Date().toISOString() });
  }
  if (!pathname.startsWith("/v1/")) return error("Not found", 404);
  if (!(await authorize(request, env))) return error("Unauthorized", 401);

  if (request.method === "POST" && pathname === "/v1/watches") {
    const input = parseCreateWatchBody(await readJson(request));
    const watch = await createWatch(env.DB, input);
    return json({ data: watch }, 201);
  }

  if (request.method === "GET" && pathname === "/v1/watches") {
    const limit = integerParam(url.searchParams.get("limit"), 25);
    const watches = await listWatches(env.DB, limit, url.searchParams.get("cursor") ?? undefined);
    return json({ data: watches, next_cursor: watches.length === limit ? watches.at(-1)?.id : null });
  }

  if (request.method === "GET" && pathname === "/v1/events") {
    const limit = integerParam(url.searchParams.get("limit"), 25);
    const events = await listEvents(env.DB, limit, url.searchParams.get("watch_id") ?? undefined);
    return json({ data: events });
  }

  const runMatch = pathname.match(/^\/v1\/watches\/([^/]+)\/run$/);
  if (request.method === "POST" && runMatch) {
    const watch = await getWatch(env.DB, decodeURIComponent(runMatch[1]));
    if (!watch) return error("Watch not found", 404);
    const result = await runWatch(env, watch);
    return json({ data: result });
  }

  const watchMatch = pathname.match(/^\/v1\/watches\/([^/]+)$/);
  if (request.method === "GET" && watchMatch) {
    const watch = await getWatch(env.DB, decodeURIComponent(watchMatch[1]));
    return watch ? json({ data: watch }) : error("Watch not found", 404);
  }

  return error("Not found", 404);
}

async function runScheduled(env: Env): Promise<void> {
  const watches = await listDueWatches(env.DB, new Date().toISOString());
  for (const watch of watches) {
    try {
      const result = await runWatch(env, watch);
      console.log(JSON.stringify({ event: "scheduled_watch_completed", ...result }));
    } catch (caught) {
      console.error(
        JSON.stringify({
          event: "scheduled_watch_failed",
          watchId: watch.id,
          error: caught instanceof Error ? caught.message : String(caught),
        }),
      );
    }
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      if (request.method === "OPTIONS") {
        const origin = allowedOrigin(request);
        return origin ? withCors(request, new Response(null, { status: 204 })) : error("Origin not allowed", 403);
      }
      const response = await route(request, env);
      response.headers.set("x-request-id", requestId);
      response.headers.set("x-content-type-options", "nosniff");
      return withCors(request, response);
    } catch (caught) {
      if (caught instanceof HttpError) return withCors(request, error(caught.message, caught.status, caught.details));
      console.error(JSON.stringify({ event: "request_failed", requestId, error: String(caught) }));
      return withCors(request, error("Internal server error", 500));
    }
  },

  async scheduled(_controller, env): Promise<void> {
    await runScheduled(env);
  },
} satisfies ExportedHandler<Env>;

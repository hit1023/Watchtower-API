const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: JSON_HEADERS });
}

export function error(message: string, status: number, details?: unknown): Response {
  return json({ error: { message, details } }, status);
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Request body is not valid JSON");
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function safeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([digest(left), digest(right)]);
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}

export async function authorize(request: Request, env: Env): Promise<boolean> {
  const configured = Reflect.get(env, "WATCHTOWER_API_KEY");
  if (typeof configured !== "string" || configured.length < 24) {
    const host = new URL(request.url).hostname;
    return env.APP_ENV === "development" && (host === "localhost" || host === "127.0.0.1");
  }
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice(7), configured);
}

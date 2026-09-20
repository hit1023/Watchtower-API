import { HttpError } from "./http";

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^224\./,
  /^240\./,
];

function isUnsafeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "[::1]" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  return PRIVATE_V4.some((pattern) => pattern.test(host));
}

export function validatePublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "url must be an absolute HTTP or HTTPS URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HttpError(400, "Only HTTP and HTTPS URLs are supported");
  }
  if (url.username || url.password) throw new HttpError(400, "URLs containing credentials are not supported");
  if (isUnsafeHost(url.hostname)) throw new HttpError(400, "Private or local network targets are not allowed");
  return url;
}

export async function fetchPublicUrl(
  input: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ response: Response; bytes: Uint8Array; truncated: boolean }> {
  let current = validatePublicUrl(input);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.1",
          "user-agent": "WatchtowerBot/0.1 (+https://watchtower.invalid/bot)",
        },
      });
    } catch (cause) {
      throw new HttpError(502, "Unable to fetch monitored URL", String(cause));
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new HttpError(502, "Redirect response did not include a Location header");
      current = validatePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new HttpError(502, `Monitored URL returned HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) throw new HttpError(413, `Response exceeds ${maxBytes} bytes`);
    if (!response.body) return { response, bytes: new Uint8Array(), truncated: false };

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - total;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.slice(0, remaining));
        total = maxBytes;
        truncated = true;
        await reader.cancel("response limit reached");
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { response, bytes, truncated };
  }
  throw new HttpError(502, "Too many redirects");
}

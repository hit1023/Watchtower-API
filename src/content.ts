function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableJson(item)]),
    );
  }
  return value;
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function htmlToText(html: string): Promise<string> {
  const parts: string[] = [];
  const sanitized = await new HTMLRewriter()
    .on("script,style,noscript,svg,canvas,template", {
      element(element) {
        element.remove();
      },
    })
    .transform(new Response(html))
    .text();
  const transformed = new HTMLRewriter()
    .on("body", {
      text(text) {
        parts.push(text.text);
        if (text.lastInTextNode) parts.push("\n");
      },
    })
    .transform(new Response(sanitized));
  await transformed.arrayBuffer();
  return normalizeWhitespace(parts.join(""));
}

export async function normalizeContent(bytes: Uint8Array, contentType: string): Promise<string> {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const type = contentType.toLowerCase();
  if (type.includes("application/json")) {
    try {
      return JSON.stringify(stableJson(JSON.parse(decoded)), null, 2);
    } catch {
      return normalizeWhitespace(decoded);
    }
  }
  if (type.includes("text/html") || type.includes("application/xhtml+xml")) return htmlToText(decoded);
  return normalizeWhitespace(decoded);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function summarizeDifference(before: string, after: string): { before: string; after: string; ratio: number } {
  let prefix = 0;
  const shortest = Math.min(before.length, after.length);
  while (prefix < shortest && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < shortest - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const beforeChanged = before.slice(prefix, before.length - suffix || undefined).trim();
  const afterChanged = after.slice(prefix, after.length - suffix || undefined).trim();
  const changed = Math.max(beforeChanged.length, afterChanged.length);
  const ratio = Math.min(1, changed / Math.max(before.length, after.length, 1));
  return {
    before: beforeChanged.slice(0, 1200),
    after: afterChanged.slice(0, 1200),
    ratio,
  };
}

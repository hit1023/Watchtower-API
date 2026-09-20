import { describe, expect, it } from "vitest";
import { normalizeContent, sha256, summarizeDifference } from "../src/content";

describe("content normalization", () => {
  it("removes scripts and collapses whitespace from HTML", async () => {
    const html = new TextEncoder().encode(
      "<html><body><h1> Price </h1><script>ignore me</script><p>$10   per month</p></body></html>",
    );
    const normalized = await normalizeContent(html, "text/html");
    expect(normalized).toContain("Price");
    expect(normalized).toContain("$10 per month");
    expect(normalized).not.toContain("ignore me");
  });

  it("sorts JSON keys for stable snapshots", async () => {
    const left = await normalizeContent(new TextEncoder().encode('{"b":2,"a":1}'), "application/json");
    const right = await normalizeContent(new TextEncoder().encode('{"a":1,"b":2}'), "application/json");
    expect(left).toBe(right);
    expect(await sha256(left)).toBe(await sha256(right));
  });

  it("extracts the changed section", () => {
    const difference = summarizeDifference("Plan costs $10 monthly", "Plan costs $12 monthly");
    expect(difference.before).toBe("0");
    expect(difference.after).toBe("2");
    expect(difference.ratio).toBeGreaterThan(0);
  });
});

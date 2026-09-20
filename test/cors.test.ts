import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("CORS", () => {
  it("allows the Watchtower frontend origin", async () => {
    const request = new Request("https://watchtower-api.s-quad.com/v1/watches", {
      method: "OPTIONS",
      headers: { origin: "https://watchtower.s-quad.com" },
    });
    const response = await SELF.fetch(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://watchtower.s-quad.com");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("rejects untrusted origins", async () => {
    const request = new Request("https://watchtower-api.s-quad.com/v1/watches", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example" },
    });
    const response = await SELF.fetch(request);
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

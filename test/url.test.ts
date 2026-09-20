import { describe, expect, it } from "vitest";
import { validatePublicUrl } from "../src/url";

describe("public URL validation", () => {
  it("accepts public HTTPS URLs", () => {
    expect(validatePublicUrl("https://example.com/pricing").toString()).toBe("https://example.com/pricing");
  });

  it.each([
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "file:///etc/passwd",
    "https://user:password@example.com/",
  ])("rejects unsafe target %s", (url) => {
    expect(() => validatePublicUrl(url)).toThrow();
  });
});

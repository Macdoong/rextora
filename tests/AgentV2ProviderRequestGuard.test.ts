import { describe, expect, it } from "vitest";
import { assertLocalOperatorRequest } from "@/src/lib/rextora/agent/v2/providers/providerRequestGuard";

function req(init: {
  host?: string;
  origin?: string | null;
  contentLength?: string;
}): Request {
  const headers = new Headers();
  if (init.host) headers.set("host", init.host);
  if (init.origin) headers.set("origin", init.origin);
  if (init.contentLength) headers.set("content-length", init.contentLength);
  return new Request("http://localhost:3000/api/rextora/settings/ai-providers", {
    method: "GET",
    headers,
  });
}

describe("AI provider request guard", () => {
  it("allows localhost host", () => {
    expect(assertLocalOperatorRequest(req({ host: "localhost:3000" })).ok).toBe(
      true,
    );
  });

  it("rejects non-local host", () => {
    const result = assertLocalOperatorRequest(
      req({ host: "evil.example.com" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects non-local origin", () => {
    const result = assertLocalOperatorRequest(
      req({ host: "localhost:3000", origin: "https://evil.example.com" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects oversized bodies", () => {
    const result = assertLocalOperatorRequest(
      req({ host: "localhost:3000", contentLength: "999999" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });
});

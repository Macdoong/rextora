/**
 * API confirmation gate for demo init/reset — no store mutation without confirm.
 */
import { describe, expect, it } from "vitest";
import { authedRequest } from "./helpers/authSession";

describe("first-run API confirmation contract", () => {
  it("demo route rejects missing confirm", async () => {
    const { POST } = await import("../app/api/rextora/first-run/demo/route");
    const res = await POST(
      await authedRequest("http://localhost/api/rextora/first-run/demo", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }, "ceo"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(String(json.error)).toMatch(/confirm/i);
  });

  it("demo reset route rejects missing confirm", async () => {
    const { POST } = await import("../app/api/rextora/first-run/demo/reset/route");
    const res = await POST(
      await authedRequest("http://localhost/api/rextora/first-run/demo/reset", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }, "ceo"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});

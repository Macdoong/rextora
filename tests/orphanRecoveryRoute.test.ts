import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/rextora/internal/orphan-recovery/route";

describe("orphan recovery internal route", () => {
  it("rejects non-local boot requests", async () => {
    const response = await POST(
      new NextRequest("http://example.com/api/rextora/internal/orphan-recovery", {
        method: "POST",
        headers: { "x-rextora-boot": "1", host: "example.com" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("accepts localhost boot requests and returns recovery summary", async () => {
    const response = await POST(
      new NextRequest("http://127.0.0.1:3100/api/rextora/internal/orphan-recovery", {
        method: "POST",
        headers: { "x-rextora-boot": "1", host: "127.0.0.1:3100" },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.resumed)).toBe(true);
    expect(Array.isArray(body.errors)).toBe(true);
  });
});

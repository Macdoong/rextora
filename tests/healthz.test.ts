import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as healthzGet } from "../app/healthz/route";
import { GET as agentHealthGet } from "../app/api/rextora/agent/health/route";
import { isPublicPath, proxy } from "../proxy";
import { AUTH_ERROR } from "../src/lib/rextora/auth/authTypes";

describe("/healthz Render health check", () => {
  it("GET /healthz returns HTTP 200 with status ok", async () => {
    const res = healthzGet();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });

  it("treats exactly /healthz as public and does not broaden other paths", () => {
    expect(isPublicPath("/healthz")).toBe(true);
    expect(isPublicPath("/healthz/")).toBe(false);
    expect(isPublicPath("/healthz/ready")).toBe(false);
    expect(isPublicPath("/api/rextora/agent/health")).toBe(false);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/settings")).toBe(false);
    expect(isPublicPath("/login")).toBe(true);
  });

  it("proxy allows unauthenticated /healthz and still redirects protected pages", () => {
    const health = proxy(new NextRequest("http://localhost/healthz"));
    expect(health.status).toBe(200);
    expect(health.headers.get("location")).toBeNull();

    const dashboard = proxy(new NextRequest("http://localhost/dashboard"));
    expect(dashboard.status).toBeGreaterThanOrEqual(300);
    expect(dashboard.status).toBeLessThan(400);
    expect(dashboard.headers.get("location") ?? "").toContain("/login");
  });

  it("keeps GET /api/rextora/agent/health authenticated", async () => {
    const res = await agentHealthGet(new Request("http://localhost/api/rextora/agent/health"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe(AUTH_ERROR.unauthenticated);
  });
});

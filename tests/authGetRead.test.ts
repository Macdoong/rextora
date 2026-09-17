import { describe, expect, it } from "vitest";
import { GET as meGet } from "../app/api/rextora/auth/me/route";
import { GET as strategiesGet } from "../app/api/rextora/strategies/route";
import { GET as backtestGet } from "../app/api/rextora/backtest/run/route";
import { GET as researchGet } from "../app/api/rextora/strategy-search/route";
import { GET as paperGet } from "../app/api/rextora/paper/session/route";
import { GET as dashboardGet } from "../app/api/rextora/trading/dashboard/route";
import { GET as riskGet } from "../app/api/rextora/risk/route";
import { GET as settingsGet } from "../app/api/rextora/settings/route";
import { GET as approveGet } from "../app/api/rextora/strategy/approve/route";
import { GET as agentSessionGet } from "../app/api/rextora/agent/session/route";
import { GET as legacyPositionsGet } from "../app/api/bot/status/route";
import { POST as researchPost } from "../app/api/rextora/strategy-search/route";
import { POST as approvePost } from "../app/api/rextora/strategy/approve/route";
import { POST as botStartPost } from "../app/api/rextora/bot/start/route";
import { AUTH_ERROR } from "../src/lib/rextora/auth/authTypes";
import { permissionsForRole } from "../src/lib/rextora/auth/permissions";
import { loadSettings } from "../src/lib/rextora/settings/settingsStore";
import { authedRequest } from "./helpers/authSession";
import type { RextoraRole } from "../src/lib/rextora/auth/authTypes";

async function jsonOf(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

function secretFree(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toMatch(/passwordHash/);
  expect(text).not.toMatch(/tokenHash/);
  expect(text).not.toMatch(/"sessionToken"/);
  expect(text).not.toMatch(/BINANCE_API_SECRET|apiSecret|apiKeyOverride/);
  expect(text).not.toMatch(/REXTORA_LIVE_CONFIRMATION_TEXT/);
}

describe("authenticated GET reads", () => {
  it("1-9. unauthenticated application GETs are 401", async () => {
    const cases: Array<[string, (req: Request) => Promise<Response>]> = [
      ["strategies", strategiesGet],
      ["backtest", backtestGet],
      ["research", researchGet],
      ["paper", paperGet],
      ["positions", legacyPositionsGet],
      ["risk", riskGet],
      ["settings", settingsGet],
      ["approval", approveGet],
      ["agent", agentSessionGet],
    ];
    for (const [name, handler] of cases) {
      const res = await handler(new Request(`http://localhost/api/${name}`));
      expect(res.status, name).toBe(401);
      const body = await jsonOf(res);
      expect(body.code, name).toBe(AUTH_ERROR.unauthenticated);
      secretFree(body);
    }
  });

  it("10-12. viewer, operator, and ceo can perform normal reads", async () => {
    for (const role of ["viewer", "operator", "ceo"] as RextoraRole[]) {
      const reads = [
        await strategiesGet(await authedRequest("http://localhost/api/rextora/strategies", {}, role)),
        await backtestGet(await authedRequest("http://localhost/api/rextora/backtest/run", {}, role)),
        await researchGet(await authedRequest("http://localhost/api/rextora/strategy-search", {}, role)),
        await paperGet(await authedRequest("http://localhost/api/rextora/paper/session", {}, role)),
        await dashboardGet(await authedRequest("http://localhost/api/rextora/trading/dashboard", {}, role)),
        await riskGet(await authedRequest("http://localhost/api/rextora/risk", {}, role)),
        await settingsGet(await authedRequest("http://localhost/api/rextora/settings", {}, role)),
        await approveGet(await authedRequest("http://localhost/api/rextora/strategy/approve", {}, role)),
      ];
      for (const res of reads) {
        expect(res.status, role).not.toBe(401);
        expect(res.status, role).not.toBe(403);
        const body = await jsonOf(res);
        secretFree(body);
      }
    }
  });

  it("13-17. /me stays 401 unauthenticated and returns a safe user when authenticated", async () => {
    const unauth = await meGet(new Request("http://localhost/api/rextora/auth/me"));
    expect(unauth.status).toBe(401);
    const unauthBody = await jsonOf(unauth);
    expect(unauthBody.code).toBe(AUTH_ERROR.unauthenticated);
    secretFree(unauthBody);

    const auth = await meGet(await authedRequest("http://localhost/api/rextora/auth/me", {}, "viewer"));
    expect(auth.status).toBe(200);
    const body = await jsonOf(auth);
    const data = body.data as { user?: Record<string, unknown> };
    expect(data.user?.role).toBe("viewer");
    expect(data.user?.username).toBe("temp_viewer");
    expect(data.user).not.toHaveProperty("passwordHash");
    secretFree(body);
  });

  it("18-21. mutation authorization remains unchanged", async () => {
    const viewerMut = await researchPost(
      await authedRequest(
        "http://localhost/api/rextora/strategy-search",
        { method: "POST", body: "{}" },
        "viewer",
      ),
    );
    expect(viewerMut.status).toBe(403);

    const operatorApprove = await approvePost(
      await authedRequest(
        "http://localhost/api/rextora/strategy/approve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        },
        "operator",
      ),
    );
    expect(operatorApprove.status).not.toBe(401);
    expect(operatorApprove.status).not.toBe(403);
    expect(permissionsForRole("operator")).toContain("live:approve");
    expect(permissionsForRole("viewer")).toEqual([]);

    const ceoStart = await botStartPost(
      await authedRequest(
        "http://localhost/api/rextora/bot/start",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "LIVE" }),
        },
        "ceo",
      ),
    );
    expect(ceoStart.status).not.toBe(401);
    expect(permissionsForRole("ceo")).toContain("live:start");
    const flags = loadSettings().trading;
    expect(flags.liveTradingEnabled).toBe(false);
    expect(flags.allowLiveTrading).toBe(false);
  });
});

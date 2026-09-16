import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST as approvePost } from "../app/api/rextora/strategy/approve/route";
import { POST as botStartPost } from "../app/api/rextora/bot/start/route";
import { POST as emergencyPost } from "../app/api/rextora/emergency/route";
import { POST as riskPost } from "../app/api/rextora/risk/route";
import { PUT as settingsPut } from "../app/api/rextora/settings/route";
import { DELETE as credentialDelete } from "../app/api/rextora/settings/ai-providers/credential/route";
import { POST as researchPost } from "../app/api/rextora/strategy-search/route";
import { POST as backtestPost } from "../app/api/rextora/backtest/run/route";
import { POST as paperPost } from "../app/api/rextora/paper/session/route";
import { AUTH_ERROR } from "../src/lib/rextora/auth/authTypes";
import { loadSettings } from "../src/lib/rextora/settings/settingsStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategyRepository";
import { authedRequest } from "./helpers/authSession";

async function jsonOf(res: Response) {
  return (await res.json()) as { ok?: boolean; code?: string; error?: string; message?: string };
}

describe("auth authorization and actor trust", () => {
  it("15. unauthenticated mutation is 401", async () => {
    const res = await researchPost(
      new Request("http://localhost/api/rextora/strategy-search", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(401);
    const body = await jsonOf(res);
    expect(body.code).toBe(AUTH_ERROR.unauthenticated);
  });

  it("16. viewer mutation is 403", async () => {
    const res = await researchPost(
      await authedRequest(
        "http://localhost/api/rextora/strategy-search",
        { method: "POST", body: "{}" },
        "viewer",
      ),
    );
    expect(res.status).toBe(403);
  });

  it("17-19. operator research/backtest/paper authorization is available", async () => {
    const research = await researchPost(
      await authedRequest(
        "http://localhost/api/rextora/strategy-search",
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
        "operator",
      ),
    );
    expect(research.status).not.toBe(401);
    expect(research.status).not.toBe(403);
    const backtest = await backtestPost(
      await authedRequest(
        "http://localhost/api/rextora/backtest/run",
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
        "operator",
      ),
    );
    expect(backtest.status).not.toBe(401);
    expect(backtest.status).not.toBe(403);
    const paper = await paperPost(
      await authedRequest(
        "http://localhost/api/rextora/paper/session",
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
        "operator",
      ),
    );
    expect(paper.status).not.toBe(401);
    expect(paper.status).not.toBe(403);
  });

  it("20-22. operator can request live approval but cannot approve or start live", async () => {
    const request = await approvePost(
      await authedRequest(
        "http://localhost/api/rextora/strategy/approve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "request", strategyId: SAFE_STRATEGY_ID }),
        },
        "operator",
      ),
    );
    expect(request.status).not.toBe(401);
    expect(request.status).not.toBe(403);
    const approve = await approvePost(
      await authedRequest(
        "http://localhost/api/rextora/strategy/approve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve", requestId: "missing" }),
        },
        "operator",
      ),
    );
    expect(approve.status).toBe(403);
    const start = await botStartPost(
      await authedRequest(
        "http://localhost/api/rextora/bot/start",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "LIVE" }),
        },
        "operator",
      ),
    );
    expect(start.status).toBe(403);
    const body = await jsonOf(start);
    expect(body.code).toBe(AUTH_ERROR.forbidden);
  });

  it("23-25. ceo live approve/start pass auth; flags still block execution", async () => {
    const approve = await approvePost(
      await authedRequest(
        "http://localhost/api/rextora/strategy/approve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve", requestId: "missing" }),
        },
        "ceo",
      ),
    );
    expect(approve.status).not.toBe(401);
    expect(approve.status).not.toBe(403);
    const start = await botStartPost(
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
    expect(start.status).not.toBe(401);
    const started = await jsonOf(start);
    expect(started.code).not.toBe(AUTH_ERROR.unauthenticated);
    expect(started.code).not.toBe(AUTH_ERROR.forbidden);
    const flags = loadSettings().trading;
    expect(flags.liveTradingEnabled).toBe(false);
    expect(flags.allowLiveTrading).toBe(false);
  });

  it("26-27. emergency stop is operator-allowed and viewer-blocked", async () => {
    const operator = await emergencyPost(
      await authedRequest(
        "http://localhost/api/rextora/emergency",
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
        "operator",
      ),
    );
    expect(operator.status).not.toBe(401);
    expect(operator.status).not.toBe(403);
    const viewer = await emergencyPost(
      await authedRequest(
        "http://localhost/api/rextora/emergency",
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
        "viewer",
      ),
    );
    expect(viewer.status).toBe(403);
  });

  it("28-30. credential, risk, and live flags are CEO only", async () => {
    const credential = await credentialDelete(
      await authedRequest(
        "http://localhost/api/rextora/settings/ai-providers/credential",
        { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" },
        "operator",
      ),
    );
    expect(credential.status).toBe(403);
    const risk = await riskPost(
      await authedRequest(
        "http://localhost/api/rextora/risk",
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
        "operator",
      ),
    );
    expect(risk.status).toBe(403);
    const flags = await settingsPut(
      await authedRequest(
        "http://localhost/api/rextora/settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trading: { liveTradingEnabled: true, allowLiveTrading: true } }),
        },
        "operator",
      ),
    );
    expect(flags.status).toBe(403);
    const ceoSettings = await settingsPut(
      await authedRequest(
        "http://localhost/api/rextora/settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "export" }),
        },
        "ceo",
      ),
    );
    expect(ceoSettings.status).not.toBe(401);
    expect(ceoSettings.status).not.toBe(403);
  });

  it("31-36. client actor fields are rejected and session identity is used", async () => {
    const spoof = await approvePost(
      await authedRequest(
        "http://localhost/api/rextora/strategy/approve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "request",
            strategyId: SAFE_STRATEGY_ID,
            requestedBy: "CEO",
          }),
        },
        "operator",
      ),
    );
    expect(spoof.status).toBe(400);
    const spoofBody = await jsonOf(spoof);
    expect(spoofBody.code).toBe(AUTH_ERROR.client_actor_rejected);

    const reviewed = await approvePost(
      await authedRequest(
        "http://localhost/api/rextora/strategy/approve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve", requestId: "x", reviewedBy: "CEO" }),
        },
        "ceo",
      ),
    );
    expect(reviewed.status).toBe(400);

    const revoked = await approvePost(
      await authedRequest(
        "http://localhost/api/rextora/strategy/approve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "revoke", requestId: "x", revokedBy: "CEO" }),
        },
        "ceo",
      ),
    );
    expect(revoked.status).toBe(400);

    const created = await approvePost(
      await authedRequest(
        "http://localhost/api/rextora/strategy/approve",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "request", strategyId: SAFE_STRATEGY_ID }),
        },
        "operator",
      ),
    );
    const createdJson = (await created.json()) as {
      data?: { request?: { requestedBy?: string; requestId?: string } };
      request?: { requestedBy?: string; requestId?: string };
    };
    const request =
      createdJson.data?.request ?? createdJson.request ?? (createdJson as { request?: { requestedBy?: string } }).request;
    expect(request?.requestedBy).toBe("temp_operator");
    expect(request?.requestedBy).not.toBe("CEO");
    expect(request?.requestedBy).not.toBe("operator");
  });

  it("43-44. CSRF origin is enforced", async () => {
    const cross = await researchPost(
      await authedRequest(
        "http://localhost/api/rextora/strategy-search",
        {
          method: "POST",
          headers: { origin: "https://evil.example", "content-type": "application/json" },
          body: "{}",
        },
        "operator",
      ),
    );
    expect(cross.status).toBe(403);
    const body = await jsonOf(cross);
    expect(body.code).toBe(AUTH_ERROR.origin_rejected);

    const same = await researchPost(
      await authedRequest(
        "http://localhost/api/rextora/strategy-search",
        {
          method: "POST",
          headers: { origin: "http://localhost", "content-type": "application/json" },
          body: "{}",
        },
        "operator",
      ),
    );
    expect(same.status).not.toBe(401);
    expect(same.status).not.toBe(403);
  });

  it("54. tests do not write production auth stores", () => {
    const prod = path.join(process.cwd(), "data/rextora");
    expect(process.env.REXTORA_DATA_DIR).toBeTruthy();
    expect(path.resolve(process.env.REXTORA_DATA_DIR!)).not.toBe(path.resolve(prod));
    expect(path.resolve(process.env.REXTORA_DATA_DIR!)).not.toContain(
      path.join("data", "rextora"),
    );
  });
});

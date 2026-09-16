import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approveLiveApprovalRequest,
  findPendingLiveApprovalRequest,
  getLiveApprovalWorkflowView,
  listLiveApprovalHistory,
  rejectLiveApprovalRequest,
  requestLiveApproval,
  revokeLiveApprovalRequest,
} from "../src/lib/rextora/live/liveApprovalWorkflow";
import { GET, POST } from "../app/api/rextora/strategy/approve/route";
import {
  getStrategyLiveApprovalState,
  revokeStrategyLiveApproval,
} from "../src/lib/rextora/strategyLiveApproval";
import { invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";
import { loadSettings } from "../src/lib/rextora/settings/settingsStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategyRepository";
import { authedRequest } from "./helpers/authSession";

const ROOT = path.resolve(__dirname, "..");
const SAFE_PATH = path.join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const CONFIRM = "temp-live-approval-confirm";
const PREV_CONFIRM = process.env.REXTORA_LIVE_CONFIRMATION_TEXT;

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function liveFlags() {
  const trading = loadSettings().trading;
  return {
    liveTradingEnabled: trading.liveTradingEnabled === true,
    allowLiveTrading: trading.allowLiveTrading === true,
  };
}

function workflowSource(): string {
  return fs.readFileSync(
    path.join(ROOT, "src/lib/rextora/live/liveApprovalWorkflow.ts"),
    "utf8",
  );
}

async function jsonResponse(res: Response): Promise<{
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
  error?: string;
}> {
  const body = (await res.json()) as {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: string;
  };
  return {
    ok: body.ok,
    status: res.status,
    data: body.data ?? {},
    error: body.error,
  };
}

describe("Live approval workflow", () => {
  beforeEach(async () => {
    process.env.REXTORA_LIVE_CONFIRMATION_TEXT = CONFIRM;
    invalidateJsonStoreCache();
    revokeStrategyLiveApproval();
    const historyFile = path.join(
      process.env.REXTORA_DATA_DIR ?? "",
      "strategy-live-approval-history.json",
    );
    if (process.env.REXTORA_DATA_DIR) {
      fs.mkdirSync(process.env.REXTORA_DATA_DIR, { recursive: true });
      fs.writeFileSync(
        historyFile,
        JSON.stringify({ version: 1, requests: [] }, null, 2),
      );
    }
    invalidateJsonStoreCache("strategy-live-approval-history.json");
    invalidateJsonStoreCache("strategy-live-approval.json");
  });

  afterEach(() => {
    if (PREV_CONFIRM === undefined) delete process.env.REXTORA_LIVE_CONFIRMATION_TEXT;
    else process.env.REXTORA_LIVE_CONFIRMATION_TEXT = PREV_CONFIRM;
  });

  it("1-8. request creates pending without Live or exchange side effects", async () => {
    const created = await requestLiveApproval({
      strategyId: SAFE_STRATEGY_ID,
      backtestRunId: "bt_mt1kh58k_762ad9",
      paperSessionId: "paper_temp_session",
      symbol: "btcusdt",
      requestReason: "operator review",
    });
    expect(created.ok).toBe(true);
    expect(created.request?.status).toBe("pending");
    expect(created.request?.requestId).toMatch(/^lar_/);
    expect(created.snapshot.verifiedForLive).toBe(false);
    expect(liveFlags()).toEqual({
      liveTradingEnabled: false,
      allowLiveTrading: false,
    });
    expect(workflowSource()).not.toMatch(/fapi\.binance\.com|\/fapi\/v1\/order/);
    expect(created.request?.strategyId).toBe(SAFE_STRATEGY_ID);
    expect(created.request?.backtestRunId).toBe("bt_mt1kh58k_762ad9");
    expect(created.request?.paperSessionId).toBe("paper_temp_session");
    expect(created.request?.symbol).toBe("BTCUSDT");
    expect(created.request?.requestedBy).toBeNull();

    const duplicate = await requestLiveApproval({
      strategyId: SAFE_STRATEGY_ID,
      backtestRunId: "bt_mt1kh58k_762ad9",
      paperSessionId: "paper_temp_session",
      symbol: "BTCUSDT",
    });
    expect(duplicate.conflict).toBe(true);
    expect(duplicate.request?.requestId).toBe(created.request?.requestId);
    expect(listLiveApprovalHistory().filter((row) => row.status === "pending")).toHaveLength(1);

    const unknown = await requestLiveApproval({ strategyId: "custom_does_not_exist" });
    expect(unknown.ok).toBe(false);
    expect(unknown.code).toBe("unknown_target");
    const malformed = await requestLiveApproval({ strategyId: "../SAFE" });
    expect(malformed.ok).toBe(false);
  });

  it("9-15. pending approve updates canonical snapshot once and not Live flags", async () => {
    const created = await requestLiveApproval({ strategyId: SAFE_STRATEGY_ID });
    const requestId = created.request?.requestId;
    expect(requestId).toBeTruthy();
    const approved = await approveLiveApprovalRequest({
      requestId,
      confirmationText: CONFIRM,
      reviewReason: "checked",
    });
    expect(approved.ok).toBe(true);
    expect(approved.request?.status).toBe("approved");
    expect(approved.snapshot.verifiedForLive).toBe(true);
    expect(approved.snapshot.approvedAt).toBeTruthy();
    expect(approved.snapshot.approvedBy).toBeNull();
    expect(approved.request?.reviewedBy).toBeNull();
    expect(approved.request?.reviewedAt).toBeTruthy();
    expect(liveFlags()).toEqual({
      liveTradingEnabled: false,
      allowLiveTrading: false,
    });
    expect(workflowSource()).not.toMatch(/startLive|placeOrder|createOrder/);
    const again = await approveLiveApprovalRequest({
      requestId,
      confirmationText: CONFIRM,
    });
    expect(again.idempotent).toBe(true);
    expect(again.request?.reviewedAt).toBe(approved.request?.reviewedAt);
  });

  it("15b. approvedBy persists only when an identity is supplied", async () => {
    const created = await requestLiveApproval({
      strategyId: SAFE_STRATEGY_ID,
      requestedBy: "reviewer-fixture",
    });
    const approved = await approveLiveApprovalRequest({
      requestId: created.request?.requestId,
      confirmationText: CONFIRM,
      reviewedBy: "reviewer-fixture",
    });
    expect(approved.snapshot.approvedBy).toBe("reviewer-fixture");
    expect(approved.request?.reviewedBy).toBe("reviewer-fixture");
    expect(approved.request?.requestedBy).toBe("reviewer-fixture");
  });

  it("16-19. reject stays in history and never grants verifiedForLive", async () => {
    const created = await requestLiveApproval({ strategyId: SAFE_STRATEGY_ID });
    const rejected = await rejectLiveApprovalRequest({
      requestId: created.request?.requestId,
      reviewReason: "not enough evidence",
    });
    expect(rejected.ok).toBe(true);
    expect(rejected.request?.status).toBe("rejected");
    expect(rejected.request?.reviewReason).toBe("not enough evidence");
    expect(rejected.snapshot.verifiedForLive).toBe(false);
    expect(listLiveApprovalHistory().some((row) => row.requestId === created.request?.requestId)).toBe(true);
  });

  it("20-23. revoke updates canonical approval and keeps history", async () => {
    const created = await requestLiveApproval({ strategyId: SAFE_STRATEGY_ID });
    const approved = await approveLiveApprovalRequest({
      requestId: created.request?.requestId,
      confirmationText: CONFIRM,
    });
    const revoked = await revokeLiveApprovalRequest({
      requestId: approved.request?.requestId,
      revokeReason: "pause live eligibility",
    });
    expect(revoked.ok).toBe(true);
    expect(revoked.request?.status).toBe("revoked");
    expect(revoked.request?.revokeReason).toBe("pause live eligibility");
    expect(revoked.request?.revokedAt).toBeTruthy();
    expect(revoked.snapshot.verifiedForLive).toBe(false);
    expect(listLiveApprovalHistory()).toHaveLength(1);
    expect(listLiveApprovalHistory()[0]?.status).toBe("revoked");
  });

  it("24-29. invalid transitions stay blocked and new requests get new IDs", async () => {
    const first = await requestLiveApproval({ strategyId: SAFE_STRATEGY_ID });
    const rejected = await rejectLiveApprovalRequest({
      requestId: first.request?.requestId,
    });
    const rejectedApprove = await approveLiveApprovalRequest({
      requestId: rejected.request?.requestId,
      confirmationText: CONFIRM,
    });
    expect(rejectedApprove.ok).toBe(false);
    expect(rejectedApprove.code).toBe("invalid_transition");
    expect(getStrategyLiveApprovalState().verifiedForLive).toBe(false);
    const rejectedAgain = await rejectLiveApprovalRequest({
      requestId: rejected.request?.requestId,
    });
    expect(rejectedAgain.idempotent).toBe(true);
    expect(rejectedAgain.request?.reviewedAt).toBe(rejected.request?.reviewedAt);

    const afterReject = await requestLiveApproval({ strategyId: SAFE_STRATEGY_ID });
    expect(afterReject.request?.requestId).not.toBe(first.request?.requestId);

    const approved = await approveLiveApprovalRequest({
      requestId: afterReject.request?.requestId,
      confirmationText: CONFIRM,
    });
    const revoked = await revokeLiveApprovalRequest({
      requestId: approved.request?.requestId,
    });
    const revokedApprove = await approveLiveApprovalRequest({
      requestId: revoked.request?.requestId,
      confirmationText: CONFIRM,
    });
    expect(revokedApprove.ok).toBe(false);
    expect(revokedApprove.code).toBe("invalid_transition");
    const afterRevoke = await requestLiveApproval({ strategyId: SAFE_STRATEGY_ID });
    expect(afterRevoke.request?.requestId).not.toBe(revoked.request?.requestId);
  });

  it("30-33. history is append-preserving and snapshot stays separate", async () => {
    const a = await requestLiveApproval({
      strategyId: SAFE_STRATEGY_ID,
      requestReason: "first",
    });
    await rejectLiveApprovalRequest({ requestId: a.request?.requestId });
    const b = await requestLiveApproval({
      strategyId: SAFE_STRATEGY_ID,
      requestReason: "second",
    });
    const before = JSON.stringify(listLiveApprovalHistory().find((row) => row.requestId === a.request?.requestId));
    await approveLiveApprovalRequest({
      requestId: b.request?.requestId,
      confirmationText: CONFIRM,
    });
    const after = JSON.stringify(listLiveApprovalHistory().find((row) => row.requestId === a.request?.requestId));
    expect(after).toBe(before);
    const history = listLiveApprovalHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.requestId).toBe(b.request?.requestId);
    expect(history[1]?.requestId).toBe(a.request?.requestId);
    const view = getLiveApprovalWorkflowView();
    expect(view.snapshot.verifiedForLive).toBe(true);
    expect(view.history[0]?.requestId).not.toBe(view.snapshot.strategyId);
    expect(view.latest?.status).toBe("approved");
  });

  it("API request/approve/reject/revoke stay structured and secret-free", async () => {
    const requested = await jsonResponse(
      await POST(
        await authedRequest("http://localhost/api/rextora/strategy/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request",
            strategyId: SAFE_STRATEGY_ID,
            requestReason: "api",
          }),
        }, "ceo"),
      ),
    );
    expect(requested.ok).toBe(true);
    const requestId = (requested.data.request as { requestId?: string } | null)?.requestId;
    expect(requestId).toBeTruthy();
    const loaded = await jsonResponse(
      await GET(await authedRequest("http://localhost/api/rextora/strategy/approve", {}, "ceo")),
    );
    expect(JSON.stringify(loaded)).not.toMatch(/BINANCE_API_|apiSecret|REXTORA_LIVE_CONFIRMATION_TEXT/);
    const approved = await jsonResponse(
      await POST(
        await authedRequest("http://localhost/api/rextora/strategy/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve",
            requestId,
            confirmationText: CONFIRM,
          }),
        }, "ceo"),
      ),
    );
    expect(approved.ok).toBe(true);
    expect((approved.data.approval as { verifiedForLive?: boolean }).verifiedForLive).toBe(true);
    const revoked = await jsonResponse(
      await POST(
        await authedRequest("http://localhost/api/rextora/strategy/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "revoke",
            requestId,
            revokeReason: "api-revoke",
          }),
        }, "ceo"),
      ),
    );
    expect(revoked.ok).toBe(true);
    expect((revoked.data.approval as { verifiedForLive?: boolean }).verifiedForLive).toBe(false);
  });

  it("43-49. SAFE, Live flags, and isolated stores stay safe", async () => {
    expect(process.env.REXTORA_DATA_DIR).toBeTruthy();
    expect(path.resolve(process.env.REXTORA_DATA_DIR!)).not.toContain(
      path.join("data", "rextora"),
    );
    const created = await requestLiveApproval({ strategyId: SAFE_STRATEGY_ID });
    await approveLiveApprovalRequest({
      requestId: created.request?.requestId,
      confirmationText: CONFIRM,
    });
    expect(sha256(SAFE_PATH)).toBe(SAFE_SHA);
    expect(liveFlags()).toEqual({
      liveTradingEnabled: false,
      allowLiveTrading: false,
    });
    expect(workflowSource()).not.toMatch(/runSearchJob|createPaperSession|resumePaper/);
    expect(findPendingLiveApprovalRequest({
      strategyId: SAFE_STRATEGY_ID,
      backtestRunId: null,
      paperSessionId: null,
      symbol: null,
    })).toBeNull();
  });
});

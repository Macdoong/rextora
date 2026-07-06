import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  approveStrategyForLive,
  getEffectiveSafeStrategy,
  getStrategyLiveApprovalState,
  revokeStrategyLiveApproval
} from "../src/lib/rextora/strategyLiveApproval";

const approvalFile = path.join(process.cwd(), "data", "rextora", "strategy-live-approval.json");

describe("strategyLiveApproval", () => {
  beforeEach(() => {
    revokeStrategyLiveApproval("test");
    if (fs.existsSync(approvalFile)) fs.unlinkSync(approvalFile);
  });

  it("keeps verifiedForLive false by default", () => {
    const strategy = getEffectiveSafeStrategy();
    expect(strategy.verifiedForLive).toBe(false);
    expect(getStrategyLiveApprovalState().verifiedForLive).toBe(false);
  });

  it("rejects approval without matching confirmation text", () => {
    const result = approveStrategyForLive("wrong-phrase");
    expect(result.ok).toBe(false);
    expect(getEffectiveSafeStrategy().verifiedForLive).toBe(false);
  });

  it("does not start trading when approval succeeds without full LIVE gate", () => {
    const result = approveStrategyForLive(process.env.REXTORA_LIVE_CONFIRMATION_TEXT ?? "");
    if (result.ok) {
      expect(result.message).toContain("자동매매는 시작되지 않");
    } else {
      expect(result.message).toContain("실전 확인 문구");
    }
  });
});

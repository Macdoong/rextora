/**
 * Terminal approval execution receipts.
 * Once an approvalId has executed, repeats must replay the receipt without
 * tools, providers, commands, or lifecycle mutation.
 */
import fs from "node:fs";

import path from "node:path";
import { rextoraDataRoot } from "@/src/lib/rextora/storage/runtimePaths";

export interface ApprovalExecutionReceipt {
  approvalId: string;
  sessionId: string | null;
  planId: string | null;
  ok: boolean;
  jobId: string | null;
  runId: string | null;
  paperSessionId: string | null;
  summaryKo: string;
  executedAt: string;
  stepToolIds: string[];
  /** True while the first requester owns execution; false after finalize. */
  inFlight?: boolean;
}

function root(): string {
  const override = process.env.REXTORA_AGENT_APPROVAL_RECEIPTS_DIR?.trim();
  return override
    ? path.resolve(override)
    : path.join(rextoraDataRoot(), "agent-approval-receipts");
}

function receiptPath(sessionId: string | null, approvalId: string): string {
  const scope = `${sessionId ?? "global"}__${approvalId}`.replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );
  return path.join(root(), `${scope}.json`);
}

export function readApprovalExecutionReceipt(input: {
  sessionId: string | null;
  approvalId: string;
}): ApprovalExecutionReceipt | null {
  const file = receiptPath(input.sessionId, input.approvalId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as ApprovalExecutionReceipt;
  } catch {
    return null;
  }
}

/**
 * Atomically claim first execution for an approvalId.
 * Concurrent duplicates receive the existing receipt instead of a claim.
 */
export function claimApprovalExecution(input: {
  approvalId: string;
  sessionId: string | null;
  planId: string | null;
}): { claimed: true } | { claimed: false; receipt: ApprovalExecutionReceipt } {
  const dir = root();
  fs.mkdirSync(dir, { recursive: true });
  const file = receiptPath(input.sessionId, input.approvalId);
  const placeholder: ApprovalExecutionReceipt = {
    approvalId: input.approvalId,
    sessionId: input.sessionId,
    planId: input.planId,
    ok: false,
    jobId: null,
    runId: null,
    paperSessionId: null,
    summaryKo: "승인 실행 중",
    executedAt: new Date().toISOString(),
    stepToolIds: [],
    inFlight: true,
  };
  try {
    fs.writeFileSync(file, JSON.stringify(placeholder, null, 2), { flag: "wx" });
    return { claimed: true };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code !== "EEXIST") throw error;
    const existing = readApprovalExecutionReceipt({
      sessionId: input.sessionId,
      approvalId: input.approvalId,
    });
    if (existing) return { claimed: false, receipt: existing };
    // Rare race: file vanished; treat as not executed.
    fs.writeFileSync(file, JSON.stringify(placeholder, null, 2));
    return { claimed: true };
  }
}

export function writeApprovalExecutionReceipt(
  receipt: ApprovalExecutionReceipt,
): ApprovalExecutionReceipt {
  const dir = root();
  fs.mkdirSync(dir, { recursive: true });
  const file = receiptPath(receipt.sessionId, receipt.approvalId);
  const finalized: ApprovalExecutionReceipt = { ...receipt, inFlight: false };
  fs.writeFileSync(file, JSON.stringify(finalized, null, 2));
  return finalized;
}

export function findLatestSessionApprovalReceipt(
  sessionId: string | null,
): ApprovalExecutionReceipt | null {
  if (!sessionId?.trim()) return null;
  const dir = root();
  if (!fs.existsSync(dir)) return null;
  const scopePrefix = `${sessionId}__`.replace(/[^a-zA-Z0-9._-]/g, "_");
  let latest: ApprovalExecutionReceipt | null = null;
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(scopePrefix) || !name.endsWith(".json")) continue;
    try {
      const receipt = JSON.parse(
        fs.readFileSync(path.join(dir, name), "utf8"),
      ) as ApprovalExecutionReceipt;
      if (receipt.inFlight) continue;
      if (!latest || receipt.executedAt > latest.executedAt) latest = receipt;
    } catch {
      continue;
    }
  }
  return latest;
}

export function isApprovalAlreadyExecuted(input: {
  sessionId: string | null;
  approvalId: string | null | undefined;
}): ApprovalExecutionReceipt | null {
  if (!input.approvalId?.trim()) return null;
  const receipt = readApprovalExecutionReceipt({
    sessionId: input.sessionId,
    approvalId: input.approvalId.trim(),
  });
  if (!receipt) return null;
  // In-flight claims are treated as already owned — waiters get the receipt.
  return receipt;
}

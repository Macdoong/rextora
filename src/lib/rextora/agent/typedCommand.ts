/**
 * Typed approval commands for the AI Trading Employee control plane.
 * Draft → validate → approve → execute via existing APIs. Never Live / SAFE / exchange.
 */

import crypto from "node:crypto";
import { hashEngineParameters } from "./canonicalCommandPayload";

export const TYPED_COMMAND_TYPES = [
  "create_strategy_search_job",
  "run_backtest",
  "prepare_paper_session",
] as const;

export type TypedCommandType = (typeof TYPED_COMMAND_TYPES)[number];

export type CommandApprovalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "expired"
  | "superseded";

export type CommandExecutionStatus =
  | "not_started"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped_idempotent";

export interface TypedCommand {
  commandId: string;
  commandType: TypedCommandType;
  requestHash: string;
  idempotencyKey: string;
  parentCommandId: string | null;
  strategyId: string | null;
  strategyHash: string | null;
  jobId: string | null;
  runId: string | null;
  symbol: string | null;
  timeframe: string | null;
  parameters: Record<string, unknown>;
  factsSnapshot: Array<{ labelKo: string; value: string }>;
  approvalStatus: CommandApprovalStatus;
  approvedAt: string | null;
  createdAt: string;
  expiresAt: string;
  executionStatus: CommandExecutionStatus;
  resultReference: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export const TYPED_COMMAND_TTL_MS = 15 * 60 * 1000;

const BLOCKED_TYPES = new Set([
  "start_live",
  "execute_trade",
  "modify_safe",
  "live_order",
]);

export function hashRequest(
  parameters: Record<string, unknown>,
  commandType?: TypedCommandType,
): string {
  return hashEngineParameters(parameters, commandType);
}

export function createTypedCommand(input: {
  commandType: TypedCommandType;
  parameters: Record<string, unknown>;
  strategyId?: string | null;
  strategyHash?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  factsSnapshot?: Array<{ labelKo: string; value: string }>;
  parentCommandId?: string | null;
  ttlMs?: number;
}): TypedCommand {
  if (BLOCKED_TYPES.has(input.commandType as string)) {
    throw new Error("이 명령 유형은 차단되었습니다.");
  }
  if (!TYPED_COMMAND_TYPES.includes(input.commandType)) {
    throw new Error("지원하지 않는 명령 유형입니다.");
  }
  const now = Date.now();
  const requestHash = hashRequest(input.parameters, input.commandType);
  const commandId = `cmd_${crypto.randomBytes(8).toString("hex")}`;
  return {
    commandId,
    commandType: input.commandType,
    requestHash,
    idempotencyKey: `${input.commandType}:${requestHash}`,
    parentCommandId: input.parentCommandId ?? null,
    strategyId: input.strategyId ?? null,
    strategyHash: input.strategyHash ?? null,
    jobId: null,
    runId: null,
    symbol: input.symbol ?? null,
    timeframe: input.timeframe ?? null,
    parameters: input.parameters,
    factsSnapshot: input.factsSnapshot ?? [],
    approvalStatus: "pending_approval",
    approvedAt: null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (input.ttlMs ?? TYPED_COMMAND_TTL_MS)).toISOString(),
    executionStatus: "not_started",
    resultReference: null,
    errorCode: null,
    errorMessage: null,
  };
}

export function validateCommandSchema(command: TypedCommand): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (!command.commandId) issues.push("commandId 없음");
  if (!TYPED_COMMAND_TYPES.includes(command.commandType)) {
    issues.push("허용되지 않은 commandType");
  }
  if (BLOCKED_TYPES.has(command.commandType as string)) {
    issues.push("차단된 commandType");
  }
  if (!command.requestHash || !command.idempotencyKey) {
    issues.push("requestHash/idempotencyKey 없음");
  }
  if (hashRequest(command.parameters, command.commandType) !== command.requestHash) {
    issues.push("parameters가 requestHash와 일치하지 않음 — 재승인 필요");
  }
  if (command.commandType === "run_backtest" && !command.strategyId) {
    issues.push("백테스트는 strategyId가 필요합니다");
  }
  if (command.commandType === "prepare_paper_session" && !command.strategyId) {
    issues.push("Paper 준비는 strategyId가 필요합니다");
  }
  if (command.commandType === "create_strategy_search_job" && !command.parameters) {
    issues.push("탐색 파라미터가 필요합니다");
  }
  return { ok: issues.length === 0, issues };
}

export function isCommandExpired(
  command: TypedCommand,
  nowMs = Date.now(),
): boolean {
  const exp = Date.parse(command.expiresAt);
  return !Number.isFinite(exp) || exp <= nowMs;
}

export function markApproved(command: TypedCommand): TypedCommand {
  return {
    ...command,
    approvalStatus: "approved",
    approvedAt: new Date().toISOString(),
  };
}

export function markExecuted(
  command: TypedCommand,
  patch: Partial<
    Pick<
      TypedCommand,
      | "jobId"
      | "runId"
      | "resultReference"
      | "executionStatus"
      | "errorCode"
      | "errorMessage"
    >
  >,
): TypedCommand {
  return {
    ...command,
    ...patch,
    executionStatus: patch.executionStatus ?? "succeeded",
  };
}

export function markFailed(
  command: TypedCommand,
  errorCode: string,
  errorMessage: string,
): TypedCommand {
  return {
    ...command,
    executionStatus: "failed",
    errorCode,
    errorMessage,
  };
}

/** If parameters changed after draft, prior approval is invalid. */
export function requiresReapproval(
  drafted: TypedCommand,
  nextParameters: Record<string, unknown>,
): boolean {
  return hashRequest(nextParameters, drafted.commandType) !== drafted.requestHash;
}

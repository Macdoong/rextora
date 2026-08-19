/**
 * Typed proposed-action model for the Agent control plane.
 * Phase 1 actions are navigation / plan-draft only — never execute engines.
 */

import crypto from "node:crypto";
import type { AgentActionType } from "./types";

export type ProposedActionType =
  | "open_search"
  | "open_results"
  | "open_backtest"
  | "open_paper_approval"
  | "view_strategy"
  | "view_report"
  | "prepare_search_plan"
  | "navigate";

export type ProposedRiskLevel = "low" | "medium" | "high" | "blocked";

export interface ProposedAction {
  actionId: string;
  actionType: ProposedActionType;
  summary: string;
  reason: string;
  targetRoute: string;
  strategyId: string | null;
  jobId: string | null;
  runId: string | null;
  symbol: string | null;
  timeframe: string | null;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
  riskLevel: ProposedRiskLevel;
  blockedReason: string | null;
  createdAt: string;
  expiresAt: string;
}

export const PROPOSED_ACTION_TTL_MS = 15 * 60 * 1000;

export function createProposedAction(
  input: Omit<
    ProposedAction,
    "actionId" | "createdAt" | "expiresAt"
  > & { actionId?: string; ttlMs?: number },
): ProposedAction {
  const now = Date.now();
  const ttl = input.ttlMs ?? PROPOSED_ACTION_TTL_MS;
  return {
    actionId: input.actionId ?? `pa_${crypto.randomBytes(8).toString("hex")}`,
    actionType: input.actionType,
    summary: input.summary,
    reason: input.reason,
    targetRoute: input.targetRoute,
    strategyId: input.strategyId,
    jobId: input.jobId,
    runId: input.runId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    parameters: input.parameters ?? {},
    requiresApproval: input.requiresApproval,
    riskLevel: input.riskLevel,
    blockedReason: input.blockedReason,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
  };
}

export function isProposedActionExpired(
  action: ProposedAction,
  nowMs = Date.now(),
): boolean {
  const expires = Date.parse(action.expiresAt);
  return !Number.isFinite(expires) || expires <= nowMs;
}

export function proposedActionToCardAction(action: ProposedAction): {
  type: AgentActionType;
  labelKo: string;
  descriptionKo: string;
  href: string;
  requiresApproval: boolean;
} {
  const typeMap: Record<ProposedActionType, AgentActionType> = {
    open_search: "open_search",
    open_results: "view_results",
    open_backtest: "open_backtest",
    open_paper_approval: "open_paper",
    view_strategy: "view_strategy",
    view_report: "view_report",
    prepare_search_plan: "open_search",
    navigate: "navigate",
  };
  return {
    type: typeMap[action.actionType] ?? "navigate",
    labelKo: action.summary,
    descriptionKo: action.reason,
    href: action.targetRoute,
    requiresApproval: action.requiresApproval,
  };
}

/** Map legacy AgentAction into a ProposedAction for session continuity. */
export function proposedFromAgentAction(
  action: {
    type: AgentActionType;
    labelKo: string;
    descriptionKo?: string;
    href?: string;
    requiresApproval: boolean;
  },
  scope?: {
    strategyId?: string | null;
    jobId?: string | null;
    runId?: string | null;
    symbol?: string | null;
    timeframe?: string | null;
  },
  parameters: Record<string, unknown> = {},
): ProposedAction | null {
  if (!action.href || action.type === "none") return null;

  let actionType: ProposedActionType = "navigate";
  if (action.type === "open_search") actionType = "open_search";
  else if (action.type === "view_results" || action.type === "view_recommendation")
    actionType = "open_results";
  else if (action.type === "open_backtest") actionType = "open_backtest";
  else if (action.type === "open_paper") actionType = "open_paper_approval";
  else if (action.type === "view_strategy") actionType = "view_strategy";
  else if (action.type === "view_report") actionType = "view_report";
  else if (action.href.includes("/strategy-search")) actionType = "open_search";
  else if (action.href.includes("/results")) actionType = "open_results";
  else if (action.href.includes("/backtest")) actionType = "open_backtest";
  else if (action.href.includes("/paper-trading"))
    actionType = "open_paper_approval";

  const riskLevel: ProposedRiskLevel =
    actionType === "open_paper_approval"
      ? "medium"
      : actionType === "open_backtest"
        ? "low"
        : "low";

  return createProposedAction({
    actionType,
    summary: action.labelKo,
    reason: action.descriptionKo ?? action.labelKo,
    targetRoute: action.href,
    strategyId: scope?.strategyId ?? null,
    jobId: scope?.jobId ?? null,
    runId: scope?.runId ?? null,
    symbol: scope?.symbol ?? null,
    timeframe: scope?.timeframe ?? null,
    parameters,
    requiresApproval: action.requiresApproval,
    riskLevel,
    blockedReason: null,
  });
}

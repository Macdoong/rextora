/**
 * Bounded multi-turn conversation context for the Agent control plane.
 * Resolves entities across turns without sending unlimited raw history to the LLM.
 */

import type { AgentLifecycleContext, AgentTurn } from "./types";
import type { ProposedAction } from "./proposedAction";
import { isProposedActionExpired } from "./proposedAction";
import type { AgentPlanDraft } from "./planDrafts";
import type { PipelineLifecycleStage } from "./lifecycleStage";
import { sanitizePrimaryUserText } from "./v2/reasoning/userVisibleSanitizer";

export const MAX_HISTORY_TURNS = 6;
export const MAX_HISTORY_CHARS = 280;

export interface ConversationEntityMemory {
  strategyId: string | null;
  strategyLabel: string | null;
  jobId: string | null;
  runId: string | null;
  symbol: string | null;
  timeframe: string | null;
  paperSessionId: string | null;
  /** Pipeline stage string (PipelineLifecycleStage or legacy route). */
  lifecycleStage: string | null;
  previousRecommendation: string | null;
  previousConclusion: string | null;
  previousReason: string | null;
  pendingProposedAction: ProposedAction | null;
  /** Structured pending plan awaiting approval (draft only). */
  pendingPlan: AgentPlanDraft | null;
  /** Pinned operator objective for the session. */
  pinnedObjectiveKo: string | null;
  /** Last inferred pipeline stage. */
  pipelineStage: PipelineLifecycleStage | null;
}

export type FollowUpKind = "none" | "why" | "approve" | "clarify" | "cancel";

export interface BoundedConversationContext {
  entities: ConversationEntityMemory;
  history: AgentTurn[];
  followUpKind: FollowUpKind;
}

export function emptyEntityMemory(): ConversationEntityMemory {
  return {
    strategyId: null,
    strategyLabel: null,
    jobId: null,
    runId: null,
    symbol: null,
    timeframe: null,
    paperSessionId: null,
    lifecycleStage: null,
    previousRecommendation: null,
    previousConclusion: null,
    previousReason: null,
    pendingProposedAction: null,
    pendingPlan: null,
    pinnedObjectiveKo: null,
    pipelineStage: null,
  };
}

function pickStr(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

export function detectFollowUpKind(query: string): FollowUpKind {
  const q = query.trim();
  if (
    /^(왜|왜\?|왜요|왜요\?|왜\s*그래|why\??)$/i.test(q) ||
    /^왜\s*그/i.test(q) ||
    /^왜\s*(이\s*)?(전략|추천|그거|설정)/i.test(q) ||
    /왜\s*(이\s*)?전략이?\s*좋/i.test(q) ||
    /이\s*전략을?\s*왜\s*추천/i.test(q)
  ) {
    return "why";
  }
  if (
    /^(취소|그만|안\s*할래|계획\s*취소|cancel)$/i.test(q) ||
    /^(그\s*)?계획\s*(취소|버려)/i.test(q)
  ) {
    return "cancel";
  }
  if (
    /^(그럼\s*)?(진행해|실행해|그렇게\s*해|승인|승인할게|해줘|가자|ok|okay|yes)$/i.test(
      q,
    ) ||
    /^(진행|실행|승인)\s*(해|하자|할게|해줘)/i.test(q)
  ) {
    return "approve";
  }
  if (/^(뭐라고|다시|자세히|더\s*설명)/i.test(q)) {
    return "clarify";
  }
  return "none";
}

export function sanitizeHistory(raw: AgentTurn[] | undefined): AgentTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t) =>
        t &&
        (t.role === "user" || t.role === "agent") &&
        typeof t.content === "string",
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({
      role: t.role,
      content: String(t.content).slice(0, MAX_HISTORY_CHARS),
      timestamp:
        typeof t.timestamp === "string" ? t.timestamp : new Date().toISOString(),
    }));
}

export function mergeEntityMemory(
  prior: ConversationEntityMemory | null | undefined,
  lifecycle: AgentLifecycleContext | null | undefined,
  patch: Partial<ConversationEntityMemory> = {},
): ConversationEntityMemory {
  const base = prior ?? emptyEntityMemory();
  const pendingRaw =
    patch.pendingProposedAction !== undefined
      ? patch.pendingProposedAction
      : base.pendingProposedAction;
  const pendingOk =
    pendingRaw && !isProposedActionExpired(pendingRaw) ? pendingRaw : null;

  const pendingPlan =
    patch.pendingPlan !== undefined
      ? patch.pendingPlan
      : base.pendingPlan;

  return {
    strategyId:
      pickStr(patch.strategyId) ??
      pickStr(lifecycle?.strategyId) ??
      base.strategyId,
    strategyLabel: pickStr(patch.strategyLabel) ?? base.strategyLabel,
    jobId: pickStr(patch.jobId) ?? pickStr(lifecycle?.jobId) ?? base.jobId,
    runId: pickStr(patch.runId) ?? pickStr(lifecycle?.runId) ?? base.runId,
    symbol: pickStr(patch.symbol) ?? pickStr(lifecycle?.symbol) ?? base.symbol,
    timeframe:
      pickStr(patch.timeframe) ??
      pickStr(lifecycle?.timeframe) ??
      base.timeframe,
    paperSessionId:
      pickStr(patch.paperSessionId) ??
      pickStr(lifecycle?.paperSessionId) ??
      base.paperSessionId,
    lifecycleStage:
      pickStr(patch.lifecycleStage) ??
      pickStr(lifecycle?.route) ??
      base.lifecycleStage,
    previousRecommendation:
      pickStr(patch.previousRecommendation, 200) ?? base.previousRecommendation,
    previousConclusion:
      pickStr(patch.previousConclusion, 280) ?? base.previousConclusion,
    previousReason: pickStr(patch.previousReason, 280) ?? base.previousReason,
    pendingProposedAction: pendingOk,
    pendingPlan,
    pinnedObjectiveKo:
      pickStr(patch.pinnedObjectiveKo, 200) ?? base.pinnedObjectiveKo,
    pipelineStage:
      patch.pipelineStage !== undefined
        ? patch.pipelineStage
        : base.pipelineStage,
  };
}

export function buildBoundedConversationContext(input: {
  query: string;
  history?: AgentTurn[];
  lifecycle?: AgentLifecycleContext | null;
  priorEntities?: ConversationEntityMemory | null;
}): BoundedConversationContext {
  return {
    entities: mergeEntityMemory(input.priorEntities, input.lifecycle),
    history: sanitizeHistory(input.history),
    followUpKind: detectFollowUpKind(input.query),
  };
}

/** Strip raw IDs from operator-facing prose while keeping human labels. */
export function stripInternalIdsFromProse(text: string): string {
  return sanitizePrimaryUserText(text);
}

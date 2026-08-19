/**
 * Reusable primary-text leak detector for Agent V2 acceptance + unit tests.
 * Collapsed developer evidence is out of scope — only primary operator surfaces.
 */

export const KNOWN_FORBIDDEN_LITERALS = [
  "STRATEGY_DEPENDENCIES_REQUIRE_DETACH",
  "STRATEGY_DELETE_BLOCKED",
  "patternConfigLevel",
  "patternSelectionMode",
  "selectedSpaceIds",
  "combinationOperator",
  "failurePolicy",
  "requestHash",
  "idempotencyKey",
  "inform_user",
  "prepare_backtest_plan",
  "prepare_search_plan",
  "prepare_paper_plan",
  "approve_pending",
  "approved_execution",
] as const;

export const KNOWN_INTERNAL_INTENTS = [
  "prepare_backtest",
  "prepare_search",
  "prepare_paper",
  "memory_recall",
  "research_analysis",
  "search_status",
  "cancel_pending",
] as const;

export const KNOWN_TOOL_IDS = [
  "search.create",
  "search.start",
  "search.cancel",
  "search.pause",
  "search.status",
  "backtest.run",
  "paper.prepare",
  "paper.approve_start",
  "paper.pause",
  "paper.resume",
  "paper.stop",
  "strategy.rename",
  "strategy.archive",
  "strategy.restore",
  "strategy.delete",
  "results.promote",
] as const;

export interface PrimaryLeakSurface {
  answer?: string | null;
  executionSummary?: string | null;
  approvalTitle?: string | null;
  approvalDescription?: string | null;
  errorText?: string | null;
  monitoringText?: string | null;
  timestampStatus?: string | null;
  contextStrip?: string | null;
  actionCard?: string | null;
  memoryText?: string | null;
  primaryText?: string | null;
}

export interface PrimaryLeakHit {
  kind:
    | "forbidden_literal"
    | "screaming_snake"
    | "intent_id"
    | "tool_id"
    | "template_directive"
    | "nullish_remnant"
    | "malformed_fragment";
  match: string;
  surface: string;
}

const SCREAMING_SNAKE_RE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const NULLISH_RE = /(?:^|\n)\s*(?:None|null|undefined)\s*\.?\s*(?=\n|$)/gim;
const TEMPLATE_DIRECTIVE_RE = /\b(?:inform_user|respond_to_user|call_tool|tool_call)\b\.?/gi;
const MALFORMED_FRAGMENT_RE = /(?:^|\n)\s*[.。]\s*(?=\n|$)/g;
const FIELD_EQ_RE = /\b(?:symbol|timeframe|patterns|leverageMode|exchangeCalled)\s*=/gi;
const LIFECYCLE_ENUM_RE =
  /\b(?:paper_active|paper_ready|search_running|search_needed|search_failed|results_review|backtest_needed|backtest_review|live_review|pending_approval)\b/gi;
const ENGLISH_APPROVAL_STATE_RE =
  /\b(?:Paper\s+)?approval\s+(?:state|status|pending)\b/gi;

function collectSurface(name: string, text: string | null | undefined, hits: PrimaryLeakHit[]) {
  if (!text?.trim()) return;
  for (const literal of KNOWN_FORBIDDEN_LITERALS) {
    if (text.includes(literal)) {
      hits.push({ kind: "forbidden_literal", match: literal, surface: name });
    }
  }
  for (const intent of KNOWN_INTERNAL_INTENTS) {
    const re = new RegExp(`\\b${intent}\\b`, "i");
    if (re.test(text)) hits.push({ kind: "intent_id", match: intent, surface: name });
  }
  for (const toolId of KNOWN_TOOL_IDS) {
    if (text.includes(toolId)) {
      hits.push({ kind: "tool_id", match: toolId, surface: name });
    }
  }
  for (const match of text.match(SCREAMING_SNAKE_RE) ?? []) {
    hits.push({ kind: "screaming_snake", match, surface: name });
  }
  for (const match of text.match(TEMPLATE_DIRECTIVE_RE) ?? []) {
    hits.push({ kind: "template_directive", match, surface: name });
  }
  for (const match of text.match(NULLISH_RE) ?? []) {
    hits.push({ kind: "nullish_remnant", match: match.trim(), surface: name });
  }
  for (const match of text.match(MALFORMED_FRAGMENT_RE) ?? []) {
    hits.push({ kind: "malformed_fragment", match: match.trim() || ".", surface: name });
  }
  for (const match of text.match(FIELD_EQ_RE) ?? []) {
    hits.push({ kind: "forbidden_literal", match, surface: name });
  }
  for (const match of text.match(LIFECYCLE_ENUM_RE) ?? []) {
    hits.push({ kind: "forbidden_literal", match, surface: name });
  }
  for (const match of text.match(ENGLISH_APPROVAL_STATE_RE) ?? []) {
    hits.push({ kind: "forbidden_literal", match, surface: name });
  }
}

export function detectPrimaryTextLeaks(input: PrimaryLeakSurface | string): PrimaryLeakHit[] {
  const hits: PrimaryLeakHit[] = [];
  if (typeof input === "string") {
    collectSurface("primaryText", input, hits);
    return dedupeHits(hits);
  }
  collectSurface("answer", input.answer, hits);
  collectSurface("executionSummary", input.executionSummary, hits);
  collectSurface("approvalTitle", input.approvalTitle, hits);
  collectSurface("approvalDescription", input.approvalDescription, hits);
  collectSurface("errorText", input.errorText, hits);
  collectSurface("monitoringText", input.monitoringText, hits);
  collectSurface("timestampStatus", input.timestampStatus, hits);
  collectSurface("contextStrip", input.contextStrip, hits);
  collectSurface("actionCard", input.actionCard, hits);
  collectSurface("memoryText", input.memoryText, hits);
  collectSurface("primaryText", input.primaryText, hits);
  return dedupeHits(hits);
}

function dedupeHits(hits: PrimaryLeakHit[]): PrimaryLeakHit[] {
  const seen = new Set<string>();
  const out: PrimaryLeakHit[] = [];
  for (const hit of hits) {
    const key = `${hit.kind}:${hit.match}:${hit.surface}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

export function countPrimaryTextLeaks(input: PrimaryLeakSurface | string): number {
  return detectPrimaryTextLeaks(input).length;
}

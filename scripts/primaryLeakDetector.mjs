/**
 * JS mirror of primaryLeakDetector for Node acceptance harnesses.
 * Keep in sync with src/lib/rextora/agent/v2/reasoning/primaryLeakDetector.ts
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
];

export const KNOWN_INTERNAL_INTENTS = [
  "prepare_backtest",
  "prepare_search",
  "prepare_paper",
  "memory_recall",
  "research_analysis",
  "search_status",
  "cancel_pending",
];

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
];

const SCREAMING_SNAKE_RE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const NULLISH_RE = /(?:^|\n)\s*(?:None|null|undefined)\s*\.?\s*(?=\n|$)/gim;
const TEMPLATE_DIRECTIVE_RE = /\b(?:inform_user|respond_to_user|call_tool|tool_call)\b\.?/gi;
const MALFORMED_FRAGMENT_RE = /(?:^|\n)\s*[.。]\s*(?=\n|$)/g;
const FIELD_EQ_RE = /\b(?:symbol|timeframe|patterns|leverageMode|exchangeCalled)\s*=/gi;
const LIFECYCLE_ENUM_RE =
  /\b(?:paper_active|paper_ready|search_running|search_needed|search_failed|results_review|backtest_needed|backtest_review|live_review|pending_approval)\b/gi;
const ENGLISH_APPROVAL_STATE_RE =
  /\b(?:Paper\s+)?approval\s+(?:state|status|pending)\b/gi;

function collectSurface(name, text, hits) {
  if (!text || !String(text).trim()) return;
  const value = String(text);
  for (const literal of KNOWN_FORBIDDEN_LITERALS) {
    if (value.includes(literal)) hits.push({ kind: "forbidden_literal", match: literal, surface: name });
  }
  for (const intent of KNOWN_INTERNAL_INTENTS) {
    if (new RegExp(`\\b${intent}\\b`, "i").test(value)) {
      hits.push({ kind: "intent_id", match: intent, surface: name });
    }
  }
  for (const toolId of KNOWN_TOOL_IDS) {
    if (value.includes(toolId)) hits.push({ kind: "tool_id", match: toolId, surface: name });
  }
  for (const match of value.match(SCREAMING_SNAKE_RE) ?? []) {
    hits.push({ kind: "screaming_snake", match, surface: name });
  }
  for (const match of value.match(TEMPLATE_DIRECTIVE_RE) ?? []) {
    hits.push({ kind: "template_directive", match, surface: name });
  }
  for (const match of value.match(NULLISH_RE) ?? []) {
    hits.push({ kind: "nullish_remnant", match: match.trim(), surface: name });
  }
  for (const match of value.match(MALFORMED_FRAGMENT_RE) ?? []) {
    hits.push({ kind: "malformed_fragment", match: match.trim() || ".", surface: name });
  }
  for (const match of value.match(FIELD_EQ_RE) ?? []) {
    hits.push({ kind: "forbidden_literal", match, surface: name });
  }
  for (const match of value.match(LIFECYCLE_ENUM_RE) ?? []) {
    hits.push({ kind: "forbidden_literal", match, surface: name });
  }
  for (const match of value.match(ENGLISH_APPROVAL_STATE_RE) ?? []) {
    hits.push({ kind: "forbidden_literal", match, surface: name });
  }
}

function dedupeHits(hits) {
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    const key = `${hit.kind}:${hit.match}:${hit.surface}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

export function detectPrimaryTextLeaks(input) {
  const hits = [];
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

export function countPrimaryTextLeaks(input) {
  return detectPrimaryTextLeaks(input).length;
}

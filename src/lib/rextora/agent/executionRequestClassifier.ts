/**
 * Safety-first classification for Live / real-order natural language.
 * Deterministic — no I/O. Runs before plan drafts and lifecycle fallback.
 */

import type { AgentIntentType } from "./types";

export type ExecutionClassification =
  | { kind: "explanatory"; intentType: AgentIntentType }
  | { kind: "blocked"; intentType: "start_live" | "execute_trade" }
  | { kind: "none" };

function normalize(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[?.!~…]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Explanatory Live/trade questions — must NOT be safety-blocked. */
function detectExplanatoryIntent(normalized: string): AgentIntentType | null {
  if (
    /실전\s*매매는\s*어떻게|how\s*does\s*live\s*trading\s*work/i.test(
      normalized,
    )
  ) {
    return "explain_approval";
  }
  if (
    (/승인/.test(normalized) &&
      /(어떻게|어떤\s*일|무슨\s*일|일어나|what\s*happens|how)/.test(
        normalized,
      )) ||
    /live\s*approval/i.test(normalized)
  ) {
    if (/live|실전/.test(normalized)) return "explain_approval";
  }
  if (
    (/위험|리스크|risk/.test(normalized) && /실전|live/.test(normalized)) ||
    /실전\s*매매\s*위험/.test(normalized)
  ) {
    return "risk_summary";
  }
  if (
    /(조건|요건|게이트|criteria|requirement)/.test(normalized) &&
    /live|실전/.test(normalized) &&
    /(보여|알려|explain|show|what|어떻)/.test(normalized)
  ) {
    return "recommend_next";
  }
  if (
    /왜.*(차단|막|blocked|안\s*돼|불가)/.test(normalized) &&
    /실전|live/.test(normalized)
  ) {
    return "explain_rejection";
  }
  return null;
}

const LIVE_CONTEXT =
  /(?:\blive\b|라이브|실전|실거래|실제\s*거래|실전\s*매매|실전\s*진입|실전\s*주문|거래소\s*주문)/i;

const EXECUTION_VERB =
  /(?:시작|돌려|진입|활성|켜|켜줘|넣어|넣|실행|해줘|하자|start|enable|activate|run|enter|launch|go\s*live)/i;

function isDirectLiveExecution(normalized: string): boolean {
  if (detectExplanatoryIntent(normalized)) return false;

  if (/start\s*live\s*trading/i.test(normalized)) return true;
  if (/live\s*trading\s*start/i.test(normalized)) return true;
  if (/지금\s*live\s*시작/.test(normalized)) return true;
  if (/라이브로\s*돌려/.test(normalized)) return true;
  if (/바로\s*실전\s*진입/.test(normalized)) return true;
  if (/실전\s*매매\s*시작/.test(normalized)) return true;
  if (/이\s*전략\s*실전/.test(normalized) && EXECUTION_VERB.test(normalized)) {
    return true;
  }
  if (LIVE_CONTEXT.test(normalized) && EXECUTION_VERB.test(normalized)) {
    return true;
  }
  return false;
}

function isDirectTradeExecution(normalized: string): boolean {
  if (detectExplanatoryIntent(normalized)) return false;

  if (/실전\s*주문/.test(normalized) && EXECUTION_VERB.test(normalized)) {
    return true;
  }
  if (/place\s*(?:a\s*)?real\s+\w+\s+order/i.test(normalized)) return true;
  if (/real\s+(?:btc|eth|sol)\s+(?:order|buy|sell)/i.test(normalized)) {
    return true;
  }
  if (
    /(?:execute|place|submit)\s+(?:a\s*)?(?:real\s*)?(?:trade|order)/i.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/(?:매수|매도|buy|sell)/i.test(normalized)) {
    if (/(?:btc|eth|sol|bnb|xrp)/i.test(normalized)) return true;
    if (/(?:매수해|매도해|사줘|팔아줘|buy\s*now|sell\s*now)/i.test(normalized)) {
      return true;
    }
  }
  if (
    /(?:주문|order|trade).*(?:실전|live|real)/i.test(normalized) &&
    EXECUTION_VERB.test(normalized)
  ) {
    return true;
  }
  return false;
}

/** Classify direct execution vs explanatory Live/trade language. */
export function classifyExecutionRequest(
  query: string,
): ExecutionClassification {
  const n = normalize(query);
  const explanatory = detectExplanatoryIntent(n);
  if (explanatory) return { kind: "explanatory", intentType: explanatory };

  if (isDirectTradeExecution(n)) {
    return { kind: "blocked", intentType: "execute_trade" };
  }
  if (isDirectLiveExecution(n)) {
    return { kind: "blocked", intentType: "start_live" };
  }
  return { kind: "none" };
}

/** True when the user asks to execute Live or a real exchange order. */
export function isDirectExecutionRequest(query: string): boolean {
  return classifyExecutionRequest(query).kind === "blocked";
}

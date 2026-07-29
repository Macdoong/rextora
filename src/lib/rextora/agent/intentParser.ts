/**
 * Intent Parser — pure function, no side effects, no I/O.
 * Pattern-matches Korean/English user queries into typed AgentIntent.
 */

import type { AgentIntent, AgentIntentType } from "./types";

type ParamsMap = Record<string, string>;

interface IntentRule {
  type: AgentIntentType;
  patterns: RegExp[];
  extractParams?: (query: string) => ParamsMap;
}

const SYMBOL_RE = /\b(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|MATIC|DOT)[A-Z]*/gi;

// ─── Symbol extraction helpers ────────────────────────────────────────────────

function extractSymbol(query: string): string | null {
  const m = query.match(/\b(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|MATIC|DOT)[A-Z]*/i);
  return m ? m[1].toUpperCase() : null;
}

function withSymbol(query: string): ParamsMap {
  const sym = extractSymbol(query);
  const params: ParamsMap = {};
  if (sym) params.symbol = sym;
  return params;
}

/** Extract up to two distinct symbols for compare_strategies. */
export function extractCompareSymbols(query: string): ParamsMap {
  const found: string[] = [];
  for (const match of query.matchAll(SYMBOL_RE)) {
    const sym = match[1]!.toUpperCase();
    if (!found.includes(sym)) found.push(sym);
  }
  const params: ParamsMap = {};
  if (found[0]) {
    params.symbolA = found[0];
    params.symbol = found[0];
  }
  if (found[1]) params.symbolB = found[1];
  return params;
}

// ─── Intent rules (evaluated top-to-bottom, first match wins) ────────────────
// WRITE-BLOCKED rules must come FIRST so they are matched before read-only rules.

const RULES: IntentRule[] = [
  // ── Write-blocked: detected first so safety guard blocks immediately ─────
  {
    type: "modify_safe",
    patterns: [
      /safe.*(수정|바꿔|변경|edit|modify|change|update|삭제|delete)/i,
      /(수정|바꿔|변경).*(safe|세이프)/i,
    ],
  },
  {
    type: "start_live",
    patterns: [
      /(실전\s*매매|live.?trad|live.?order).*(시작|실행|하자|해줘|start|execute|run|활성화)/i,
      /(시작|실행|활성화).*(실전\s*매매|live.?trad)/i,
      /live\s*(trading\s*)?(start|enable|activate)/i,
    ],
  },
  {
    type: "execute_trade",
    patterns: [
      /(지금|즉시|바로).*(사줘|팔아줘|매수|매도|buy|sell)/i,
      /(사줘|팔아줘|매수해|매도해|buy\s*(me|now)|sell\s*(me|now))/i,
      /(주문|order|trade|execute).*(실전|live)/i,
    ],
  },
  // ── Paper start (read-only deep-link) — before generic paper eligibility ──
  {
    type: "paper_start_request",
    patterns: [
      /(모의\s*매매|페이퍼|paper).*(시작|실행|해줘|하자|start|run|열어)/i,
      /(시작|실행).*(모의\s*매매|페이퍼|paper)/i,
      /paper\s*(로\s*)?(시작|실행|start)/i,
      /(이\s*)?전략을?\s*(모의\s*매매|페이퍼|paper)/i,
    ],
  },
  // ── Failed search explanation — before generic rejection/failure rules ───
  {
    type: "search_failure_explanation",
    patterns: [
      /(실패|failed).*(탐색|연구|search|research|job).*(원인|이유|설명|왜|why|explain)/i,
      /(탐색|연구|search|research).*(실패|failed).*(원인|이유|설명|왜|why)/i,
      /왜.*(탐색|연구|search).*(실패|안\s*됐|중단)/i,
      /failed\s*(search|research).*(reason|why|explain)/i,
    ],
  },
  // ── Read-only rules ───────────────────────────────────────────────────────
  {
    type: "explain_rejection",
    patterns: [
      /왜.*(거부|차단|블락|막|안\s*됐|rejected|block)/i,
      /safe.*(왜|이유|거부|차단)/i,
      /(거부|차단|블락).*(이유|원인|why)/i,
      /why.*(reject|block)/i,
    ],
    extractParams: withSymbol,
  },
  {
    type: "explain_strategy",
    patterns: [
      /(전략|strategy).*(설명|어떻게|뭐야|뭔지|알려|explain|describe|what)/i,
      /(safe|order.?block|fvg|fair.?value|오더|오더블락).*(설명|어떻게|뭐야)/i,
      /이\s*(전략|strategy).*어떻게/i,
      /how.*(strategy|safe|work)/i,
    ],
    extractParams: (q) => {
      const m = q.match(/(safe|order.?block|fvg|전략\s*이름?\s*[:：]?\s*(\S+))/i);
      const params: ParamsMap = {};
      if (m) params.strategyHint = m[0];
      return params;
    },
  },
  {
    type: "explain_strategy",
    patterns: [
      /(모의\s*매매|페이퍼|paper).*(가능|후보|전략|보여|eligible|ready)/i,
      /(가능|후보).*(모의\s*매매|페이퍼|paper)/i,
    ],
  },
  {
    type: "compare_strategies",
    patterns: [
      /(비교|compare|vs|versus|차이|어떤\s*게\s*(더|낫|좋))/i,
      /(두\s*전략|두\s*개|두개|which).*(비교|compare|낫)/i,
    ],
    extractParams: extractCompareSymbols,
  },
  {
    type: "backtest_summary",
    patterns: [
      /(백테스트|backtest|back.?test).*(결과|요약|보여|어때|어떻게|summary|result)/i,
      /(결과|result).*(백테스트|backtest)/i,
      /최근\s*(백테스트|backtest)/i,
      /(비용|수수료|슬리피지|cost|fee|slippage).*(수익|영향|얼마|impact)/i,
    ],
    extractParams: withSymbol,
  },
  {
    type: "risk_summary",
    patterns: [
      /(리스크|위험|mdd|drawdown|손실|risk).*(현황|상태|얼마|어때|summary|status|알려)/i,
      /(mdd|drawdown|낙폭).*(높|큰|이유|원인|why)/i,
      /(현재|지금).*(mdd|리스크|위험|drawdown)/i,
      /왜\s*mdd/i,
      /sharpe|손익비|profit.?factor/i,
    ],
  },
  {
    type: "search_status",
    patterns: [
      /(탐색|연구|search|research).*(상태|어디|얼마|진행|어떻게|how|status|progress)/i,
      /(현재|지금).*(탐색|연구|search)/i,
      /(탐색|전략\s*탐색|strategy.?search).*(됐|됐어|됐나|완료|running|진행)/i,
      /어디까지/i,
    ],
  },
  {
    type: "market_status",
    patterns: [
      /(시장|market).*(상황|어때|현재|지금|status|how)/i,
      /(btc|eth|sol|지금|현재).*(괜찮|어때|상태|상황|price|가격)/i,
      /코인\s*(어때|상태|시장)/i,
    ],
    extractParams: withSymbol,
  },
  {
    type: "first_run_help",
    patterns: [
      /지금\s*뭘\s*해야/i,
      /결과가\s*왜\s*없/i,
      /처음에는\s*어떻게\s*시작/i,
      /처음\s*(에는|엔)?\s*어떻게/i,
      /(시작|온보딩|first.?run).*(어떻게|가이드|도움)/i,
      /how\s*(do\s*i\s*)?start/i,
      /why\s*(are\s*)?(there\s*)?no\s*results/i,
    ],
  },
  {
    type: "demo_overview",
    patterns: [
      /데모\s*(보여|안내|설명|둘러|시작|줘)/i,
      /demo\s*(show|tour|overview|start)/i,
      /예시\s*(데이터|워크스페이스|보여)/i,
    ],
  },
  {
    type: "recommend_next",
    patterns: [
      /(다음|next).*(뭐|뭘|어떻게|무엇|what|recommend|추천)/i,
      /추천.*(해줘|해|줘|please|했어|한\s*이유|왜)/i,
      /왜.*(추천|recommend)/i,
      /뭐\s*(해야|하면|하는\s*게|할까)/i,
      /what\s*(should|next|recommend)/i,
      /(가장|제일).*(좋은|베스트|best).*(전략|strategy)/i,
      /(현재|지금).*(가장|제일).*(좋은|추천)/i,
      /best\s*strateg/i,
    ],
  },
];

// ─── Main parser function ─────────────────────────────────────────────────────

export function parseIntent(query: string): AgentIntent {
  const trimmed = query.trim();

  for (const rule of RULES) {
    const matched = rule.patterns.some((p) => p.test(trimmed));
    if (matched) {
      const params: ParamsMap = rule.extractParams ? rule.extractParams(trimmed) : {};
      const confidence = trimmed.length > 5 ? 0.85 : 0.6;
      return {
        type: rule.type,
        params,
        confidence,
        rawQuery: trimmed,
      };
    }
  }

  return {
    type: "unknown",
    params: {},
    confidence: 0,
    rawQuery: trimmed,
  };
}

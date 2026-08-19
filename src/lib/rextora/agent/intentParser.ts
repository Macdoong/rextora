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
      /지금\s*live\s*시작/i,
      /live\s*trading\s*start/i,
      /start\s*live\s*trading/i,
      /라이브로\s*돌려/i,
      /바로\s*실전\s*진입/i,
      /실전\s*매매\s*시작/i,
      /이\s*전략\s*실전(?:으로)?\s*(?:시작|돌려|진입|실행)/i,
      /(?:실전|라이브|live).*(?:시작|돌려|진입|활성|실행|start|run|enable|activate|go\s*live)/i,
      /(?:시작|돌려|진입|활성|실행|start|run|enable|activate).*(?:실전\s*매매|실전|라이브|live\s*trad)/i,
      /(실전\s*매매|live.?trad|live.?order).*(시작|실행|하자|해줘|start|execute|run|활성화)/i,
      /(시작|실행|활성화).*(실전\s*매매|live.?trad)/i,
      /live\s*(trading\s*)?(start|enable|activate)/i,
    ],
  },
  {
    type: "execute_trade",
    patterns: [
      /실전\s*주문\s*(?:넣|해|실행)/i,
      /place\s*(?:a\s*)?real\s+\w+\s+order/i,
      /(?:execute|place|submit)\s+(?:a\s*)?(?:real\s*)?(?:trade|order)/i,
      /(지금|즉시|바로).*(사줘|팔아줘|매수|매도|buy|sell)/i,
      /(사줘|팔아줘|매수해|매도해|buy\s*(me|now)|sell\s*(me|now))/i,
      /(btc|eth|sol).*(매수|매도|사|팔)/i,
      /(매수|매도|사|팔).*(btc|eth|sol)/i,
      /(주문|order|trade|execute).*(실전|live|real)/i,
    ],
  },
  // ── Multi-turn follow-ups (before generic recommend) ─────────────────────
  {
    type: "paper_pause_request",
    patterns: [
      /(?:모의\s*매매|페이퍼|paper).*(?:일시\s*정지|멈춰|pause)/i,
      /(?:일시\s*정지|멈춰|pause).*(?:모의\s*매매|페이퍼|paper)/i,
    ],
  },
  {
    type: "paper_resume_request",
    patterns: [
      /(?:모의\s*매매|페이퍼|paper).*(?:재개|다시\s*시작|resume)/i,
      /(?:재개|resume).*(?:모의\s*매매|페이퍼|paper)/i,
    ],
  },
  {
    type: "paper_stop_request",
    patterns: [
      /(?:모의\s*매매|페이퍼|paper).*(?:종료|완전\s*중지|stop)/i,
      /(?:종료|stop).*(?:모의\s*매매|페이퍼|paper)/i,
    ],
  },
  {
    type: "strategy_rename_request",
    patterns: [/(?:전략|strategy).*(?:이름|name).*(?:변경|바꿔|rename)/i],
  },
  {
    type: "strategy_archive_request",
    patterns: [/(?:전략|strategy).*(?:보관|아카이브|archive)/i],
  },
  {
    type: "strategy_restore_request",
    patterns: [/(?:보관|아카이브|archive).*(?:전략|strategy).*(?:복원|restore)/i],
  },
  {
    type: "strategy_delete_request",
    patterns: [/(?:전략|strategy).*(?:삭제|delete)/i],
  },
  {
    type: "search_pause_request",
    patterns: [
      /(?:현재|지금).*(?:작업|탐색|연구).*(?:중지|멈춰|일시\s*정지|pause)/i,
      /(?:중지|멈춰|pause).*(?:작업|탐색|연구)/i,
    ],
  },
  {
    type: "search_resume_request",
    patterns: [
      /^(?:다시\s*시작해|재개해|resume)$/i,
      /(?:중지|멈춘|일시\s*정지).*(?:다시\s*시작|재개|resume)/i,
    ],
  },
  {
    type: "explain_waiting",
    patterns: [
      /왜\s*(기다|대기)/i,
      /(기다|대기).*(이유|왜)/i,
      /why\s*(waiting|wait)/i,
      /왜\s*안\s*(진행|시작)/i,
    ],
  },
  {
    type: "continue_session",
    patterns: [
      /이어서/,
      /이어\s*하자/,
      /계속\s*(하자|해|해줘|진행)/i,
      /멈춘\s*(데|곳|지점)/i,
      /아까\s*(그거|거|작업)/i,
      /남겨둔/,
      /이어서\s*진행/i,
      /continue\s*where/i,
      /pick\s*up\s*where/i,
    ],
  },
  {
    type: "follow_up_why",
    patterns: [
      /^(왜|왜\?|왜요|왜요\?)$/i,
      /^왜\s*(그래|그[래거]|그\s*설정|그거야)/i,
      /^why\??$/i,
      /왜\s*그\s*설정/i,
      /왜\s*추천/i,
    ],
  },
  {
    type: "compare_plans",
    patterns: [
      /(?:방금|이전|최근).*(?:계획|설정).*(?:무엇|뭐|어떻게).*(?:달라|차이)/i,
      /(?:계획|설정).*(?:차이|달라진)/i,
    ],
  },
  {
    type: "approve_pending",
    patterns: [
      /^(그럼\s*)?(진행해|실행해|그렇게\s*해|승인|승인할게|해줘|가자)$/i,
      /^(진행|실행|승인)\s*(해|하자|할게|해줘)/i,
      /^(ok|okay|yes)$/i,
    ],
  },
  {
    type: "research_analysis",
    patterns: [
      /이전\s*탐색.*겹치지.*연구/i,
      /왜\s*(?:이|그)\s*조합.*추천/i,
      /실패\s*원인.*분석.*다른\s*설정/i,
      /두\s*전략.*먼저\s*백테스트/i,
      /수수료.*실패.*분석/i,
      /mdd.*높아진\s*원인/i,
      /검증하지\s*않은\s*패턴\s*조합/i,
    ],
  },
  {
    type: "results_promote_request",
    patterns: [
      /(?:선택한|현재|최상위|상위|베스트|best).*(?:결과|후보).*(?:전략).*(?:승격|등록|promote)/i,
      /(?:결과|후보).*(?:전략).*(?:승격|등록|promote)/i,
      /promote.*(?:result|candidate).*(?:strategy)?/i,
      /(?:best|selected|current).*(?:result|candidate).*promote.*strategy/i,
    ],
  },
  {
    type: "memory_recall",
    patterns: [
      /(?:무엇을|뭘|뭐를)\s*(?:배웠|학습)/i,
      /(?:이전|지난).*(?:승인|결정|거절|실패).*(?:기억|이유|왜)/i,
      /(?:기억|메모리).*(?:찾아|보여|알려|회상|recall)/i,
      /what.*(?:learned|remember)/i,
    ],
  },
  // ── Plan drafts & workspace (before generic search — never auto-start) ──
  {
    type: "prepare_backtest_plan",
    patterns: [
      /(백테스트|backtest).*(계획|준비|만들어|짜)/i,
      /(계획|준비).*(백테스트|backtest)/i,
      /prepare\s*(a\s*)?backtest\s*plan/i,
    ],
    extractParams: withSymbol,
  },
  {
    type: "prepare_paper_plan",
    patterns: [
      /(모의\s*매매|페이퍼|paper).*(계획|준비|승인\s*초안)/i,
      /(계획|준비).*(모의\s*매매|페이퍼|paper)/i,
      /prepare\s*(a\s*)?paper\s*plan/i,
    ],
  },
  {
    type: "research_workspace",
    patterns: [
      /(연구|리서치|research).*(요약|현황|워크스페이스|상태)/i,
      /(현재\s*)?(연구|탐색).*(상황|현황|어디에)/i,
      /research\s*(workspace|summary|status)/i,
      /워크스페이스/,
    ],
  },
  {
    type: "cancel_pending",
    patterns: [
      /^(취소|그만|안\s*할래|cancel)$/i,
      /(계획|제안).*(취소|버려|철회)/i,
      /cancel\s*(plan|proposal)?/i,
    ],
  },
  {
    type: "prepare_search_plan",
    patterns: [
      /\d+\s*분\s*(?:봉)?\s*말고\s*\d+\s*시간\s*(?:봉)?/i,
      /(?:타임프레임|시간봉).*(?:바꿔|변경|조정)/i,
      /(새로운?|새)\s*(전략\s*)?탐색/i,
      /(전략\s*)?탐색\s*(해|해줘|하자|시작|준비)/i,
      /탐색\s*계획\s*(준비|만들어|짜)/i,
      /(search\s*)?plan\s*(준비|만들어)/i,
      /new\s*(strategy\s*)?search/i,
      /prepare\s*(a\s*)?search\s*plan/i,
      /(btc|eth|솔|비트).*(탐색|search)/i,
      /run\s*a\s*search/i,
    ],
    extractParams: withSymbol,
  },
  // ── Paper start (read-only deep-link) — before generic paper eligibility ──
  {
    type: "paper_start_request",
    patterns: [
      /(모의\s*매매|페이퍼|paper).*(시작|실행|해줘|하자|start|run|열어|돌려)/i,
      /(시작|실행|돌려).*(모의\s*매매|페이퍼|paper)/i,
      /paper\s*(로\s*)?(시작|실행|start)/i,
      /(이\s*)?전략을?\s*(모의\s*매매|페이퍼|paper)/i,
      /(수익|좋은|베스트|best).*(전략)?.{0,12}(paper|페이퍼|모의)/i,
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
      /(중|중에)\s*(뭐|무엇|어떤).*(더|낫|좋)/i,
      /(btc|eth).*(eth|btc).*(더|낫|좋|비교)/i,
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
      /(오늘|지금)\s*뭘\s*해야/i,
      /(오늘|지금)\s*무엇을\s*해야/i,
      /무엇을\s*해야\s*하지/i,
      /뭘\s*해야\s*해/i,
      /다음\s*단계/i,
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
  {
    type: "explain_approval",
    patterns: [
      /승인하면\s*(어떤|무슨|어떻게)/i,
      /지금\s*승인하면/i,
      /(승인|진행)하면\s*(어떤\s*일|무슨\s*일|어떻게\s*되)/i,
      /what\s*happens\s*(if|when).*(approv)/i,
    ],
  },
  {
    type: "prepare_backtest_plan",
    patterns: [
      /백테스트\s*(해|해볼|돌|할까|실행해|실행|돌려)/i,
      /(백테스트|backtest).*(실행|돌려|run)/i,
      /backtest\s*(할까|해|run|try)/i,
    ],
    extractParams: withSymbol,
  },
  {
    type: "prepare_search_plan",
    patterns: [
      /좋은\s*전략을?\s*찾/i,
      /전략을?\s*찾아\s*줘/i,
      /찾아줘/,
    ],
    extractParams: withSymbol,
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

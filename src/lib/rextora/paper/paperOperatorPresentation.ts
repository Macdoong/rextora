/**
 * Paper Trading operator presentation — labels and read-model only.
 * Does not change session status, capital arithmetic, or execution.
 * Client-safe: no Node/fs.
 */

export const PAPER_OPERATOR_COST_EXECUTION_PRICE_V1 =
  "event_sequence_execution_price_v1";
export const PAPER_OPERATOR_COST_LEDGER_V0 = "event_sequence_ledger_v0";
export const PAPER_OPERATOR_UNRESOLVED_LABEL = "확인 필요";
export const PAPER_OPERATOR_LEGACY_OWNERSHIP_LABEL =
  "이전 버전 기록 — 소유정보 없음";
export const PAPER_OPERATOR_LEGACY_OHLC_LABEL =
  "이전 버전 기록 — 판단 봉 상세 없음";

export type PaperOperatorBackendStatus =
  | "pending_approval"
  | "ready"
  | "active"
  | "paused"
  | "risk_halted"
  | "stopped"
  | "failed";

export type PaperOperatorUiStatus =
  | PaperOperatorBackendStatus
  | "idle"
  | "starting"
  | "stopping"
  | "error";

export type PaperOperatorExecutionKind = "safe" | "pattern" | "unresolved";

export type PaperOperatorCandleAudit = {
  symbol?: string;
  intervalMs?: number;
  openTime: number;
  closeTime?: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export function paperOperatorSessionCapitalUsdt(input: {
  virtualBalance: number;
  realizedPnl: number;
}): number {
  return Number((input.virtualBalance + input.realizedPnl).toFixed(8));
}

export function paperOperatorStatusLabel(
  status: PaperOperatorUiStatus,
): string {
  switch (status) {
    case "pending_approval":
      return "승인 대기";
    case "ready":
      return "준비됨";
    case "active":
      return "모의매매 실행 중";
    case "paused":
      return "일시정지";
    case "risk_halted":
      return "위험 제한으로 자동 중단";
    case "stopped":
      return "종료";
    case "failed":
    case "error":
      return "실패";
    case "starting":
      return "시작 중";
    case "stopping":
      return "종료 중";
    case "idle":
      return "세션 없음";
    default:
      return PAPER_OPERATOR_UNRESOLVED_LABEL;
  }
}

export function paperOperatorStatusNextStep(
  status: PaperOperatorUiStatus,
): string {
  switch (status) {
    case "pending_approval":
      return "승인 후 모의매매를 시작할 수 있습니다.";
    case "ready":
      return "시작을 승인하면 모의매매가 실행됩니다.";
    case "active":
      return "일시정지하거나 종료할 수 있습니다. 실전 주문은 전송되지 않습니다.";
    case "paused":
      return "재개하면 같은 세션이 이어집니다. 자동으로 재개되지 않습니다.";
    case "risk_halted":
      return "위험 제한으로 멈춘 상태입니다. 자동 재개되지 않으며, 재개 또는 종료를 선택하세요.";
    case "stopped":
      return "이 세션은 종료되었습니다. 새 세션은 별도로 시작해야 합니다.";
    case "failed":
    case "error":
      return "상태를 확인한 뒤 안전 재시도 또는 종료를 선택하세요.";
    case "starting":
      return "시작 요청을 처리하고 있습니다.";
    case "stopping":
      return "종료 요청을 처리하고 있습니다.";
    case "idle":
      return "전략을 확인한 뒤 모의매매를 시작할 수 있습니다.";
    default:
      return PAPER_OPERATOR_UNRESOLVED_LABEL;
  }
}

export function paperOperatorStopReasonLabel(
  reason: string | null | undefined,
): { label: string; raw: string | null } {
  if (reason == null || !reason.trim()) {
    return { label: PAPER_OPERATOR_UNRESOLVED_LABEL, raw: null };
  }
  const raw = reason.trim();
  if (raw === "pattern_paper_validation_complete") {
    return { label: "검증 완료로 종료", raw };
  }
  if (raw === "user_stop") {
    return { label: "운영자가 종료", raw };
  }
  if (raw === "risk_halt") {
    return { label: "위험 제한으로 자동 중단", raw };
  }
  if (raw === "event_sequence_finalized_candle_fix") {
    return { label: "확정 봉 수정으로 종료", raw };
  }
  if (raw === "failed") {
    return { label: "실패로 종료", raw };
  }
  if (raw === "replaced_by_new_session") {
    return { label: "새 세션으로 교체되어 종료", raw };
  }
  return { label: raw, raw };
}

export function paperOperatorCostModelLabel(input: {
  costModel?: string | null;
  costModelStatus?: string | null;
}): { label: string; raw: string | null; unresolved: boolean } {
  const status = input.costModelStatus ?? null;
  const raw = input.costModel?.trim() || null;
  if (status === "unresolved") {
    return { label: PAPER_OPERATOR_UNRESOLVED_LABEL, raw, unresolved: true };
  }
  if (raw === PAPER_OPERATOR_COST_EXECUTION_PRICE_V1) {
    return {
      label: "최신 체결가격 기반 비용 계산",
      raw,
      unresolved: false,
    };
  }
  if (raw === PAPER_OPERATOR_COST_LEDGER_V0) {
    return { label: "기존 원장 비용 계산", raw, unresolved: false };
  }
  if (status === "not_applicable" || (!raw && !status)) {
    return { label: PAPER_OPERATOR_UNRESOLVED_LABEL, raw, unresolved: true };
  }
  return { label: PAPER_OPERATOR_UNRESOLVED_LABEL, raw, unresolved: true };
}

export function paperOperatorExecutionKind(input: {
  strategyId?: string | null;
  hasEventSequenceDefinition?: boolean | null;
  paperLifecycleModel?: string | null;
  eventSequenceCostModel?: string | null;
}): {
  kind: PaperOperatorExecutionKind;
  label: string;
} {
  if (
    input.hasEventSequenceDefinition === true ||
    input.paperLifecycleModel === "event_sequence_paper_v1" ||
    input.eventSequenceCostModel === PAPER_OPERATOR_COST_EXECUTION_PRICE_V1 ||
    input.eventSequenceCostModel === PAPER_OPERATOR_COST_LEDGER_V0
  ) {
    return { kind: "pattern", label: "Pattern / Event-Sequence" };
  }
  return { kind: "unresolved", label: PAPER_OPERATOR_UNRESOLVED_LABEL };
}

export function paperOperatorLiveLabel(input: {
  liveTradingEnabled?: boolean | null;
  allowLiveTrading?: boolean | null;
}): { liveActive: false; label: string } {
  return {
    liveActive: false,
    label:
      input.liveTradingEnabled === true || input.allowLiveTrading === true
        ? "실전 매매가 켜져 있습니다. 이 화면은 모의매매 전용입니다."
        : "실전 매매 아님",
  };
}

export function paperOperatorPositionOwnership(input: {
  paperSessionId?: string | null;
  paperStrategyId?: string | null;
  sessionId?: string | null;
  strategyId?: string | null;
}): {
  owned: boolean;
  legacy: boolean;
  label: string;
} {
  const sessionId = input.paperSessionId?.trim() || null;
  const strategyId = input.paperStrategyId?.trim() || null;
  if (!sessionId || !strategyId) {
    return {
      owned: false,
      legacy: true,
      label: PAPER_OPERATOR_LEGACY_OWNERSHIP_LABEL,
    };
  }
  const sessionMatch = !input.sessionId || sessionId === input.sessionId;
  const strategyMatch = !input.strategyId || strategyId === input.strategyId;
  if (sessionMatch && strategyMatch) {
    return { owned: true, legacy: false, label: "이 세션의 포지션" };
  }
  return {
    owned: false,
    legacy: false,
    label: PAPER_OPERATOR_UNRESOLVED_LABEL,
  };
}

export function paperOperatorOhlcAudit(
  candle: PaperOperatorCandleAudit | null | undefined,
): {
  available: boolean;
  label: string;
  candle: PaperOperatorCandleAudit | null;
} {
  if (
    !candle ||
    !Number.isFinite(candle.openTime) ||
    !Number.isFinite(candle.open) ||
    !Number.isFinite(candle.high) ||
    !Number.isFinite(candle.low) ||
    !Number.isFinite(candle.close)
  ) {
    return {
      available: false,
      label: PAPER_OPERATOR_LEGACY_OHLC_LABEL,
      candle: null,
    };
  }
  return { available: true, label: "확정 봉 기록", candle };
}

export function paperOperatorFormatTime(
  iso: string | null | undefined,
): string {
  if (!iso) return PAPER_OPERATOR_UNRESOLVED_LABEL;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return PAPER_OPERATOR_UNRESOLVED_LABEL;
  return new Date(ms).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function paperOperatorFormatCandleTime(openTime: number): string {
  if (!Number.isFinite(openTime)) return PAPER_OPERATOR_UNRESOLVED_LABEL;
  return new Date(openTime).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function paperOperatorSelectDisplaySession<
  T extends { status: string; updatedAt?: string; startedAt?: string | null },
>(input: { current: T | null; sessions: T[] }): T | null {
  if (input.current) return input.current;
  const sorted = [...input.sessions].sort((a, b) => {
    const aAt = a.updatedAt ?? a.startedAt ?? "";
    const bAt = b.updatedAt ?? b.startedAt ?? "";
    return aAt < bAt ? 1 : aAt > bAt ? -1 : 0;
  });
  return sorted[0] ?? null;
}

export function paperOperatorTradeBelongsToSession(input: {
  tradeStrategyId?: string | null;
  tradePaperSessionId?: string | null;
  tradeMode?: string | null;
  sessionId: string;
  sessionStrategyId: string;
}): "session" | "global" | "unscoped" {
  if (input.tradeMode && input.tradeMode !== "PAPER") return "global";
  const tradeSession = input.tradePaperSessionId?.trim() || null;
  if (tradeSession) {
    return tradeSession === input.sessionId ? "session" : "global";
  }
  if (
    input.tradeStrategyId &&
    input.tradeStrategyId === input.sessionStrategyId
  ) {
    return "unscoped";
  }
  return "global";
}

export function paperOperatorMetricText(
  value: number | null | undefined,
  suffix = "",
): string {
  if (value == null || !Number.isFinite(value)) {
    return PAPER_OPERATOR_UNRESOLVED_LABEL;
  }
  return `${value}${suffix}`;
}

function hasLevFields(
  record?: Record<string, unknown> | null,
): record is Record<string, unknown> {
  if (!record) return false;
  return (
    record.lev_min != null ||
    record.lev_max != null ||
    record.lev_base != null ||
    record.use_dynamic_leverage != null
  );
}

function formatLevNumber(value: number): string {
  if (!Number.isFinite(value)) return PAPER_OPERATOR_UNRESOLVED_LABEL;
  return Number.isInteger(value) ? String(value) : String(value);
}

/**
 * Event-Sequence Paper open() resolves lev_* from definition.metadata when
 * present; strategy.params is a separate stored layer and must not override
 * that runtime authority. Alias/name text is never an authority.
 */
export function paperOperatorLeverageAuthority(input: {
  definitionMetadata?: Record<string, unknown> | null;
  strategyParams?: Record<string, unknown> | null;
  openPositionLeverage?: number | null;
  strategyName?: string | null;
}): {
  source: "definition_metadata" | "strategy_params" | "unresolved";
  label: string;
  appliedLabel: string | null;
} {
  const record = hasLevFields(input.definitionMetadata)
    ? input.definitionMetadata
    : hasLevFields(input.strategyParams)
      ? input.strategyParams
      : null;
  const source = hasLevFields(input.definitionMetadata)
    ? ("definition_metadata" as const)
    : hasLevFields(input.strategyParams)
      ? ("strategy_params" as const)
      : ("unresolved" as const);
  void input.strategyName;
  if (!record) {
    return {
      source,
      label: PAPER_OPERATOR_UNRESOLVED_LABEL,
      appliedLabel: Number.isFinite(input.openPositionLeverage)
        ? `현재 적용 ${formatLevNumber(Number(input.openPositionLeverage))}배`
        : null,
    };
  }
  const min = Number(record.lev_min);
  const max = Number(record.lev_max);
  const base = Number(record.lev_base);
  const dynamic = record.use_dynamic_leverage === true;
  let label = PAPER_OPERATOR_UNRESOLVED_LABEL;
  if (Number.isFinite(min) && Number.isFinite(max)) {
    label = dynamic
      ? `자동 ${formatLevNumber(min)}–${formatLevNumber(max)}배`
      : min === max
        ? `고정 ${formatLevNumber(min)}배`
        : `${formatLevNumber(min)}–${formatLevNumber(max)}배`;
  } else if (Number.isFinite(base)) {
    label = dynamic
      ? `자동 ${formatLevNumber(base)}배`
      : `고정 ${formatLevNumber(base)}배`;
  }
  return {
    source,
    label,
    appliedLabel: Number.isFinite(input.openPositionLeverage)
      ? `현재 적용 ${formatLevNumber(Number(input.openPositionLeverage))}배`
      : null,
  };
}

export function paperOperatorChartEmptyCopy(input: {
  status?: string | null;
  startedAt?: string | null;
  tradeCount?: number | null;
  sessionPresent?: boolean;
}): {
  kind: "never_started" | "stopped" | "stopped_with_trades" | "started_inactive";
  message: string;
  hint: string;
  actionHref?: string;
  actionLabel?: string;
} {
  const started = Boolean(input.startedAt?.trim());
  const trades = Number(input.tradeCount ?? 0);
  const status = input.status ?? null;
  const stopped = status === "stopped" || status === "failed";
  if (stopped && started && trades > 0) {
    return {
      kind: "stopped_with_trades",
      message:
        "이 모의매매 세션은 종료되었습니다. 완료 거래 기록을 확인할 수 있습니다.",
      hint: "실시간 스캔은 중지되었습니다. 아래 거래 기록에서 완료된 모의 거래를 확인하세요.",
    };
  }
  if (stopped && started) {
    return {
      kind: "stopped",
      message: "이 모의매매 세션은 종료되었습니다.",
      hint: "이 세션은 시작 후 종료되었습니다. 새 세션은 별도로 시작해야 합니다.",
    };
  }
  if (started && status !== "active") {
    return {
      kind: "started_inactive",
      message: "이 모의매매 세션은 시작되었습니다.",
      hint: paperOperatorStatusNextStep(
        (status as PaperOperatorUiStatus) ?? "paused",
      ),
    };
  }
  return {
    kind: "never_started",
    message: "아직 거래가 시작되지 않았습니다.",
    hint: "모의매매를 시작하면 차트·손익·거래 내역이 여기에 표시됩니다.",
    actionHref: "/results",
    actionLabel: "탐색 결과에서 전략 등록",
  };
}

export type PaperOperatorPageContext = {
  source: "paper";
  strategyId: string | null;
  strategyLabel: string | null;
  paperSessionId: string | null;
  paperSessionStatus: string | null;
  symbol: string | null;
  timeframe: string | null;
  researchJobId: string | null;
};

export function paperOperatorShellContext(input: {
  routeIsPaper: boolean;
  paperContext: PaperOperatorPageContext | null;
  agentStrategyId?: string | null;
  agentStrategyLabel?: string | null;
  agentJobId?: string | null;
  agentPaperSessionId?: string | null;
  agentSymbol?: string | null;
  agentTimeframe?: string | null;
}): {
  strategy: string | null;
  researchJobId: string | null;
  paperSessionId: string | null;
  paperSessionLabel: string;
  symbolTimeframe: string | null;
  usedPaperPageContext: boolean;
} {
  if (input.routeIsPaper) {
    const ctx = input.paperContext;
    if (!ctx) {
      return {
        strategy: null,
        researchJobId: null,
        paperSessionId: null,
        paperSessionLabel: "Paper session not selected",
        symbolTimeframe: null,
        usedPaperPageContext: true,
      };
    }
    const strategy =
      ctx.strategyId?.trim() ||
      ctx.strategyLabel?.trim() ||
      null;
    const symbolTimeframe =
      ctx.symbol?.trim() && ctx.timeframe?.trim()
        ? `${ctx.symbol.trim()} · ${ctx.timeframe.trim()}`
        : ctx.symbol?.trim() || ctx.timeframe?.trim() || null;
    return {
      strategy,
      researchJobId: ctx.researchJobId?.trim() || null,
      paperSessionId: ctx.paperSessionId?.trim() || null,
      paperSessionLabel: ctx.paperSessionId?.trim() || "Paper session not selected",
      symbolTimeframe,
      usedPaperPageContext: true,
    };
  }
  const symbolTimeframe =
    input.agentSymbol?.trim() && input.agentTimeframe?.trim()
      ? `${input.agentSymbol.trim()} · ${input.agentTimeframe.trim()}`
      : input.agentSymbol?.trim() || input.agentTimeframe?.trim() || null;
  return {
    strategy:
      input.agentStrategyLabel?.trim() ||
      input.agentStrategyId?.trim() ||
      null,
    researchJobId: input.agentJobId?.trim() || null,
    paperSessionId: input.agentPaperSessionId?.trim() || null,
    paperSessionLabel: input.agentPaperSessionId?.trim() || "Not pinned in Agent",
    symbolTimeframe,
    usedPaperPageContext: false,
  };
}

/** Matches tradingDashboardStatus.buildRecentTrades(40). Presentation completeness only. */
export const PAPER_OPERATOR_DASHBOARD_RECENT_TRADE_CAP = 40;
/** Matches the Paper trade table row cap. Presentation completeness only. */
export const PAPER_OPERATOR_TRADE_TABLE_CAP = 20;

export type PaperOperatorSemanticTone =
  | "success"
  | "danger"
  | "warning"
  | "neutral"
  | "brand";

export type PaperOperatorSignedTone = "positive" | "negative" | "zero";

export function paperOperatorSignedFinancialTone(
  value: number | null | undefined,
): PaperOperatorSignedTone {
  if (value == null || !Number.isFinite(value) || value === 0) return "zero";
  return value > 0 ? "positive" : "negative";
}

/**
 * Display-only numeric cleanup. Does not change stored or cumulative values.
 * Trims IEEE float noise at 8 fractional digits (same scale as session capital).
 */
export function paperOperatorDisplayNumeric(
  value: number | null | undefined,
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value === 0) return "0";
  const trimmed = value
    .toFixed(8)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  if (trimmed === "0" || trimmed === "-0") return "0";
  return trimmed;
}

export function paperOperatorSignedFinancialText(
  value: number | null | undefined,
  suffix = "",
): string {
  const display = paperOperatorDisplayNumeric(value);
  if (display == null) return PAPER_OPERATOR_UNRESOLVED_LABEL;
  if (display === "0") return `0${suffix}`;
  const numeric = Number(display);
  if (numeric > 0) return `+${display}${suffix}`;
  return `${display}${suffix}`;
}

export function paperOperatorStatusTone(
  status: PaperOperatorUiStatus,
): PaperOperatorSemanticTone {
  switch (status) {
    case "active":
    case "starting":
    case "ready":
      return "brand";
    case "paused":
    case "pending_approval":
    case "risk_halted":
      return "warning";
    case "failed":
    case "error":
      return "danger";
    case "stopped":
    case "stopping":
    case "idle":
    default:
      return "neutral";
  }
}

/**
 * Presentation-only close-reason mapping.
 * Keys are production enums / stored Korean labels already written by Paper.
 * Does not rewrite stored values; callers must keep `raw` reachable in audit.
 */
const PAPER_OPERATOR_CLOSE_REASON_MAP: Record<
  string,
  { tone: PaperOperatorSemanticTone; label: string }
> = {
  take_profit: { tone: "success", label: "익절" },
  익절: { tone: "success", label: "익절" },
  stop_loss: { tone: "danger", label: "손절" },
  손절: { tone: "danger", label: "손절" },
  trailing_stop: { tone: "warning", label: "트레일링 청산" },
  "트레일링 청산": { tone: "warning", label: "트레일링 청산" },
  "트레일링 손절": { tone: "warning", label: "트레일링 손절" },
  max_hold: { tone: "warning", label: "최대 보유 시간 청산" },
  "최대 보유 시간 청산": { tone: "warning", label: "최대 보유 시간 청산" },
  "최대 보유 청산": { tone: "warning", label: "최대 보유 청산" },
  end: { tone: "neutral", label: "백테스트 종료 청산" },
  "백테스트 종료 청산": { tone: "neutral", label: "백테스트 종료 청산" },
  manual: { tone: "neutral", label: "수동 청산" },
  "수동 청산": { tone: "neutral", label: "수동 청산" },
  수동청산: { tone: "neutral", label: "수동청산" },
  manual_close: { tone: "neutral", label: "수동 청산" },
  emergency_close: { tone: "neutral", label: "emergency_close" },
  보합: { tone: "neutral", label: "보합" },
  실패: { tone: "danger", label: "실패" },
};

export function paperOperatorCloseReasonPresentation(
  reason: string | null | undefined,
): {
  tone: PaperOperatorSemanticTone;
  label: string;
  raw: string | null;
  mapped: boolean;
} {
  if (reason == null || !String(reason).trim()) {
    return {
      tone: "neutral",
      label: PAPER_OPERATOR_UNRESOLVED_LABEL,
      raw: null,
      mapped: false,
    };
  }
  const raw = String(reason).trim();
  const mapped = PAPER_OPERATOR_CLOSE_REASON_MAP[raw];
  if (!mapped) {
    return { tone: "neutral", label: raw, raw, mapped: false };
  }
  return { tone: mapped.tone, label: mapped.label, raw, mapped: true };
}

export function paperOperatorSidePresentation(
  side: string | null | undefined,
): { tone: PaperOperatorSemanticTone; label: string } {
  const raw = String(side ?? "").trim();
  if (raw === "LONG" || raw === "롱") {
    return { tone: "success", label: "롱" };
  }
  if (raw === "SHORT" || raw === "숏") {
    return { tone: "danger", label: "숏" };
  }
  return {
    tone: "neutral",
    label: raw || PAPER_OPERATOR_UNRESOLVED_LABEL,
  };
}

export function paperOperatorCapitalDelta(
  startCapital: number,
  currentCapital: number,
): {
  start: number;
  current: number;
  absolute: number;
  percent: number | null;
  tone: PaperOperatorSignedTone;
} | null {
  if (!Number.isFinite(startCapital) || !Number.isFinite(currentCapital)) {
    return null;
  }
  const start = Number(startCapital.toFixed(8));
  const current = Number(currentCapital.toFixed(8));
  const absolute = Number((current - start).toFixed(8));
  const percent = start === 0 ? null : Number(((absolute / start) * 100).toFixed(8));
  return {
    start,
    current,
    absolute,
    percent,
    tone: paperOperatorSignedFinancialTone(absolute),
  };
}

/** Prefix sums of existing realized PnL. Presentation only — never persisted. */
export function paperOperatorCumulativeRealizedPnl(
  realizedPnls: number[],
): number[] {
  let sum = 0;
  return realizedPnls.map((value) => {
    sum += Number.isFinite(value) ? value : 0;
    return sum;
  });
}

/** Dashboard recent trades are newest-first; charts need oldest-first. */
export function paperOperatorNewestFirstToChronological<T>(rows: T[]): T[] {
  return [...rows].reverse();
}

export function paperOperatorLoadedTradesComplete(
  loadedCount: number,
  sourceCap = PAPER_OPERATOR_DASHBOARD_RECENT_TRADE_CAP,
): boolean {
  return (
    Number.isFinite(loadedCount) &&
    loadedCount >= 0 &&
    loadedCount < sourceCap
  );
}

export function paperOperatorTradeRealizedPnl(
  trade: Record<string, unknown>,
): number | null {
  const value = Number(trade.netPnl ?? trade.realizedUsdt);
  return Number.isFinite(value) ? value : null;
}

export function paperOperatorScaledSeries(
  values: number[],
  plotW: number,
  plotH: number,
): {
  points: Array<{ x: number; y: number; value: number }>;
  min: number;
  max: number;
} {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0 || plotW <= 0 || plotH <= 0) {
    return { points: [], min: 0, max: 0 };
  }
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  const span = max - min || 1;
  const points = finite.map((value, i) => ({
    x:
      finite.length === 1
        ? plotW / 2
        : (i / (finite.length - 1)) * plotW,
    y: plotH - ((value - min) / span) * plotH,
    value,
  }));
  return { points, min, max };
}

function formatHoldDurationMs(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 ${minutes % 60}분`;
  return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
}

/**
 * Prefer the stored hold label. Otherwise derive from holdingTimeMs or
 * openedAt → closedAt. Never invent a duration.
 */
export function paperOperatorHoldTimeText(input: {
  holdingTimeLabel?: string | null;
  holdingTimeMs?: number | null;
  openedAt?: string | null;
  closedAt?: string | null;
}): string | null {
  const label = input.holdingTimeLabel?.trim() || "";
  if (label && label !== "-" && label !== PAPER_OPERATOR_UNRESOLVED_LABEL) {
    return label;
  }
  if (input.holdingTimeMs != null && Number.isFinite(input.holdingTimeMs)) {
    return formatHoldDurationMs(input.holdingTimeMs);
  }
  const opened = input.openedAt ? Date.parse(input.openedAt) : NaN;
  const closed = input.closedAt ? Date.parse(input.closedAt) : NaN;
  if (!Number.isFinite(opened) || !Number.isFinite(closed) || closed < opened) {
    return null;
  }
  return formatHoldDurationMs(closed - opened);
}

export type PaperOperatorTradeSetSummary = {
  totalTrades: number;
  totalRealizedPnl: number;
  wins: number;
  losses: number;
  zeros: number;
  winRatePct: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
};

/** Presentation-only rollup of existing realized PnL values. Not persisted. */
export function paperOperatorTradeSetSummary(
  realizedPnls: number[],
): PaperOperatorTradeSetSummary {
  const finite = realizedPnls.filter((value) => Number.isFinite(value));
  const totalTrades = finite.length;
  const totalRealizedPnl = Number(
    finite.reduce((sum, value) => sum + value, 0).toFixed(8),
  );
  const wins = finite.filter((value) => value > 0).length;
  const losses = finite.filter((value) => value < 0).length;
  const zeros = finite.filter((value) => value === 0).length;
  return {
    totalTrades,
    totalRealizedPnl,
    wins,
    losses,
    zeros,
    winRatePct:
      totalTrades > 0
        ? Number(((wins / totalTrades) * 100).toFixed(4))
        : null,
    bestTrade: totalTrades > 0 ? Math.max(...finite) : null,
    worstTrade: totalTrades > 0 ? Math.min(...finite) : null,
  };
}

export type PaperOperatorTradeTooltipModel = {
  time: string;
  symbol: string;
  side: string;
  closeReason: string;
  realizedPnl: string;
  realizedPnlPct: string | null;
  cumulativePnl: string;
};

export function paperOperatorTradeTooltipModel(input: {
  time?: string | null;
  symbol?: string | null;
  direction?: string | null;
  exitReason?: string | null;
  netPnl: number | null;
  pnlPct: number | null;
  cumulativePnl: number | null;
}): PaperOperatorTradeTooltipModel {
  const side = paperOperatorSidePresentation(input.direction);
  const close = paperOperatorCloseReasonPresentation(input.exitReason);
  return {
    time: input.time?.trim() || PAPER_OPERATOR_UNRESOLVED_LABEL,
    symbol: input.symbol?.trim() || PAPER_OPERATOR_UNRESOLVED_LABEL,
    side: side.label,
    closeReason: close.label,
    realizedPnl: paperOperatorSignedFinancialText(input.netPnl, " USDT"),
    realizedPnlPct:
      input.pnlPct != null && Number.isFinite(input.pnlPct)
        ? paperOperatorSignedFinancialText(input.pnlPct, "%")
        : null,
    cumulativePnl: paperOperatorSignedFinancialText(
      input.cumulativePnl,
      " USDT",
    ),
  };
}

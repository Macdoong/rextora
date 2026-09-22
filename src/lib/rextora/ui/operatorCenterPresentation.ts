/**
 * Operator Center presentation helpers.
 * Display-only: no execution, Live-gate, or stored-value mutation.
 */

export function isIdleNewSearchPrimaryAction(action: {
  href?: string | null;
  label?: string | null;
}): boolean {
  return action.href === "/strategy-search" && action.label === "새 탐색 시작";
}

/** Hide the idle new-search primary when the strategy card already shows that CTA. */
export function shouldShowOperatorPrimaryAction(input: {
  hasSelectedStrategy: boolean;
  primaryAction: { href?: string | null; label?: string | null };
}): boolean {
  if (
    !input.hasSelectedStrategy &&
    isIdleNewSearchPrimaryAction(input.primaryAction)
  ) {
    return false;
  }
  return true;
}

export function hasOperatorSearchResult(
  completedRecent?: { id?: string | null; status?: string | null } | null,
  jobs?: ReadonlyArray<{ status?: string | null }> | null,
): boolean {
  const terminal = new Set(["completed", "cancelled", "failed"]);
  if (completedRecent?.id && terminal.has(completedRecent.status ?? "")) {
    return true;
  }
  return (jobs ?? []).some((job) => terminal.has(job.status ?? ""));
}

export function hasRelevantPaperSession(
  paperSessionStatus?: string | null,
): boolean {
  return Boolean(paperSessionStatus?.trim());
}

export function formatOperatorQueueCopy(input: {
  received: number;
  queued: number;
  executing: number;
  executed: number;
}): string {
  return `수신 ${input.received} · 대기 ${input.queued} · 실행 ${input.executing} · 완료 ${input.executed}`;
}

export function normalizeOperatorQueueCopy(label: string): string {
  return label.replace(/(수신|대기|실행|완료)\s*(\d+)/g, "$1 $2");
}

export function resolveOperatorRiskGaugeTone(input: {
  riskState?: string | null;
  emergencyActive?: boolean;
}): "ok" | "warn" | "bad" {
  if (input.emergencyActive) return "bad";
  switch (input.riskState) {
    case "정상":
      return "ok";
    case "주의":
      return "warn";
    case "위험":
    case "자동 중단":
      return "bad";
    default:
      return "ok";
  }
}

export function formatTodayTradingCostLine(input: {
  feeUsdt?: number | null;
  fundingUsdt?: number | null;
  slippageUsdt?: number | null;
}): string | null {
  const fee = input.feeUsdt;
  const funding = input.fundingUsdt;
  const slippage = input.slippageUsdt;
  if (
    typeof fee !== "number" ||
    typeof funding !== "number" ||
    typeof slippage !== "number" ||
    !Number.isFinite(fee) ||
    !Number.isFinite(funding) ||
    !Number.isFinite(slippage)
  ) {
    return null;
  }
  const paid = fee + funding + slippage;
  const impact = -paid;
  return `주요 거래비용 ${impact.toFixed(2)} USDT`;
}

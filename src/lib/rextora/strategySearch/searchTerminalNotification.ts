/**
 * Customer notifications for terminal Strategy Search outcomes.
 *
 * Observes already-persisted job snapshots. Does not live in the search runner
 * and does not send Telegram. Dedupe keys are stable per job + terminal status.
 */

export type SearchTerminalNotifyStatus = "completed" | "failed";

export type SearchTerminalJobView = {
  id: string;
  status: string;
  searchName?: string | null;
  symbols?: readonly string[] | null;
  timeframe?: string | null;
  qualifiedCount?: number | null;
  uniqueEvaluatedCount?: number | null;
  statistics?: { passed?: number | null } | null;
  failureMessage?: string | null;
};

export type SearchTerminalNotification = {
  dedupeKey: string;
  jobId: string;
  status: SearchTerminalNotifyStatus;
  title: string;
  description: string;
  actionLabel: string;
  targetRoute: string;
};

export const SEARCH_TERMINAL_NOTIFY_STATUSES = new Set<string>([
  "completed",
  "failed",
]);

const seenDedupeKeys = new Set<string>();
let observerBootstrapped = false;

export function searchTerminalDedupeKey(
  jobId: string,
  status: SearchTerminalNotifyStatus,
): string {
  return `strategy-search:${jobId}:${status}`;
}

export function searchTerminalDeepLink(jobId: string): string {
  return `/results?jobId=${encodeURIComponent(jobId)}`;
}

export function formatSearchNotificationTimeframe(
  timeframe: string | null | undefined,
): string | null {
  if (!timeframe || !timeframe.trim()) return null;
  const raw = timeframe.trim();
  const minutes = raw.match(/^(\d+)m$/i);
  if (minutes) return `${minutes[1]}분`;
  const hours = raw.match(/^(\d+)h$/i);
  if (hours) return `${hours[1]}시간`;
  const days = raw.match(/^(\d+)d$/i);
  if (days) return `${days[1]}일`;
  return raw;
}

function formatCount(value: number): string {
  return value.toLocaleString("ko-KR");
}

export function isSafeSearchFailureCustomerMessage(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const text = message.trim();
  if (text.length === 0 || text.length > 80) return false;
  if (/[\\/]|\.ts\b|\.js\b|Error:|at\s+\S+\s+\(|stack|Exception|ENOENT|ECONN|JSON\.|schemaVersion|lease|iteration|paramsHash|jobId\s*[:=]/i.test(text)) {
    return false;
  }
  if (/[{}$]/.test(text)) return false;
  return true;
}

function marketLine(job: SearchTerminalJobView): string | null {
  const symbol = job.symbols?.[0]?.trim() || null;
  const timeframe = formatSearchNotificationTimeframe(job.timeframe);
  if (symbol && timeframe) return `${symbol} · ${timeframe}`;
  if (symbol) return symbol;
  if (timeframe) return timeframe;
  return null;
}

function completedMetricsLine(job: SearchTerminalJobView): string | null {
  const passed =
    typeof job.statistics?.passed === "number" &&
    Number.isFinite(job.statistics.passed)
      ? job.statistics.passed
      : null;
  const qualified =
    typeof job.qualifiedCount === "number" && Number.isFinite(job.qualifiedCount)
      ? job.qualifiedCount
      : null;
  if (passed == null && qualified == null) return null;
  if (passed != null && qualified != null) {
    return `통과 후보 ${formatCount(passed)}개 · 최종 적격 ${formatCount(qualified)}개`;
  }
  if (passed != null) return `통과 후보 ${formatCount(passed)}개`;
  return `최종 적격 ${formatCount(qualified!)}개`;
}

export function buildSearchTerminalNotification(
  job: SearchTerminalJobView,
): SearchTerminalNotification | null {
  if (job.status !== "completed" && job.status !== "failed") return null;
  if (!job.id || !job.id.trim()) return null;

  const status = job.status;
  const market = marketLine(job);
  const lines: string[] = [];
  if (market) lines.push(market);

  if (status === "completed") {
    const metrics = completedMetricsLine(job);
    if (metrics) lines.push(metrics);
    return {
      dedupeKey: searchTerminalDedupeKey(job.id, "completed"),
      jobId: job.id,
      status,
      title: "전략 탐색이 완료되었습니다.",
      description: lines.join(" · "),
      actionLabel: "결과 확인",
      targetRoute: searchTerminalDeepLink(job.id),
    };
  }

  const safeFailure = isSafeSearchFailureCustomerMessage(job.failureMessage)
    ? job.failureMessage!.trim()
    : null;
  lines.push(
    safeFailure ?? "탐색 결과 화면에서 상태를 확인해 주세요.",
  );
  return {
    dedupeKey: searchTerminalDedupeKey(job.id, "failed"),
    jobId: job.id,
    status,
    title: "전략 탐색을 완료하지 못했습니다.",
    description: lines.join(" · "),
    actionLabel: "상태 확인",
    targetRoute: searchTerminalDeepLink(job.id),
  };
}

export function resetSearchTerminalNotificationObserverForTests(): void {
  seenDedupeKeys.clear();
  observerBootstrapped = false;
}

/**
 * Observe persisted job snapshots.
 * First call baselines existing terminal jobs (no emissions).
 * Later calls emit one notification per newly observed completed/failed job.
 */
export function observeSearchTerminalJobs(
  jobs: readonly SearchTerminalJobView[],
): SearchTerminalNotification[] {
  const current: SearchTerminalNotification[] = [];
  for (const job of jobs) {
    const built = buildSearchTerminalNotification(job);
    if (built) current.push(built);
  }

  if (!observerBootstrapped) {
    for (const item of current) seenDedupeKeys.add(item.dedupeKey);
    observerBootstrapped = true;
    return [];
  }

  const emitted: SearchTerminalNotification[] = [];
  for (const item of current) {
    if (seenDedupeKeys.has(item.dedupeKey)) continue;
    seenDedupeKeys.add(item.dedupeKey);
    emitted.push(item);
  }
  return emitted;
}

export function toOperatorTerminalResearch(
  jobs: readonly SearchTerminalJobView[],
): SearchTerminalJobView[] {
  return jobs.filter(
    (job) => job.status === "completed" || job.status === "failed",
  );
}

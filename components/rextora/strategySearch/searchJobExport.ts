/**
 * Customer Strategy Search export/report read model.
 * Sources: results-summary + job detail + appliedSearchSummary.
 * Does not read trial files, checkpoints, or developer payloads.
 */

import { rankingGroupLabel } from "@/src/lib/rextora/researchRankingReadModel";
import {
  fetchResearchResultsSummary,
  getStrategySearchJob,
} from "./apiClient";
import { formatCustomerSearchValue } from "./customerDisplay";
import { cleanStrategyDisplayName } from "./displayNames";
import {
  formatCount,
  formatMddAbsPct,
  formatMs,
  formatPct,
  formatScore,
  formatTimeKo,
  researchStatusLabelKo,
} from "./formatters";
import {
  composedJobMarketTitle,
  displayJobSearchTitle,
} from "./jobDisplayName";
import { StrategySearchClientError } from "./types";
import type {
  ResearchResultCardView,
  ResearchResultsSummaryView,
  StrategySearchJobDetail,
  StrategySearchJobStatus,
} from "./types";

export const SEARCH_JOB_REPORT_PATH = "/strategy-search/report";
export const EXPORT_ELIGIBLE_STATUS = "completed" as const;
export const EXPORT_INELIGIBLE_COPY =
  "정상 완료된 탐색에서 보고서를 만들 수 있습니다.";
export const EXPORT_DELETED_COPY =
  "선택한 탐색을 찾을 수 없습니다. 삭제되었거나 접근할 수 없습니다.";
export const EXPORT_READ_FAILURE_COPY = "탐색 결과를 불러오지 못했습니다.";
export const EXPORT_EMPTY_DENIED_COPY =
  "내보낼 결과 자료가 없어 파일을 만들지 않았습니다.";
export const EXPORT_DISCLAIMER =
  "본 보고서는 전략 탐색 및 과거 데이터 평가 결과를 정리한 자료입니다. 실제 시장 성과를 보장하지 않습니다.";
export const EXPORT_DOCUMENT_TITLE = "Rextora 전략 탐색 보고서";

const SETTING_LABELS = [
  "심볼",
  "타임프레임",
  "분석 구간 시작",
  "분석 구간 종료",
  "깊이 프로필",
  "합격 프로필",
  "탐색 이름",
  "시장 모드",
  "활성 전략 패밀리",
  "방향",
  "선택 모드",
  "설정 수준",
  "롱/숏",
] as const;

const COST_LABELS = [
  "최대 낙폭 기준",
  "최소 거래",
  "최소 수익",
  "수수료",
  "슬리피지",
  "스프레드",
  "펀딩",
  "펀딩 수수료",
  "비용 스트레스",
  "거래 안정성(지터)",
  "레버리지 모드",
  "레버리지 값",
] as const;

const SETTINGS_SECTION_IDS = new Set([
  "target",
  "period",
  "strategy_scope",
  "engine",
  "pattern_config",
  "validation",
]);
const COST_SECTION_IDS = new Set(["risk", "validation"]);

const FORBIDDEN_EXPORT_PATTERN =
  /checkpoint|randomState|random state|runnerPayload|runner payload|developerPayload|paramsHash|strategyHash|\bgeneration\b|\blease\b|\bworker\b|\bseed\b|stackTrace|stack trace|\bjobId\b|researchEvaluationHash|\bcandidateId\b|\bclusterId\b|developer payload/i;

export type SearchJobExportKv = { label: string; value: string };

export type SearchJobExportCandidate = {
  role: "최종 추천 후보" | "최고 점수 후보";
  name: string;
  status: string;
  passed: boolean;
  recommended: boolean;
  returnLabel: string;
  mddLabel: string;
  tradesLabel: string;
  scoreLabel: string;
  reason: string;
};

export type SearchJobExportGroup = {
  groupLabel: string;
  recommended: SearchJobExportCandidate | null;
  rawBest: SearchJobExportCandidate | null;
};

export type SearchJobExportModel = {
  documentTitle: typeof EXPORT_DOCUMENT_TITLE;
  generatedAt: string;
  searchName: string;
  symbol: string;
  timeframe: string;
  statusLabel: string;
  startedAt: string;
  finishedAt: string;
  finishedDate: string;
  elapsed: string;
  analysisPeriod: string;
  configuration: SearchJobExportKv[];
  funnel: SearchJobExportKv[];
  costRisk: SearchJobExportKv[];
  groups: SearchJobExportGroup[];
  reasons: string[];
  nextSteps: string[];
  disclaimer: typeof EXPORT_DISCLAIMER;
};

export function isExportEligibleStatus(
  status: string | null | undefined,
): boolean {
  return status === EXPORT_ELIGIBLE_STATUS;
}

export function buildSearchReportHref(jobId: string): string {
  const params = new URLSearchParams({ jobId });
  return `${SEARCH_JOB_REPORT_PATH}?${params.toString()}`;
}

function dateStamp(iso: string | null | undefined): string {
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

export function sanitizeExportFilenamePart(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || "search";
}

export function buildExportFilename(
  searchName: string,
  finishedAt: string | null | undefined,
  ext: "json" | "csv" | "pdf",
): string {
  return `rextora-strategy-search_${sanitizeExportFilenamePart(searchName)}_${dateStamp(finishedAt)}.${ext}`;
}

function summaryRowValue(
  summary: StrategySearchJobDetail["appliedSearchSummary"],
  sectionIds: Set<string>,
  labelKo: string,
): string {
  for (const section of summary?.sections ?? []) {
    if (!sectionIds.has(section.id)) continue;
    const found = section.rows.find((row) => row.labelKo === labelKo);
    if (found) return formatCustomerSearchValue(found.valueKo);
  }
  return "—";
}

function collectLabeledRows(
  summary: StrategySearchJobDetail["appliedSearchSummary"],
  sectionIds: Set<string>,
  labels: readonly string[],
): SearchJobExportKv[] {
  return labels
    .map((label) => ({
      label,
      value: summaryRowValue(summary, sectionIds, label),
    }))
    .filter((row) => row.value !== "—");
}

function safeRate(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): string {
  if (
    numerator == null ||
    denominator == null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return "—";
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function analysisPeriod(job: StrategySearchJobDetail): string {
  const start = summaryRowValue(
    job.appliedSearchSummary,
    new Set(["period"]),
    "분석 구간 시작",
  );
  const end = summaryRowValue(
    job.appliedSearchSummary,
    new Set(["period"]),
    "분석 구간 종료",
  );
  if (start === "—" && end === "—") return "—";
  return `${start} ~ ${end}`;
}

function cardsFromSummary(
  summary: ResearchResultsSummaryView,
): ResearchResultCardView[] {
  return [
    summary.topRecommend,
    summary.topProfit,
    summary.topStable,
    ...(summary.backtestRecommendations ?? []),
    ...(summary.top10 ?? []),
    ...(summary.representatives ?? []),
  ].filter((card): card is ResearchResultCardView => Boolean(card));
}

function cardByIteration(
  cards: ResearchResultCardView[],
  iteration: number | null | undefined,
): ResearchResultCardView | null {
  if (iteration == null) return null;
  return cards.find((card) => card.iteration === iteration) ?? null;
}

function candidateName(card: ResearchResultCardView | null, fallback: string): string {
  if (!card) return fallback;
  return (
    cleanStrategyDisplayName(card.displayAlias || card.readableName) || fallback
  );
}

function buildCandidate(
  role: SearchJobExportCandidate["role"],
  ref:
    | {
        iteration: number;
        score: number | null;
        passed: boolean;
      }
    | null
    | undefined,
  card: ResearchResultCardView | null,
  recommended: boolean,
): SearchJobExportCandidate | null {
  if (!ref) return null;
  const passed = ref.passed === true;
  const status = recommended
    ? passed
      ? "최종 추천"
      : "자격 미통과"
    : passed
      ? "최고 점수 · 추천 아님"
      : "자격 미통과";
  return {
    role,
    name: candidateName(card, role),
    status,
    passed,
    recommended,
    returnLabel: formatPct(card?.netReturn) ?? "—",
    mddLabel: formatMddAbsPct(card?.maxDrawdown) ?? "—",
    tradesLabel:
      card?.tradeCount != null && Number.isFinite(card.tradeCount)
        ? formatCount(card.tradeCount)
        : "—",
    scoreLabel: formatScore(ref.score) ?? "—",
    reason: card?.recommendationReason?.trim() || "—",
  };
}

function customerExportError(err: unknown): string {
  if (err instanceof StrategySearchClientError) {
    if (err.httpStatus === 404 || err.code === "JOB_NOT_FOUND") {
      return EXPORT_DELETED_COPY;
    }
    return err.message || EXPORT_READ_FAILURE_COPY;
  }
  return EXPORT_READ_FAILURE_COPY;
}

export function buildSearchJobExport(input: {
  job: StrategySearchJobDetail;
  summary: ResearchResultsSummaryView;
  generatedAt?: string;
}):
  | { ok: true; model: SearchJobExportModel }
  | { ok: false; error: string } {
  if (!isExportEligibleStatus(input.job.status)) {
    return { ok: false, error: EXPORT_INELIGIBLE_COPY };
  }
  if (!input.summary || !input.summary.counts) {
    return { ok: false, error: EXPORT_EMPTY_DENIED_COPY };
  }

  const titled = displayJobSearchTitle({
    id: input.job.id,
    searchName: input.summary.searchName || input.job.searchName,
    symbols: input.job.symbols,
    timeframe: input.job.timeframe,
  });
  const searchName =
    titled === input.job.id
      ? composedJobMarketTitle({
          id: input.job.id,
          symbols: input.job.symbols,
          timeframe: input.job.timeframe,
        }) || "전략 탐색"
      : titled;
  const counts = input.summary.counts;
  const cards = cardsFromSummary(input.summary);
  const groups = (input.summary.rankingGroups ?? []).map((group) => {
    const recommendedCard = cardByIteration(
      cards,
      group.bestPassedCandidate?.iteration,
    );
    const rawCard = cardByIteration(cards, group.bestCandidate?.iteration);
    const recommended = buildCandidate(
      "최종 추천 후보",
      group.bestPassedCandidate,
      recommendedCard,
      true,
    );
    const rawBest = buildCandidate(
      "최고 점수 후보",
      group.bestCandidate,
      rawCard,
      false,
    );
    const rawUseful =
      rawBest &&
      (!recommended ||
        rawBest.passed === false ||
        rawBest.scoreLabel !== recommended.scoreLabel ||
        rawBest.name !== recommended.name);
    return {
      groupLabel: rankingGroupLabel(group.rankingCompatibilityGroup),
      recommended,
      rawBest: rawUseful ? rawBest : null,
    };
  });

  const reasons = (input.summary.selectionSummary?.whyTopSelected ?? []).filter(
    (line) => line.trim() && !FORBIDDEN_EXPORT_PATTERN.test(line),
  );
  const nextSteps = (input.summary.selectionSummary?.nextActions ?? []).filter(
    (line) => line.trim() && !FORBIDDEN_EXPORT_PATTERN.test(line),
  );

  return {
    ok: true,
    model: {
      documentTitle: EXPORT_DOCUMENT_TITLE,
      generatedAt: formatTimeKo(input.generatedAt ?? new Date().toISOString()) ?? "—",
      searchName,
      symbol: input.summary.symbol || input.job.symbols[0] || "—",
      timeframe: input.summary.timeframe || input.job.timeframe || "—",
      statusLabel: researchStatusLabelKo(
        input.job.status as StrategySearchJobStatus,
      ),
      startedAt: formatTimeKo(input.job.startedAt) ?? "—",
      finishedAt: formatTimeKo(input.job.finishedAt) ?? "—",
      finishedDate: dateStamp(input.job.finishedAt),
      elapsed: formatMs(input.job.elapsedMs) ?? "—",
      analysisPeriod: analysisPeriod(input.job),
      configuration: collectLabeledRows(
        input.job.appliedSearchSummary,
        SETTINGS_SECTION_IDS,
        SETTING_LABELS,
      ),
      funnel: [
        { label: "평가 후보", value: formatCount(counts.evaluatedStrategies) },
        { label: "통과 후보", value: formatCount(counts.qualifiedStrategies) },
        {
          label: "최종 적격",
          value: formatCount(counts.stageFinalRecommendable),
        },
        { label: "저장 후보", value: formatCount(counts.top10Saved) },
        { label: "등록 전략", value: formatCount(counts.registeredStrategies) },
        {
          label: "통과율",
          value: safeRate(
            counts.qualifiedStrategies,
            counts.evaluatedStrategies,
          ),
        },
        {
          label: "최종 적격률",
          value: safeRate(
            counts.stageFinalRecommendable,
            counts.evaluatedStrategies,
          ),
        },
        { label: "소요 시간", value: formatMs(input.job.elapsedMs) ?? "—" },
      ],
      costRisk: collectLabeledRows(
        input.job.appliedSearchSummary,
        COST_SECTION_IDS,
        COST_LABELS,
      ),
      groups,
      reasons,
      nextSteps,
      disclaimer: EXPORT_DISCLAIMER,
    },
  };
}

export function toCustomerExportJson(model: SearchJobExportModel): Record<string, unknown> {
  return {
    문서: model.documentTitle,
    "생성 시각": model.generatedAt,
    "기본 정보": {
      "탐색 이름": model.searchName,
      시장: model.symbol,
      시간봉: model.timeframe,
      상태: model.statusLabel,
      "시작 시각": model.startedAt,
      "완료 시각": model.finishedAt,
      "소요 시간": model.elapsed,
      "분석 기간": model.analysisPeriod,
    },
    "탐색 설정": Object.fromEntries(
      model.configuration.map((row) => [row.label, row.value]),
    ),
    "결과 요약": Object.fromEntries(
      model.funnel.map((row) => [row.label, row.value]),
    ),
    "비용 · 위험 가정": Object.fromEntries(
      model.costRisk.map((row) => [row.label, row.value]),
    ),
    "전략군별 추천": model.groups.map((group) => ({
      전략군: group.groupLabel,
      "최종 추천 후보": group.recommended
        ? {
            이름: group.recommended.name,
            상태: group.recommended.status,
            수익률: group.recommended.returnLabel,
            MDD: group.recommended.mddLabel,
            "거래 수": group.recommended.tradesLabel,
            점수: group.recommended.scoreLabel,
            "추천 사유": group.recommended.reason,
          }
        : "없음",
      "최고 점수 후보": group.rawBest
        ? {
            이름: group.rawBest.name,
            상태: group.rawBest.status,
            수익률: group.rawBest.returnLabel,
            MDD: group.rawBest.mddLabel,
            "거래 수": group.rawBest.tradesLabel,
            점수: group.rawBest.scoreLabel,
            비고: group.rawBest.passed ? "추천 아님" : "자격 미통과",
          }
        : "없음",
    })),
    "추천 근거": model.reasons,
    "다음 단계": model.nextSteps,
    안내: model.disclaimer,
  };
}

export function serializeCustomerExportJson(model: SearchJobExportModel): string {
  const payload = toCustomerExportJson(model);
  assertCustomerExportSanitized(payload);
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeCustomerExportCsv(model: SearchJobExportModel): string {
  assertCustomerExportSanitized(toCustomerExportJson(model));
  const lines: string[] = [];
  const pair = (label: string, value: string) =>
    `${csvEscape(label)},${csvEscape(value)}`;

  lines.push("[기본 정보]");
  lines.push("항목,값");
  lines.push(pair("탐색 이름", model.searchName));
  lines.push(pair("시장", model.symbol));
  lines.push(pair("시간봉", model.timeframe));
  lines.push(pair("상태", model.statusLabel));
  lines.push(pair("시작 시각", model.startedAt));
  lines.push(pair("완료 시각", model.finishedAt));
  lines.push(pair("소요 시간", model.elapsed));
  lines.push(pair("분석 기간", model.analysisPeriod));
  lines.push("");
  lines.push("[탐색 설정]");
  lines.push("항목,값");
  for (const row of model.configuration) {
    lines.push(pair(row.label, row.value));
  }
  lines.push("");
  lines.push("[결과 요약]");
  lines.push("항목,값");
  for (const row of model.funnel) {
    lines.push(pair(row.label, row.value));
  }
  lines.push("");
  lines.push("[비용 · 위험 가정]");
  lines.push("항목,값");
  for (const row of model.costRisk) {
    lines.push(pair(row.label, row.value));
  }
  lines.push("");
  lines.push("[전략군 추천]");
  lines.push("전략군,상태,후보명,수익률,MDD,거래 수,추천 사유");
  for (const group of model.groups) {
    const write = (candidate: SearchJobExportCandidate) => {
      lines.push(
        [
          csvEscape(group.groupLabel),
          csvEscape(candidate.status),
          csvEscape(candidate.name),
          csvEscape(candidate.returnLabel),
          csvEscape(candidate.mddLabel),
          csvEscape(candidate.tradesLabel),
          csvEscape(candidate.reason),
        ].join(","),
      );
    };
    if (group.recommended) write(group.recommended);
    if (group.rawBest) write(group.rawBest);
  }
  lines.push("");
  lines.push("[추천 근거]");
  for (const reason of model.reasons) lines.push(pair("근거", reason));
  lines.push("");
  lines.push("[다음 단계]");
  for (const step of model.nextSteps) lines.push(pair("다음 단계", step));
  lines.push("");
  lines.push("[안내]");
  lines.push(pair("안내", model.disclaimer));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function assertCustomerExportSanitized(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  if (FORBIDDEN_EXPORT_PATTERN.test(serialized)) {
    throw new Error("customer export contained internal fields");
  }
}

export function customerExportContainsInternalFields(payload: unknown): boolean {
  return FORBIDDEN_EXPORT_PATTERN.test(JSON.stringify(payload));
}

export async function loadSearchJobExportModel(
  jobId: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; model: SearchJobExportModel }
  | { ok: false; error: string }
> {
  try {
    const [job, summary] = await Promise.all([
      getStrategySearchJob(jobId),
      fetchResearchResultsSummary(jobId, signal),
    ]);
    return buildSearchJobExport({ job, summary });
  } catch (err) {
    return { ok: false, error: customerExportError(err) };
  }
}

export function downloadTextFile(input: {
  filename: string;
  content: string;
  mime: string;
}): void {
  if (typeof document === "undefined") {
    throw new Error(EXPORT_READ_FAILURE_COPY);
  }
  const blob = new Blob([input.content], { type: input.mime });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = input.filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

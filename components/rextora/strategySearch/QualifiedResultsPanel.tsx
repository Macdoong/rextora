"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@/components/ui/primitives";
import {
  formatMddAbsPct,
  formatOptional,
  formatPct,
  formatScore,
} from "./formatters";
import { summarizeRulesKo } from "./ruleSummary";
import {
  recommendationStars,
  splitStrategyTitle,
  whyAiSelected,
} from "./displayNames";

export type RegistrationStateUi =
  | "not_registered"
  | "registered"
  | "duplicate";

export interface QualifiedStrategyCardModel {
  key: string;
  name: string;
  strategyType: string;
  market?: string | null;
  timeframe?: string | null;
  trades: number | null;
  winRate: number | null;
  totalReturn: number | null;
  mdd: number | null;
  sharpe: number | null;
  score: number | null;
  status: string;
  registrationState: RegistrationStateUi;
  createdAt: string | null;
  strategyId: string | null;
  iteration: number;
  jobId: string;
  finalPass: boolean;
  stressPass: boolean | null;
  jitterPass: boolean | null;
  jitterEnabled?: boolean | null;
  params: Record<string, unknown> | null;
  monthlyReturns?: Array<{ month: string; returnPct: number }>;
  profitFactor?: number | null;
}

export interface RegistrationSummary {
  registered: number;
  duplicate: number;
  failed: number;
}

type FilterId = "all" | "not_registered" | "registered";
type SortId = "return" | "mdd" | "trades" | "winRate";

function registrationLabel(state: RegistrationStateUi): string {
  switch (state) {
    case "registered":
      return "등록됨";
    case "duplicate":
      return "이미 등록됨";
    default:
      return "미등록";
  }
}

function registrationTone(
  state: RegistrationStateUi,
): "success" | "muted" | "warning" {
  if (state === "registered") return "success";
  if (state === "duplicate") return "muted";
  return "warning";
}

function nullsLastCompare(
  a: number | null | undefined,
  b: number | null | undefined,
  desc: boolean,
): number {
  const aNull = a == null || !Number.isFinite(a);
  const bNull = b == null || !Number.isFinite(b);
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return desc ? (b as number) - (a as number) : (a as number) - (b as number);
}

function recommendRank(
  a: QualifiedStrategyCardModel,
  b: QualifiedStrategyCardModel,
): number {
  const byScore = nullsLastCompare(a.score, b.score, true);
  if (byScore !== 0) return byScore;
  return nullsLastCompare(a.totalReturn, b.totalReturn, true);
}

function sortItems(
  items: QualifiedStrategyCardModel[],
  sort: SortId,
): QualifiedStrategyCardModel[] {
  const copy = [...items];
  copy.sort((a, b) => {
    let primary = 0;
    switch (sort) {
      case "return":
        primary = nullsLastCompare(a.totalReturn, b.totalReturn, true);
        break;
      case "mdd":
        primary = nullsLastCompare(
          a.mdd == null ? null : Math.abs(a.mdd),
          b.mdd == null ? null : Math.abs(b.mdd),
          false,
        );
        break;
      case "trades":
        primary = nullsLastCompare(a.trades, b.trades, true);
        break;
      case "winRate":
        primary = nullsLastCompare(a.winRate, b.winRate, true);
        break;
    }
    if (primary !== 0) return primary;
    return nullsLastCompare(a.score, b.score, true);
  });
  return copy;
}

function MetricCell(props: { label: string; value: string }) {
  return (
    <div>
      <div className="ss-field-label text-[11px]">{props.label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text-primary)]">
        {props.value}
      </div>
    </div>
  );
}

function SectionTitle(props: { children: string }) {
  return (
    <h5 className="ss-subsection-title text-[var(--text-secondary)]">
      {props.children}
    </h5>
  );
}

function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="ss-register-confirm-title"
      data-testid="ss-register-confirm"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-5 shadow-xl">
        <h4
          id="ss-register-confirm-title"
          className="text-base font-semibold text-white"
        >
          {props.title}
        </h4>
        <p className="mt-2 text-sm text-slate-300">{props.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            data-testid="ss-register-cancel"
            disabled={props.pending}
            onClick={props.onCancel}
          >
            취소
          </Button>
          <Button
            type="button"
            data-testid="ss-register-confirm-btn"
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {props.pending ? "등록 중…" : props.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailDrawer(props: {
  item: QualifiedStrategyCardModel;
  registering?: boolean;
  onClose: () => void;
  onRegister: (iteration: number) => void;
}) {
  const { item } = props;
  const rules = summarizeRulesKo(item.params);
  const win = formatPct(item.winRate);
  const ret = formatPct(item.totalReturn);
  const mdd = formatMddAbsPct(item.mdd);
  const sharpe = formatOptional(item.sharpe, (n) => n.toFixed(2));
  const pf = formatOptional(item.profitFactor, (n) => n.toFixed(2));
  const trades = formatOptional(item.trades, (n) => String(Math.trunc(n)));
  const score = formatScore(item.score);
  const canRegister = item.registrationState === "not_registered";
  const isRegistered =
    item.registrationState === "registered" ||
    item.registrationState === "duplicate";
  const { title, style } = splitStrategyTitle(item.name);
  const stars = recommendationStars(item);
  const why = whyAiSelected(item);
  const showJitter = item.jitterEnabled === true;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/50"
      role="dialog"
      aria-modal
      aria-labelledby={`ss-detail-title-${item.key}`}
      data-testid={`ss-qualified-detail-${item.key}`}
      onClick={props.onClose}
    >
      <aside
        className="flex h-full w-full max-w-none flex-col overflow-y-auto border-l border-slate-700 bg-slate-950 shadow-2xl sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h4
              id={`ss-detail-title-${item.key}`}
              className="text-base font-semibold text-white"
            >
              {title}
            </h4>
            {style ? (
              <p className="mt-0.5 text-sm text-amber-200/90">{style}</p>
            ) : null}
            <p className="mt-1 text-xs text-slate-400">
              {item.strategyType}
              {item.market ? ` · ${item.market}` : ""}
              {item.timeframe ? ` · ${item.timeframe}` : ""}
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>
            탐색으로 돌아가기
          </Button>
        </div>

        <div className="space-y-7 px-5 py-5 text-sm text-slate-300">
          <section>
            <SectionTitle>개요</SectionTitle>
            <div className="mt-2 space-y-2">
              <div
                className="text-lg tracking-wide text-amber-200"
                aria-label={`추천 ${stars.stars}점 / 5점`}
              >
                추천 {stars.label}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={registrationTone(item.registrationState)}>
                  {registrationLabel(item.registrationState)}
                </Badge>
                {item.finalPass ? <Badge tone="success">합격</Badge> : null}
              </div>
              <p className="leading-relaxed text-[var(--text-secondary)]">
                AI가 목표 조건을 통과한 전략입니다. 성과와 규칙을 확인한 뒤
                필요할 때만 등록하세요.
              </p>
            </div>
          </section>

          <section>
            <SectionTitle>AI가 선택한 이유</SectionTitle>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-200">
              {why.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>

          <section>
            <SectionTitle>성과</SectionTitle>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {ret ? <MetricCell label="수익률" value={ret} /> : null}
              {mdd ? <MetricCell label="최대 손실" value={mdd} /> : null}
              {win ? <MetricCell label="승률" value={win} /> : null}
              {pf ? <MetricCell label="손익비" value={pf} /> : null}
              {trades ? <MetricCell label="거래 수" value={trades} /> : null}
              {sharpe ? <MetricCell label="샤프" value={sharpe} /> : null}
            </div>
          </section>

          {rules ? (
            <>
              <section>
                <SectionTitle>진입</SectionTitle>
                <p className="mt-1 leading-relaxed">{rules.entryKo}</p>
              </section>
              <section>
                <SectionTitle>청산</SectionTitle>
                <p className="mt-1 leading-relaxed">{rules.exitKo}</p>
              </section>
              <section>
                <SectionTitle>위험</SectionTitle>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="ss-field-label text-xs">손절</dt>
                    <dd className="mt-0.5">{rules.stopLossKo}</dd>
                  </div>
                  <div>
                    <dt className="ss-field-label text-xs">익절</dt>
                    <dd className="mt-0.5">{rules.takeProfitKo}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="ss-field-label text-xs">위험</dt>
                    <dd className="mt-0.5">{rules.riskKo}</dd>
                  </div>
                </dl>
              </section>
            </>
          ) : null}

          {item.params && Object.keys(item.params).length > 0 ? (
            <section>
              <SectionTitle>파라미터</SectionTitle>
              <ul className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                {Object.entries(item.params)
                  .filter(
                    ([, v]) =>
                      typeof v === "number" ||
                      typeof v === "boolean" ||
                      typeof v === "string",
                  )
                  .slice(0, 24)
                  .map(([k, v]) => (
                    <li key={k} className="truncate">
                      {k}: {String(v)}
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          <details className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <summary className="cursor-pointer ss-subsection-title text-[var(--text-muted)]">
              기술 정보
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
              {score ? <div>내부 점수: {score}</div> : null}
              <div>반복: {item.iteration}</div>
              {item.stressPass != null ? (
                <div>
                  비용 검증: {item.stressPass ? "통과" : "미통과"}
                </div>
              ) : null}
              {showJitter ? (
                <div>
                  안정성:{" "}
                  {item.jitterPass === true
                    ? "통과"
                    : item.jitterPass === false
                      ? "미통과"
                      : "해당 없음"}
                </div>
              ) : null}
            </div>
          </details>

          <section className="border-t border-slate-800 pt-4">
            {isRegistered ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-emerald-200">
                  {registrationLabel(item.registrationState)}
                </span>
                {item.strategyId ? (
                  <Link
                    href={`/strategies?id=${encodeURIComponent(item.strategyId)}`}
                    className="inline-flex text-sm font-medium text-emerald-300 hover:text-emerald-200"
                    data-testid={`ss-view-strategy-${item.key}`}
                  >
                    전략 열기
                  </Link>
                ) : (
                  <Link
                    href="/strategies"
                    className="inline-flex text-sm font-medium text-emerald-300 hover:text-emerald-200"
                    data-testid={`ss-open-sm-${item.key}`}
                  >
                    전략 관리 열기
                  </Link>
                )}
              </div>
            ) : canRegister ? (
              <Button
                type="button"
                data-testid={`ss-register-one-${item.key}`}
                disabled={props.registering}
                onClick={() => props.onRegister(item.iteration)}
              >
                등록
              </Button>
            ) : (
              <p className="text-xs text-slate-500">이미 등록됨</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function StrategyCard(props: {
  item: QualifiedStrategyCardModel;
  large?: boolean;
  selected: boolean;
  onToggleSelect: (iteration: number) => void;
  onOpenDetail: (key: string) => void;
  onRequestRegister: (iteration: number) => void;
  registering?: boolean;
}) {
  const { item } = props;
  const win = formatPct(item.winRate);
  const ret = formatPct(item.totalReturn);
  const mdd = formatMddAbsPct(item.mdd);
  const pf = formatOptional(item.profitFactor, (n) => n.toFixed(2));
  const trades = formatOptional(item.trades, (n) => String(Math.trunc(n)));
  const canRegister = item.registrationState === "not_registered";
  const isRegistered =
    item.registrationState === "registered" ||
    item.registrationState === "duplicate";
  const { title, style } = splitStrategyTitle(item.name);
  const stars = recommendationStars(item);

  return (
    <article
      data-testid={`ss-qualified-row-${item.key}`}
      className={`rextora-card ss-pass-card flex flex-col p-5 ${
        props.large ? "border-amber-500/25" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {canRegister ? (
            <input
              type="checkbox"
              className="mt-1"
              checked={props.selected}
              data-testid={`ss-qualified-select-${item.key}`}
              onChange={() => props.onToggleSelect(item.iteration)}
              aria-label={`${title} 선택`}
            />
          ) : null}
          <div className="min-w-0 space-y-1">
            <h4
              className={`font-semibold text-white ${
                props.large ? "text-lg" : "text-base"
              }`}
            >
              {title}
            </h4>
            <p className="text-xs text-slate-400">
              {item.strategyType}
              {style ? ` · ${style}` : ""}
              {item.market ? ` · ${item.market}` : ""}
              {item.timeframe ? ` · ${item.timeframe}` : ""}
            </p>
            <div
              className="text-sm tracking-wide text-amber-200"
              aria-label={`추천 ${stars.stars}점 / 5점`}
            >
              추천 {stars.label}
            </div>
          </div>
        </div>
        <Badge tone={registrationTone(item.registrationState)}>
          {registrationLabel(item.registrationState)}
        </Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ret ? <MetricCell label="수익률" value={ret} /> : null}
        {mdd ? <MetricCell label="최대 손실" value={mdd} /> : null}
        {win ? <MetricCell label="승률" value={win} /> : null}
        {pf ? <MetricCell label="손익비" value={pf} /> : null}
        {trades ? <MetricCell label="거래 수" value={trades} /> : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800/80 pt-4">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid={`ss-qualified-open-${item.key}`}
          onClick={() => props.onOpenDetail(item.key)}
        >
          보기
        </Button>
        {canRegister ? (
          <Button
            type="button"
            size="sm"
            data-testid={`ss-register-one-${item.key}`}
            disabled={props.registering}
            onClick={() => props.onRequestRegister(item.iteration)}
          >
            등록
          </Button>
        ) : null}
        {isRegistered ? (
          item.strategyId ? (
            <Link
              href={`/strategies?id=${encodeURIComponent(item.strategyId)}`}
              className="inline-flex h-8 items-center rounded-lg border border-emerald-600/40 px-3 text-xs text-emerald-100 hover:bg-emerald-900/20"
              data-testid={`ss-view-strategy-${item.key}`}
            >
              전략 열기
            </Link>
          ) : (
            <Link
              href="/strategies"
              className="inline-flex h-8 items-center rounded-lg border border-emerald-600/40 px-3 text-xs text-emerald-100 hover:bg-emerald-900/20"
              data-testid={`ss-open-sm-card-${item.key}`}
            >
              전략 관리 열기
            </Link>
          )
        ) : null}
        {isRegistered ? (
          <span className="text-xs text-emerald-200/90">이미 등록됨</span>
        ) : null}
      </div>
    </article>
  );
}

export function QualifiedResultsPanel(props: {
  items: QualifiedStrategyCardModel[];
  emptyHint?: string;
  researchRunning?: boolean;
  researchCompleted?: boolean;
  onNewResearch?: () => void;
  registering?: boolean;
  registrationSummary?: RegistrationSummary | null;
  onRegister: (iterations: number[]) => void | Promise<void>;
}) {
  const { items, registering, onRegister } = props;
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("return");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [restOpen, setRestOpen] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [pendingIterations, setPendingIterations] = useState<number[] | null>(
    null,
  );

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "not_registered") {
      list = list.filter((i) => i.registrationState === "not_registered");
    } else if (filter === "registered") {
      list = list.filter(
        (i) =>
          i.registrationState === "registered" ||
          i.registrationState === "duplicate",
      );
    }
    return sortItems(list, sort);
  }, [items, filter, sort]);

  const recommended = useMemo(() => {
    const ranked = [...filtered].sort(recommendRank);
    return ranked.slice(0, 3);
  }, [filtered]);

  const recommendedKeys = useMemo(
    () => new Set(recommended.map((r) => r.key)),
    [recommended],
  );

  const rest = useMemo(
    () => filtered.filter((i) => !recommendedKeys.has(i.key)),
    [filtered, recommendedKeys],
  );

  const detailItem = detailKey
    ? items.find((i) => i.key === detailKey) ?? null
    : null;

  function toggleSelect(iteration: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iteration)) next.delete(iteration);
      else next.add(iteration);
      return next;
    });
  }

  function requestRegister(iterations: number[]) {
    if (iterations.length === 0 || registering) return;
    setPendingIterations(iterations);
  }

  async function confirmRegister() {
    if (!pendingIterations || pendingIterations.length === 0) return;
    const iters = pendingIterations;
    setPendingIterations(null);
    await onRegister(iters);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of iters) next.delete(it);
      return next;
    });
  }

  if (items.length === 0) {
    if (props.researchCompleted) {
      return (
        <section
          className="ss-empty-card space-y-4"
          data-testid="ss-qualified-results"
        >
          <h3 className="ss-section-title">합격 전략이 없습니다</h3>
          <p className="text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
            연구가 끝났지만 목표 조건을 통과한 전략이 없습니다. 설정을 조정한 뒤
            다시 탐색해 보세요.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[0.9375rem] text-[var(--text-secondary)]">
            <li>후보 예산 늘리기</li>
            <li>기간 늘리기</li>
            <li>최대 손실 완화</li>
            <li>최소 거래 수 줄이기</li>
          </ul>
          {props.onNewResearch ? (
            <Button
              type="button"
              className="ss-btn-primary"
              data-testid="ss-empty-new-research"
              onClick={props.onNewResearch}
            >
              새 탐색
            </Button>
          ) : null}
        </section>
      );
    }
    if (props.researchRunning) {
      return (
        <section
          className="ss-empty-card space-y-2"
          data-testid="ss-qualified-results"
        >
          <h3 className="ss-section-title">아직 합격 전략이 없습니다</h3>
          <p className="text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
            연구가 진행 중입니다. 기준을 통과한 전략이 나오면 이곳에 표시됩니다.
          </p>
        </section>
      );
    }
    return (
      <section
        className="ss-empty-card space-y-2"
        data-testid="ss-qualified-results"
      >
        <h3 className="ss-section-title">합격 전략 대기 중</h3>
        <p className="text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
          {props.emptyHint ??
            "탐색을 시작하면 기준을 통과한 전략이 이곳에 표시됩니다."}
        </p>
      </section>
    );
  }

  const selectedCount = [...selected].filter((it) =>
    items.some(
      (i) => i.iteration === it && i.registrationState === "not_registered",
    ),
  ).length;

  const summary = props.registrationSummary;
  const registeredCount = items.filter(
    (i) =>
      i.registrationState === "registered" ||
      i.registrationState === "duplicate",
  ).length;
  const unregisteredCount = items.length - registeredCount;

  return (
    <section
      className="space-y-5"
      data-testid="ss-qualified-results"
      aria-labelledby="ss-qualified-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="ss-qualified-title" className="ss-section-title">
            합격 전략
            <span className="ml-2 text-base font-normal text-slate-400">
              {items.length}
            </span>
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {unregisteredCount > 0
              ? `미등록 ${unregisteredCount}건 · 등록됨 ${registeredCount}건`
              : "모두 등록됨 · 추가로 등록할 전략이 없습니다."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            data-testid="ss-register-selected"
            disabled={selectedCount === 0 || registering}
            onClick={() =>
              requestRegister(
                [...selected].filter((it) =>
                  items.some(
                    (i) =>
                      i.iteration === it &&
                      i.registrationState === "not_registered",
                  ),
                ),
              )
            }
          >
            등록{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </Button>
        </div>
      </div>

      {summary &&
      (summary.registered > 0 ||
        summary.duplicate > 0 ||
        summary.failed > 0) ? (
        <div
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100"
          role="status"
          data-testid="ss-registration-summary"
        >
          등록 {summary.registered}건
          {summary.duplicate > 0
            ? ` · 이미 등록됨 ${summary.duplicate}건`
            : ""}
          {summary.failed > 0 ? ` · 실패 ${summary.failed}건` : ""}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex flex-wrap gap-1" role="group" aria-label="필터">
          {(
            [
              ["all", "전체"],
              ["not_registered", "미등록"],
              ["registered", "등록됨"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`ss-filter-${id}`}
              className={`rounded-md px-2.5 py-1 ${
                filter === id
                  ? "bg-sky-500/20 text-sky-100"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-slate-400">
          정렬
          <select
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
            data-testid="ss-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortId)}
          >
            <option value="return">수익률</option>
            <option value="mdd">최대 손실</option>
            <option value="trades">거래 수</option>
            <option value="winRate">승률</option>
          </select>
        </label>
      </div>

      {recommended.length > 0 ? (
        <div className="space-y-4">
          <h4 className="ss-subsection-title text-amber-100/90">추천 전략</h4>
          <div className="grid gap-5 lg:grid-cols-3">
            {recommended.map((item) => (
              <StrategyCard
                key={item.key}
                item={item}
                large
                selected={selected.has(item.iteration)}
                onToggleSelect={toggleSelect}
                onOpenDetail={setDetailKey}
                onRequestRegister={(it) => requestRegister([it])}
                registering={registering}
              />
            ))}
          </div>
        </div>
      ) : null}

      {rest.length > 0 ? (
        <details
          className="rounded-lg border border-slate-800 bg-slate-950/30"
          open={restOpen}
          onToggle={(e) =>
            setRestOpen((e.target as HTMLDetailsElement).open)
          }
        >
          <summary
            className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-200"
            data-testid="ss-rest-toggle"
          >
            나머지 합격 전략
            <span className="ml-2 text-slate-500">{rest.length}</span>
          </summary>
          <div className="grid gap-5 border-t border-slate-800 p-4 lg:grid-cols-2">
            {rest.map((item) => (
              <StrategyCard
                key={item.key}
                item={item}
                selected={selected.has(item.iteration)}
                onToggleSelect={toggleSelect}
                onOpenDetail={setDetailKey}
                onRequestRegister={(it) => requestRegister([it])}
                registering={registering}
              />
            ))}
          </div>
        </details>
      ) : null}

      {detailItem ? (
        <DetailDrawer
          item={detailItem}
          registering={registering}
          onClose={() => setDetailKey(null)}
          onRegister={(it) => requestRegister([it])}
        />
      ) : null}

      {pendingIterations ? (
        <ConfirmDialog
          title="전략 등록"
          body={
            pendingIterations.length === 1
              ? "선택한 합격 전략을 전략 관리에 등록할까요? 자동으로 저장되지 않습니다."
              : `선택한 ${pendingIterations.length}개 전략을 전략 관리에 등록할까요? 자동으로 저장되지 않습니다.`
          }
          confirmLabel="등록"
          pending={registering}
          onConfirm={() => void confirmRegister()}
          onCancel={() => setPendingIterations(null)}
        />
      ) : null}
    </section>
  );
}

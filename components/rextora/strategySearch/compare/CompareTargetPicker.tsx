"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { V3Dialog } from "@/components/rextora/v3/V3Dialog";
import { formatTimeframeCustomerKo } from "../customerTimeframeKo";
import { resolveCurrentStageLabelKo } from "../formatters";
import { displayJobSearchTitle } from "../jobDisplayName";
import {
  formatRate,
  isComparableSearchJobStatus,
  safeRate,
} from "../searchJobComparison";
import type { StrategySearchJobSummary } from "../types";

function shortDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day}`;
}

function utcDay(iso: string | null | undefined): string | null {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return null;
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.replaceAll("-", ".") : null;
}

function formatCount(value: number | null | undefined): string {
  return value != null && Number.isFinite(value)
    ? Math.trunc(value).toLocaleString("ko-KR")
    : "확인 불가";
}

function formatPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${(value * 100).toFixed(2)}%`;
}

function formatPickerElapsedMs(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const tenths = Math.round(ms / 100);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)}초`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`;
}

function gatePassRate(job: StrategySearchJobSummary): string | null {
  const rate = safeRate(job.gatePassedCount, job.evaluatedCount);
  return rate == null ? null : formatRate(rate);
}

function jobSymbol(job: StrategySearchJobSummary): string {
  return job.symbols.map((item) => item.trim()).filter(Boolean)[0] ?? "—";
}

function MetricHint(props: { copy: string }) {
  return (
    <span
      className="ss-compare-metric-hint"
      role="img"
      aria-label={props.copy}
      title={props.copy}
      data-tooltip={props.copy}
      tabIndex={0}
    >
      i
    </span>
  );
}

type SelectedFunnelSummary = {
  evaluatedCount: string;
  conditionPassedCount: string;
  conditionPassRate: string;
  finalEligibleCount: string;
  finalEligibleRate: string;
};

export function CompareTargetPair(props: {
  leftId: string | null;
  rightId: string | null;
  jobs: StrategySearchJobSummary[];
  leftFunnel: SelectedFunnelSummary | null;
  rightFunnel: SelectedFunnelSummary | null;
  leftFallbackName: string | null;
  rightFallbackName: string | null;
  leftResultHref: string | null;
  rightResultHref: string | null;
  onChangeLeft: (id: string | null) => void;
  onChangeRight: (id: string | null) => void;
}) {
  return (
    <div className="ss-compare-selectors">
      <IdentityCard
        testId="ss-compare-left"
        heading="기준 탐색"
        dialogTitle="기준 탐색 선택"
        selectedBadgeLabel="현재 기준 탐색"
        value={props.leftId}
        otherId={props.rightId}
        jobs={props.jobs}
        funnel={props.leftFunnel}
        fallbackName={props.leftFallbackName}
        resultHref={props.leftResultHref}
        resultLabel="기준 결과 보기"
        resultTestId="ss-compare-open-left"
        emptyCopy="기준으로 사용할 탐색을 선택하세요"
        otherBadgeLabel="현재 비교 탐색"
        onChange={props.onChangeLeft}
      />
      <span
        className="ss-compare-selectors__swap"
        data-testid="ss-compare-static-marker"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" focusable="false">
          <path className="ss-compare-selectors__arrow is-left" d="M3.5 8h15m-4-4 4 4-4 4" />
          <path className="ss-compare-selectors__arrow is-right" d="M20.5 16h-15m4 4-4-4 4-4" />
        </svg>
      </span>
      <IdentityCard
        testId="ss-compare-right"
        heading="비교 탐색"
        dialogTitle="비교할 탐색 선택"
        selectedBadgeLabel="현재 비교 탐색"
        value={props.rightId}
        otherId={props.leftId}
        jobs={props.jobs}
        funnel={props.rightFunnel}
        fallbackName={props.rightFallbackName}
        resultHref={props.rightResultHref}
        resultLabel="비교 결과 보기"
        resultTestId="ss-compare-open-right"
        emptyCopy="비교할 탐색을 선택하세요"
        otherBadgeLabel="현재 기준 탐색"
        onChange={props.onChangeRight}
      />
    </div>
  );
}

function IdentityCard(props: {
  testId: string;
  heading: string;
  dialogTitle: string;
  selectedBadgeLabel: string;
  value: string | null;
  otherId: string | null;
  jobs: StrategySearchJobSummary[];
  funnel: SelectedFunnelSummary | null;
  fallbackName: string | null;
  resultHref: string | null;
  resultLabel: string;
  resultTestId: string;
  emptyCopy?: string;
  otherBadgeLabel: string;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = props.jobs.find((job) => job.id === props.value) ?? null;
  const when = selected ? shortDay(selected.finishedAt) : null;
  const status = selected ? resolveCurrentStageLabelKo({ status: selected.status }) : null;
  const title = selected
    ? displayJobSearchTitle(selected)
    : props.value
      ? props.fallbackName
      : null;
  return (
    <article className="ss-compare-target">
      <div className="ss-compare-target__top">
        <h3>{props.heading}</h3>
        <button
          type="button"
          className="ss-compare-target__action"
          data-testid={props.testId}
          onClick={() => setOpen(true)}
        >
          {selected ? "변경" : "탐색 선택"}
        </button>
      </div>
      {title ? (
        <>
          <p className="ss-compare-target__title">{title}</p>
          {selected ? (
            <p className="ss-compare-target__market">
              {jobSymbol(selected)} · {formatTimeframeCustomerKo(selected.timeframe)}
            </p>
          ) : null}
          <div className="ss-compare-target__identity">
            {when ? <span className="ss-compare-target__meta">{when}</span> : null}
            {status ? <span className="ss-compare-target__status">{status}</span> : null}
          </div>
          {selected ? <SelectedJobSummary job={selected} funnel={props.funnel} /> : null}
        </>
      ) : (
        <p className="ss-compare-target__empty">{props.emptyCopy ?? "탐색을 선택하세요"}</p>
      )}
      {props.resultHref && props.value ? (
        <Link href={props.resultHref} className="ss-btn-secondary" data-testid={props.resultTestId}>
          {props.resultLabel}
        </Link>
      ) : null}
      <JobPickDialog
        open={open}
        title={props.dialogTitle}
        jobs={props.jobs}
        otherId={props.otherId}
        selectedId={props.value}
        selectedBadgeLabel={props.selectedBadgeLabel}
        otherBadgeLabel={props.otherBadgeLabel}
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          props.onChange(id);
          setOpen(false);
        }}
      />
    </article>
  );
}

function SelectedJobSummary(props: { job: StrategySearchJobSummary; funnel: SelectedFunnelSummary | null }) {
  const job = props.job;
  const start = utcDay(job.analysisStartUtc);
  const end = utcDay(job.analysisEndUtc);
  return (
    <section className="ss-compare-target__summary" aria-label="선택한 탐색 요약">
      <div className="ss-compare-target__summary-period">
        <span>분석 기간</span>
        <strong>{start && end ? `${start} – ${end}` : "기간 정보 없음"}</strong>
      </div>
      <div className="ss-compare-target__summary-metrics">
        <span>
          <small>평가 <MetricHint copy="결과 요약에 기록된 평가 후보 수입니다." /></small>
          <strong>{props.funnel?.evaluatedCount ?? "—"}</strong>
        </span>
        <span>
          <small>조건 통과</small>
          <strong>{props.funnel?.conditionPassedCount ?? "—"}</strong>
          <small className="ss-compare-target__summary-rate">
            조건 통과율 <MetricHint copy="조건 통과 후보 수를 평가 후보 수로 나눈 비율입니다." />
          </small>
          <strong className="ss-compare-target__summary-rate-value">{props.funnel?.conditionPassRate ?? "—"}</strong>
        </span>
        <span>
          <small>최종 적격 <MetricHint copy="결과 요약의 최종 적격 기준을 통과한 후보 수입니다." /></small>
          <strong>{props.funnel?.finalEligibleCount ?? "—"}</strong>
          <small className="ss-compare-target__summary-rate">최종 적격률</small>
          <strong className="ss-compare-target__summary-rate-value">{props.funnel?.finalEligibleRate ?? "—"}</strong>
        </span>
        <span>
          <small>소요 시간</small>
          <strong>{formatPickerElapsedMs(job.elapsedMs) ?? "확인 불가"}</strong>
        </span>
      </div>
    </section>
  );
}

function JobPickDialog(props: {
  open: boolean;
  title: string;
  jobs: StrategySearchJobSummary[];
  otherId: string | null;
  selectedId: string | null;
  selectedBadgeLabel: string;
  otherBadgeLabel: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return props.jobs.filter((job) => {
      if (!needle) return true;
      const haystack = [
        displayJobSearchTitle(job),
        jobSymbol(job),
        formatTimeframeCustomerKo(job.timeframe),
        shortDay(job.finishedAt) ?? "",
        utcDay(job.analysisStartUtc) ?? "",
        utcDay(job.analysisEndUtc) ?? "",
        resolveCurrentStageLabelKo({ status: job.status }),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [props.jobs, query]);
  return (
    <V3Dialog
      open={props.open}
      onClose={() => {
        setQuery("");
        props.onClose();
      }}
      title={props.title}
      className="ss-compare-picker"
    >
      <label className="ss-compare-picker__search">
        <span className="ss-sr">탐색 검색</span>
        <input
          value={query}
          placeholder="시장, 시간봉, 날짜"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="ss-compare-picker__list" role="list">
        {rows.map((job) => {
          const blocked = !isComparableSearchJobStatus(job.status) || job.id === props.otherId;
          const selected = job.id === props.selectedId;
          const otherSelected = job.id === props.otherId;
          return (
            <div key={job.id} role="listitem">
              <button
                type="button"
                className={`ss-compare-picker__row${selected ? " is-selected" : ""}`}
                data-testid={`ss-compare-picker-row-${job.id}`}
                aria-current={selected ? "true" : undefined}
                disabled={blocked}
                onClick={() => props.onSelect(job.id)}
              >
                <span className="ss-compare-picker__row-identity">
                  <span className="ss-compare-picker__row-heading">
                    <strong>{displayJobSearchTitle(job)}</strong>
                    {selected ? (
                      <span className="ss-compare-picker__selected-badge">
                        {props.selectedBadgeLabel}
                      </span>
                    ) : otherSelected ? (
                      <span className="ss-compare-picker__selected-badge is-other-selection">
                        {props.otherBadgeLabel}
                      </span>
                    ) : null}
                  </span>
                  <span><small>심볼</small> {jobSymbol(job)} · <small>시간봉</small> {formatTimeframeCustomerKo(job.timeframe)}</span>
                </span>
                <span className="ss-compare-picker__row-completion">
                  <span><small>상태</small> {resolveCurrentStageLabelKo({ status: job.status })}</span>
                  <time dateTime={job.finishedAt ?? undefined}>{shortDay(job.finishedAt) ?? "완료일 확인 불가"}</time>
                </span>
                <span className="ss-compare-picker__row-period">
                  <small>
                    <span className="ss-compare-picker__metric-icon is-period" aria-hidden="true">📅</span>
                    분석 기간 · UTC
                  </small>
                  <strong>
                    {utcDay(job.analysisStartUtc) && utcDay(job.analysisEndUtc)
                      ? `${utcDay(job.analysisStartUtc)} – ${utcDay(job.analysisEndUtc)}`
                      : "기간 정보 없음"}
                  </strong>
                </span>
                <span className="ss-compare-picker__metrics" aria-label="탐색 결과 요약">
                  <span><small><span className="ss-compare-picker__metric-icon is-evaluated" aria-hidden="true">🔎</span>평가 전략</small><strong>{formatCount(job.evaluatedCount)}</strong></span>
                  <span><small><span className="ss-compare-picker__metric-icon is-passed" aria-hidden="true">✅</span>게이트 통과</small><strong>{formatCount(job.gatePassedCount)}</strong></span>
                  <span><small><span className="ss-compare-picker__metric-icon is-rate" aria-hidden="true">🎯</span>통과율</small><strong>{gatePassRate(job) ?? "확인 불가"}</strong></span>
                  <span><small><span className="ss-compare-picker__metric-icon is-qualified" aria-hidden="true">🏅</span>적격 후보</small><strong>{formatCount(job.qualifiedCount)}</strong></span>
                  <span><small><span className="ss-compare-picker__metric-icon is-elapsed" aria-hidden="true">⏱</span>소요 시간</small><strong>{formatPickerElapsedMs(job.elapsedMs) ?? "확인 불가"}</strong></span>
                </span>
                {formatPercent(job.bestReturn) != null || formatPercent(job.bestMdd) != null ? (
                  <span className="ss-compare-picker__best-candidate">
                    <strong>최고 후보</strong>
                    {formatPercent(job.bestReturn) != null ? (
                      <span><small><span className="ss-compare-picker__metric-icon is-return" aria-hidden="true">📈</span>최고 후보 수익률</small><b>{formatPercent(job.bestReturn)}</b></span>
                    ) : null}
                    {formatPercent(job.bestMdd) != null ? (
                      <span><small><span className="ss-compare-picker__metric-icon is-mdd" aria-hidden="true">🛡️</span>최고 후보 MDD</small><b>{formatPercent(job.bestMdd)}</b></span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </V3Dialog>
  );
}

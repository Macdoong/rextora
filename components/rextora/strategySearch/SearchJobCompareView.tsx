"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchResearchResultsSummary,
  getStrategySearchJob,
  listStrategySearchJobs,
} from "./apiClient";
import { StrategySearchClientError } from "./types";
import type {
  ResearchResultsSummaryView,
  StrategySearchJobDetail,
  StrategySearchJobSummary,
} from "./types";
import {
  INCOMPARABLE_JOB_COPY,
  NEED_TWO_JOBS_COPY,
  NO_SHARED_GROUP_COPY,
  SAME_JOB_COMPARE_COPY,
  buildSearchCompareHref,
  buildSearchJobComparison,
  comparableSearchJobs,
  compareSelectorLabel,
  isComparableSearchJobStatus,
  searchJobCompareEligibilityError,
  type SearchJobCompareGroup,
  type SearchJobCompareModel,
  type SearchJobCompareRow,
} from "./searchJobComparison";

function customerError(err: unknown): string {
  if (err instanceof StrategySearchClientError) {
    if (err.httpStatus === 404 || err.code === "JOB_NOT_FOUND") {
      return "선택한 탐색을 찾을 수 없습니다. 삭제되었거나 접근할 수 없습니다.";
    }
    return err.message || "탐색 결과를 불러오지 못했습니다.";
  }
  return "탐색 결과를 불러오지 못했습니다.";
}

function CompareRow(props: { row: SearchJobCompareRow }) {
  const { row } = props;
  const state =
    row.tone === "different" ? "다름" : row.tone === "same" ? "같음" : "없음";
  return (
    <div
      className={`ss-compare-row is-${row.tone}`}
      data-testid={`ss-compare-row-${row.id}`}
      data-tone={row.tone}
    >
      <div className="ss-compare-row__label">{row.label}</div>
      <div className="ss-compare-row__value">{row.left}</div>
      <div className="ss-compare-row__value">{row.right}</div>
      <div className="ss-compare-row__state" aria-label={`비교 상태 ${state}`}>
        {state}
      </div>
    </div>
  );
}

function CompareSection(props: {
  title: string;
  testId: string;
  rows: SearchJobCompareRow[];
}) {
  return (
    <section className="ss-compare-section" data-testid={props.testId}>
      <h3 className="ss-compare-section__title">{props.title}</h3>
      <div className="ss-compare-grid" role="table" aria-label={props.title}>
        <div className="ss-compare-row is-head" role="row">
          <div>항목</div>
          <div>기준 탐색</div>
          <div>비교할 탐색</div>
          <div>상태</div>
        </div>
        {props.rows.map((row) => (
          <CompareRow key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function GroupBlock(props: { group: SearchJobCompareGroup }) {
  const { group } = props;
  return (
    <div
      className="ss-compare-group"
      data-testid={`ss-compare-group-${group.groupId}`}
      data-comparable={group.comparable ? "true" : "false"}
    >
      <h4 className="ss-compare-group__title">{group.groupLabel}</h4>
      {!group.comparable ? (
        <p className="ss-compare-note">{NO_SHARED_GROUP_COPY}</p>
      ) : (
        <div className="ss-compare-grid ss-compare-grid--candidates">
          <div className="ss-compare-row is-head">
            <div>구분</div>
            <div>기준 탐색</div>
            <div>비교할 탐색</div>
            <div>상태</div>
          </div>
          <CompareRow
            row={{
              id: `${group.groupId}-recommended`,
              label: "최종 추천 후보",
              left: group.leftRecommended.present
                ? `${group.leftRecommended.scoreLabel}${group.leftRecommended.passed ? "" : " · 미통과"}`
                : "—",
              right: group.rightRecommended.present
                ? `${group.rightRecommended.scoreLabel}${group.rightRecommended.passed ? "" : " · 미통과"}`
                : "—",
              tone: comparePairTone(
                group.leftRecommended.scoreLabel,
                group.rightRecommended.scoreLabel,
              ),
            }}
          />
          <CompareRow
            row={{
              id: `${group.groupId}-raw`,
              label: "최고 점수 후보",
              left: rawBestLabel(group.leftRawBest, group.leftRecommended.passed),
              right: rawBestLabel(group.rightRawBest, group.rightRecommended.passed),
              tone: comparePairTone(
                group.leftRawBest.scoreLabel,
                group.rightRawBest.scoreLabel,
              ),
            }}
          />
        </div>
      )}
    </div>
  );
}

function comparePairTone(left: string, right: string) {
  if (left === "—" && right === "—") return "unavailable" as const;
  return left === right ? ("same" as const) : ("different" as const);
}

function rawBestLabel(
  candidate: SearchJobCompareGroup["leftRawBest"],
  recommendedPassed: boolean,
): string {
  if (!candidate.present) return "—";
  if (!candidate.passed) return `${candidate.scoreLabel} · 미통과`;
  if (recommendedPassed) return candidate.scoreLabel;
  return `${candidate.scoreLabel} · 추천 아님`;
}

export function SearchJobCompareView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const leftId = searchParams.get("left");
  const rightId = searchParams.get("right");

  const [jobs, setJobs] = useState<StrategySearchJobSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [model, setModel] = useState<SearchJobCompareModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  const comparable = useMemo(() => comparableSearchJobs(jobs), [jobs]);
  const selectionError = searchJobCompareEligibilityError(leftId, rightId);

  const setSelection = useCallback(
    (next: { left?: string | null; right?: string | null }) => {
      router.replace(
        buildSearchCompareHref({
          left: next.left === undefined ? leftId : next.left,
          right: next.right === undefined ? rightId : next.right,
        }),
        { scroll: false },
      );
    },
    [leftId, rightId, router],
  );

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    void listStrategySearchJobs({ limit: 100, signal: controller.signal })
      .then((rows) => {
        setJobs(rows);
        setListError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setListError(customerError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!leftId || !rightId || leftId === rightId) {
      setModel(null);
      setLoadError(leftId && rightId && leftId === rightId ? SAME_JOB_COMPARE_COPY : null);
      return;
    }
    const controller = new AbortController();
    setLoadingCompare(true);
    setLoadError(null);
    void Promise.all([
      getStrategySearchJob(leftId),
      getStrategySearchJob(rightId),
      fetchResearchResultsSummary(leftId, controller.signal),
      fetchResearchResultsSummary(rightId, controller.signal),
    ])
      .then(([leftJob, rightJob, leftSummary, rightSummary]: [
        StrategySearchJobDetail,
        StrategySearchJobDetail,
        ResearchResultsSummaryView,
        ResearchResultsSummaryView,
      ]) => {
        if (controller.signal.aborted) return;
        const built = buildSearchJobComparison({
          leftJob,
          rightJob,
          leftSummary,
          rightSummary,
        });
        if (!built.ok) {
          setModel(null);
          setLoadError(built.error);
          return;
        }
        setModel(built.model);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setModel(null);
        setLoadError(customerError(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCompare(false);
      });
    return () => controller.abort();
  }, [leftId, rightId]);

  return (
    <div className="ss-compare" data-testid="ss-job-compare">
      <div className="ss-compare-toolbar">
        <Link href="/strategy-search" className="ss-compare-back">
          전략 탐색으로
        </Link>
      </div>

      {listLoading ? (
        <p className="ss-compare-note">비교할 탐색 목록을 불러오는 중입니다.</p>
      ) : null}
      {listError ? (
        <p className="ss-compare-error" role="alert">
          {listError}
        </p>
      ) : null}

      {!listLoading &&
      comparable.length < 2 &&
      !(leftId && rightId && leftId !== rightId) ? (
        <div className="ss-compare-empty" data-testid="ss-compare-empty">
          <p>{NEED_TWO_JOBS_COPY}</p>
        </div>
      ) : (
        <div className="ss-compare-selectors">
          <label className="ss-compare-select" htmlFor="ss-compare-left">
            <span>기준 탐색</span>
            <select
              id="ss-compare-left"
              data-testid="ss-compare-left"
              value={leftId ?? ""}
              onChange={(event) =>
                setSelection({ left: event.target.value || null })
              }
            >
              <option value="">선택하세요</option>
              {leftId && !comparable.some((job) => job.id === leftId) ? (
                <option value={leftId}>
                  {model?.left.searchName ?? "선택한 기준 탐색"}
                </option>
              ) : null}
              {comparable.map((job) => (
                <option
                  key={job.id}
                  value={job.id}
                  disabled={
                    !isComparableSearchJobStatus(job.status) || job.id === rightId
                  }
                >
                  {compareSelectorLabel(job)}
                </option>
              ))}
            </select>
          </label>
          <label className="ss-compare-select" htmlFor="ss-compare-right">
            <span>비교할 탐색</span>
            <select
              id="ss-compare-right"
              data-testid="ss-compare-right"
              value={rightId ?? ""}
              onChange={(event) =>
                setSelection({ right: event.target.value || null })
              }
            >
              <option value="">선택하세요</option>
              {rightId && !comparable.some((job) => job.id === rightId) ? (
                <option value={rightId}>
                  {model?.right.searchName ?? "선택한 비교 탐색"}
                </option>
              ) : null}
              {comparable.map((job) => (
                <option
                  key={job.id}
                  value={job.id}
                  disabled={
                    !isComparableSearchJobStatus(job.status) || job.id === leftId
                  }
                >
                  {compareSelectorLabel(job)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {selectionError ? (
        <p className="ss-compare-error" role="alert" data-testid="ss-compare-same">
          {selectionError}
        </p>
      ) : null}

      {jobs.some(
        (job) =>
          (job.id === leftId || job.id === rightId) &&
          !isComparableSearchJobStatus(job.status),
      ) ? (
        <p className="ss-compare-error" role="alert">
          {INCOMPARABLE_JOB_COPY}
        </p>
      ) : null}

      {loadingCompare ? (
        <p className="ss-compare-note">비교 자료를 불러오는 중입니다.</p>
      ) : null}
      {loadError ? (
        <p className="ss-compare-error" role="alert" data-testid="ss-compare-load-error">
          {loadError}
        </p>
      ) : null}

      {model ? (
        <div className="ss-compare-body" data-testid="ss-compare-body">
          <div className="ss-compare-identities">
            <article>
              <h3>기준 탐색</h3>
              <p>{model.left.searchName}</p>
              <p>
                {model.left.symbol} · {model.left.timeframe}
              </p>
              <p>{model.left.completedAt ?? "완료 시각 없음"}</p>
            </article>
            <article>
              <h3>비교할 탐색</h3>
              <p>{model.right.searchName}</p>
              <p>
                {model.right.symbol} · {model.right.timeframe}
              </p>
              <p>{model.right.completedAt ?? "완료 시각 없음"}</p>
            </article>
          </div>
          <CompareSection
            title="기본 정보"
            testId="ss-compare-overview"
            rows={model.overview}
          />
          <CompareSection
            title="탐색 설정"
            testId="ss-compare-settings"
            rows={model.settings}
          />
          <CompareSection
            title="탐색 결과"
            testId="ss-compare-funnel"
            rows={model.funnel}
          />
          <CompareSection
            title="비용 · 위험 조건"
            testId="ss-compare-cost"
            rows={model.costRisk}
          />
          <section className="ss-compare-section" data-testid="ss-compare-groups">
            <h3 className="ss-compare-section__title">전략군별 추천</h3>
            {!model.hasSharedComparableGroup ? (
              <p className="ss-compare-note" data-testid="ss-compare-no-shared-group">
                {NO_SHARED_GROUP_COPY}
              </p>
            ) : null}
            {model.groups.map((group) => (
              <GroupBlock key={group.groupId} group={group} />
            ))}
          </section>
          <p className="ss-compare-footnote">
            수치는 각 탐색의 결과 요약입니다. 값이 다르다고 더 나은 탐색을 뜻하지는
            않습니다.
          </p>
          <div className="ss-compare-actions">
            <Link
              href={`/results?jobId=${encodeURIComponent(model.left.jobId)}`}
              className="ss-btn-secondary"
            >
              기준 결과 보기
            </Link>
            <Link
              href={`/results?jobId=${encodeURIComponent(model.right.jobId)}`}
              className="ss-btn-secondary"
            >
              비교 결과 보기
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

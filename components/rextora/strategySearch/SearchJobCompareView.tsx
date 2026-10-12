"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CompareDifferenceBoard } from "./compare/CompareDifferenceVisuals";
import type { DiffWorkspace } from "./compare/CompareDifferenceVisuals";
import { CompareResultsVisual } from "./compare/CompareResultsVisual";
import { CompareTargetPair } from "./compare/CompareTargetPicker";
import { CompareTimelineVisual } from "./compare/CompareTimelineVisual";
import { selectActiveCompareSection } from "./compare/activeSection";
import { formatCompareFamilyDisplay } from "./compareVisual";
import {
  INCOMPARABLE_JOB_COPY,
  NEED_TWO_JOBS_COPY,
  NO_SHARED_GROUP_COPY,
  SAME_JOB_COMPARE_COPY,
  buildSearchCompareHref,
  buildSearchJobComparison,
  comparableSearchJobs,
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
  const left = row.id === "setting-활성 전략 패밀리"
    ? formatCompareFamilyDisplay(row.left)
    : row.left;
  const right = row.id === "setting-활성 전략 패밀리"
    ? formatCompareFamilyDisplay(row.right)
    : row.right;
  const state =
    row.tone === "different" ? "다름" : row.tone === "same" ? "같음" : "없음";
  return (
    <div
      className={`ss-compare-row is-${row.tone}`}
      data-testid={`ss-compare-row-${row.id}`}
      data-tone={row.tone}
    >
      <div className="ss-compare-row__label">{row.label}</div>
      <div className="ss-compare-row__value">{left}</div>
      <div className="ss-compare-row__value">{right}</div>
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

const COMPARE_NAV = [
  { id: "ss-compare-core", label: "핵심 비교" },
  { id: "ss-compare-period", label: "분석 기간" },
  { id: "ss-compare-diff", label: "주요 차이" },
  { id: "ss-compare-details", label: "상세 데이터" },
] as const;

function openRawCompareDetails() {
  const section = document.getElementById("ss-compare-details");
  const details = section?.querySelector("details");
  if (details instanceof HTMLDetailsElement) {
    details.open = true;
  }
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function selectedFunnelSummary(
  model: SearchJobCompareModel | null,
  leftId: string | null,
  rightId: string | null,
  side: "left" | "right",
) {
  if (!model || model.left.jobId !== leftId || model.right.jobId !== rightId) return null;
  const value = (id: string) => model.funnel.find((item) => item.id === id)?.[side] ?? "—";
  return {
    evaluatedCount: value("funnel-evaluated"),
    conditionPassedCount: value("funnel-qualified"),
    conditionPassRate: value("funnel-pass-rate"),
    finalEligibleCount: value("funnel-final"),
    finalEligibleRate: value("funnel-final-rate"),
  };
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
  const [activeSection, setActiveSection] = useState<string>(COMPARE_NAV[0].id);
  const [diffPanel, setDiffPanel] = useState<DiffWorkspace | null>(null);
  const anchorNavigationRef = useRef(false);

  useEffect(() => {
    setDiffPanel(null);
  }, [leftId, rightId]);

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

  useEffect(() => {
    if (!model) return;
    anchorNavigationRef.current = false;
    const nodes = COMPARE_NAV.map((item) => document.getElementById(item.id)).filter(
      (node): node is HTMLElement => node != null,
    );
    const nav = document.querySelector<HTMLElement>("[data-testid='ss-compare-nav']");
    if (nodes.length === 0 || !nav) return;

    let frame = 0;
    const updateActiveSection = () => {
      if (anchorNavigationRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (anchorNavigationRef.current) return;
        const activationLine = Math.ceil(nav.getBoundingClientRect().bottom);
        const atDocumentEnd =
          window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 1;
        const next = selectActiveCompareSection(
          nodes.map((node) => ({ id: node.id, top: node.getBoundingClientRect().top })),
          activationLine,
          atDocumentEnd,
        );
        if (next) setActiveSection(next);
      });
    };
    const releaseAnchorNavigation = () => {
      anchorNavigationRef.current = false;
      updateActiveSection();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      );
      if (
        ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key) &&
        !isEditing
      ) {
        releaseAnchorNavigation();
      }
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    window.addEventListener("wheel", releaseAnchorNavigation, { passive: true });
    window.addEventListener("touchstart", releaseAnchorNavigation, { passive: true });
    window.addEventListener("pointerdown", releaseAnchorNavigation, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
      window.removeEventListener("wheel", releaseAnchorNavigation);
      window.removeEventListener("touchstart", releaseAnchorNavigation);
      window.removeEventListener("pointerdown", releaseAnchorNavigation);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [model]);

  const resultsBackHref = leftId
    ? `/results?jobId=${encodeURIComponent(leftId)}`
    : "/results";

  return (
    <div className="ss-compare" data-testid="ss-job-compare">
      <nav className="ss-compare-crumb" aria-label="현재 위치">
        <Link href={resultsBackHref}>탐색 결과</Link>
        <span aria-hidden="true">›</span>
        <span>탐색 결과 비교</span>
      </nav>
      <div className="ss-compare-toolbar">
        <Link href="/strategy-search" className="ss-compare-secondary-link">
          전략 탐색 화면
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
        <CompareTargetPair
          leftId={leftId}
          rightId={rightId}
          jobs={comparable}
          leftFunnel={selectedFunnelSummary(model, leftId, rightId, "left")}
          rightFunnel={selectedFunnelSummary(model, leftId, rightId, "right")}
          leftFallbackName={leftId ? model?.left.searchName ?? null : null}
          rightFallbackName={rightId ? model?.right.searchName ?? null : null}
          leftResultHref={model ? `/results?jobId=${encodeURIComponent(model.left.jobId)}` : null}
          rightResultHref={model ? `/results?jobId=${encodeURIComponent(model.right.jobId)}` : null}
          onChangeLeft={(next) => setSelection({ left: next })}
          onChangeRight={(next) => setSelection({ right: next })}
        />
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
        <div
          className="ss-compare-loaded"
          data-testid="ss-compare-loaded"
          key={`${model.left.jobId}:${model.right.jobId}`}
        >
          <div className="ss-compare-nav-slot" data-testid="ss-compare-nav-slot">
          <nav className="ss-compare-nav" data-testid="ss-compare-nav" aria-label="비교 구역">
            <Link href={resultsBackHref}>← 탐색 결과</Link>
            {COMPARE_NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={activeSection === item.id ? "is-active" : undefined}
                aria-current={activeSection === item.id ? "true" : undefined}
                onClick={() => {
                  anchorNavigationRef.current = true;
                  setActiveSection(item.id);
                }}
              >
                {item.label}
              </a>
            ))}
            <Link href={`/results?jobId=${encodeURIComponent(model.left.jobId)}`}>기준 결과</Link>
            <Link href={`/results?jobId=${encodeURIComponent(model.right.jobId)}`}>비교 결과</Link>
          </nav>
          </div>
          <div className="ss-compare-body" data-testid="ss-compare-body">
          <section id="ss-compare-core" className="ss-compare-primary-section ss-compare-anchor" data-testid="ss-compare-core">
            <h2>핵심 결과</h2>
            <CompareResultsVisual rows={model.funnel} />
          </section>
          <section id="ss-compare-period" className="ss-compare-primary-section ss-compare-anchor" data-testid="ss-compare-period">
            <h2>분석 기간</h2>
            <CompareTimelineVisual
              settings={model.settings}
              elapsed={model.funnel.find((row) => row.id === "funnel-elapsed")}
            />
          </section>
          <section id="ss-compare-diff" className="ss-compare-primary-section ss-compare-anchor" data-testid="ss-compare-diff">
            <h2>주요 차이</h2>
            <CompareDifferenceBoard
              settings={model.settings}
              costRisk={model.costRisk}
              familyLeft={model.settings.find((row) => row.id === "setting-활성 전략 패밀리")?.left ?? ""}
              familyRight={model.settings.find((row) => row.id === "setting-활성 전략 패밀리")?.right ?? ""}
              panel={diffPanel}
              onToggle={(next) => setDiffPanel((current) => (current === next ? null : next))}
              onOpenRaw={() => {
                anchorNavigationRef.current = true;
                setActiveSection("ss-compare-details");
                openRawCompareDetails();
              }}
            />
          </section>
          <section id="ss-compare-details" className="ss-compare-anchor" data-testid="ss-compare-details">
            <details className="ss-compare-disclosure">
              <summary>정확한 상세 데이터 보기</summary>
              <CompareSection title="기본 정보" testId="ss-compare-overview" rows={model.overview} />
              <CompareSection title="탐색 결과" testId="ss-compare-funnel" rows={model.funnel} />
              <CompareSection title="탐색 설정" testId="ss-compare-settings" rows={model.settings} />
              <CompareSection title="비용 · 위험 조건" testId="ss-compare-cost" rows={model.costRisk} />
              <div data-testid="ss-compare-group-detail">
                <h3>전략군 상세</h3>
                {model.groups.map((group) => (
                  <GroupBlock key={group.groupId} group={group} />
                ))}
              </div>
            </details>
          </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

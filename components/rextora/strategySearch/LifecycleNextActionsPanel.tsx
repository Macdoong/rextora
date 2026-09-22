"use client";

import type { ResearchResultCountsView } from "./types";

type StepStatus = "complete" | "ready" | "blocked" | "waiting";

type LifecycleStep = {
  id: string;
  title: string;
  status: StepStatus;
  statusLabel: string;
  completionCriteria: string;
  blockedReason: string | null;
  nextAction: string;
};

function stepStatusLabel(status: StepStatus): string {
  switch (status) {
    case "complete":
      return "완료";
    case "ready":
      return "진행 가능";
    case "blocked":
      return "차단됨";
    default:
      return "대기";
  }
}

/** Evidence-only next-step handoff from persisted summary counts. */
export function buildLifecycleNextActionSteps(
  counts: ResearchResultCountsView,
): LifecycleStep[] {
  const qualified = counts.qualifiedStrategies ?? 0;
  const top10 = counts.top10Saved ?? 0;
  const registered = counts.registeredStrategies ?? 0;
  const backtestRec = counts.backtestRecommendedStrategies ?? 0;
  const finalEligible =
    counts.stageFinalRecommendable ??
    counts.recommendationEligibleStrategies ??
    0;

  const make = (
    id: string,
    title: string,
    status: StepStatus,
    completionCriteria: string,
    blockedReason: string | null,
    nextAction: string,
  ): LifecycleStep => ({
    id,
    title,
    status,
    statusLabel: stepStatusLabel(status),
    completionCriteria,
    blockedReason,
    nextAction,
  });
  const steps: LifecycleStep[] = [
    make(
      "research",
      "연구 완료",
      qualified > 0 ? "complete" : "blocked",
      "연구 종료 및 통과 후보 보존",
      qualified > 0 ? null : "사용 가능한 통과 후보가 없습니다.",
      qualified > 0 ? "최고 전략을 확인하세요." : "연구 조건을 조정해 다시 탐색하세요.",
    ),
    make(
      "best",
      "최고 전략",
      top10 > 0 ? "complete" : qualified > 0 ? "ready" : "blocked",
      "최고 전략 1개 이상 선정",
      qualified > 0 && top10 === 0 ? "저장 후보 목록 증거가 아직 없습니다." : null,
      "최고 수익·안정·최종 추천 역할을 확인하세요.",
    ),
    make(
      "compare_top3",
      "TOP 3 비교",
      top10 >= 3 ? "complete" : top10 > 0 ? "ready" : "blocked",
      "중복 역할을 병합한 TOP 3 비교",
      top10 === 0 ? "비교할 저장 후보가 없습니다." : null,
      "역할·수익·낙폭·견고성을 비교하세요.",
    ),
    make(
      "register",
      "전략 등록",
      registered > 0 ? "complete" : finalEligible > 0 ? "ready" : "blocked",
      "최종 적격 전략을 라이브러리에 등록",
      finalEligible === 0 ? "최종 적격 전략이 없어 등록 우선순위를 부여하지 않습니다." : null,
      registered > 0 ? "등록 전략으로 백테스트를 실행하세요." : "검토한 전략을 선택 등록하세요.",
    ),
    make(
      "backtest",
      "백테스트 실행",
      registered > 0 ? "ready" : "waiting",
      "등록 전략에 대해 새 기간 백테스트 완료",
      registered === 0 ? "전략 등록이 먼저 필요합니다." : null,
      registered > 0 ? "기간을 선택해 백테스트를 실행하세요." : "전략 등록 후 진행하세요.",
    ),
    make(
      "paper",
      "모의매매",
      finalEligible > 0 && registered > 0 && backtestRec > 0
        ? "waiting"
        : "blocked",
      "백테스트 적격성과 모의 세션 증거",
      "완료된 백테스트·모의 세션 증거는 이 요약에 없습니다.",
      "백테스트 통과 후 모의매매 화면에서 등록하세요.",
    ),
    make(
      "live",
      "실전매매",
      "blocked",
      "모의매매 성과·승인·실전 적격성",
      "모의매매 검증 전에는 실전매매를 우선 행동으로 제공하지 않습니다.",
      "모의매매 검증과 승인을 모두 충족한 뒤 검토하세요.",
    ),
  ];

  return steps;
}

export function resolveCurrentLifecycleStep(
  steps: LifecycleStep[],
): { step: LifecycleStep; index: number } | null {
  const ready = steps.findIndex((step) => step.status === "ready");
  if (ready >= 0) return { step: steps[ready]!, index: ready };
  const blocked = steps.findIndex((step) => step.status === "blocked");
  if (blocked >= 0) return { step: steps[blocked]!, index: blocked };
  const waiting = steps.findIndex((step) => step.status === "waiting");
  if (waiting >= 0) return { step: steps[waiting]!, index: waiting };
  const lastComplete = [...steps]
    .map((step, index) => ({ step, index }))
    .reverse()
    .find((row) => row.step.status === "complete");
  return lastComplete ?? null;
}

export function LifecycleNextActionsPanel(props: {
  counts: ResearchResultCountsView;
  /** Compact progress bar; expand for blockers. */
  compact?: boolean;
}) {
  const steps = buildLifecycleNextActionSteps(props.counts);
  const current = resolveCurrentLifecycleStep(steps);

  return (
    <section
      className="ss-next-steps"
      data-testid="ss-lifecycle-next-actions"
      aria-labelledby="ss-lifecycle-next-actions-title"
    >
      <div>
        <h4
          id="ss-lifecycle-next-actions-title"
          className="ss-completion-subhead"
        >
          다음 단계
        </h4>
        <p className="ss-completion-guidance mt-1">
          저장된 연구 결과 기준으로 판단합니다. 모의·실전 활성 여부는 여기서
          주장하지 않습니다.
        </p>
      </div>
      {current ? (
        <div
          className={`ss-next-step-current is-${current.step.status}`}
          data-testid="ss-lifecycle-current"
          data-step-id={current.step.id}
        >
          <span className="ss-next-step-current__eyebrow">현재</span>
          <strong className="ss-next-step-current__title">
            {current.index + 1}. {current.step.title}
          </strong>
          <p className="ss-next-step-current__copy">{current.step.nextAction}</p>
          {current.step.blockedReason ? (
            <p className="ss-next-step-card__block">{current.step.blockedReason}</p>
          ) : null}
        </div>
      ) : null}
      <details
        className="ss-next-steps-roadmap"
        data-testid="ss-lifecycle-roadmap"
      >
        <summary>전체 진행 단계 보기</summary>
      <ol
        className={
          props.compact
            ? "ss-next-steps__list ss-next-steps__list--compact"
            : "ss-next-steps__list"
        }
      >
        {steps.map((step, idx) => (
          <li
            key={step.id}
            className={`ss-next-step-card is-${step.status}`}
            data-testid={`ss-lifecycle-step-${step.id}`}
          >
            <div className="ss-next-step-card__head">
              <span className="ss-next-step-card__order" aria-hidden="true">
                {idx + 1}
              </span>
              <strong className="ss-next-step-card__title">{step.title}</strong>
              <span
                className={`ss-next-step-card__badge is-${step.status}`}
              >
                {step.statusLabel}
              </span>
            </div>
            <p className="ss-next-step-card__copy">{step.completionCriteria}</p>
            {step.blockedReason ? (
              <p className="ss-next-step-card__block">{step.blockedReason}</p>
            ) : null}
            <p className="ss-next-step-card__next">{step.nextAction}</p>
          </li>
        ))}
      </ol>
      </details>
    </section>
  );
}

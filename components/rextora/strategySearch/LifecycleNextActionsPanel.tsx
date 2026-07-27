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

function toneClass(status: StepStatus): string {
  switch (status) {
    case "complete":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-50";
    case "ready":
      return "border-sky-500/35 bg-sky-500/10 text-sky-50";
    case "blocked":
      return "border-amber-500/35 bg-amber-500/10 text-amber-50";
    default:
      return "border-slate-700 bg-slate-900/50 text-slate-300";
  }
}

/** Evidence-only lifecycle handoff from persisted summary counts. */
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
      "연구 종료 및 합격 trial 보존",
      qualified > 0 ? null : "사용 가능한 합격 trial이 없습니다.",
      qualified > 0 ? "최고 전략을 확인하세요." : "연구 조건을 조정해 다시 탐색하세요.",
    ),
    make(
      "best",
      "최고 전략",
      top10 > 0 ? "complete" : qualified > 0 ? "ready" : "blocked",
      "최고 전략 1개 이상 선정",
      qualified > 0 && top10 === 0 ? "TOP 10 선정 증거가 아직 없습니다." : null,
      "최고 수익·안정·최종 추천 역할을 확인하세요.",
    ),
    make(
      "compare_top3",
      "TOP 3 비교",
      top10 >= 3 ? "complete" : top10 > 0 ? "ready" : "blocked",
      "중복 역할을 병합한 TOP 3 비교",
      top10 === 0 ? "비교할 TOP 후보가 없습니다." : null,
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

export function LifecycleNextActionsPanel(props: {
  counts: ResearchResultCountsView;
  /** Compact progress bar; expand for blockers. */
  compact?: boolean;
}) {
  const steps = buildLifecycleNextActionSteps(props.counts);

  if (props.compact) {
    return (
      <section
        className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3"
        data-testid="ss-lifecycle-next-actions"
        aria-labelledby="ss-lifecycle-next-actions-title"
      >
        <h4
          id="ss-lifecycle-next-actions-title"
          className="ss-subsection-title text-emerald-100"
        >
          라이프사이클 진행
        </h4>
        <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {steps.map((step, idx) => (
            <li
              key={step.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${toneClass(step.status)}`}
              data-testid={`ss-lifecycle-step-${step.id}`}
              title={step.blockedReason ?? step.nextAction}
            >
              <span className="opacity-70">{idx + 1}</span>
              <span className="font-medium">{step.title}</span>
              <span className="opacity-80">{step.statusLabel}</span>
              {idx < steps.length - 1 ? (
                <span className="ml-0.5 opacity-40" aria-hidden>
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        <details className="mt-2 text-xs text-emerald-100/70">
          <summary className="cursor-pointer">단계별 차단·다음 행동</summary>
          <ul className="mt-2 space-y-1.5">
            {steps.map((step) => (
              <li key={`detail-${step.id}`}>
                <span className="font-medium">{step.title}</span>
                {" · "}
                {step.statusLabel}
                {step.blockedReason ? ` · ${step.blockedReason}` : ""}
                {" · "}
                {step.nextAction}
              </li>
            ))}
          </ul>
        </details>
      </section>
    );
  }

  return (
    <section
      className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-4"
      data-testid="ss-lifecycle-next-actions"
      aria-labelledby="ss-lifecycle-next-actions-title"
    >
      <div>
        <h4
          id="ss-lifecycle-next-actions-title"
          className="ss-subsection-title text-emerald-100"
        >
          다음 단계 (라이프사이클)
        </h4>
        <p className="mt-1 text-xs text-emerald-100/70">
          저장된 연구 결과 기준으로 판단합니다. 모의·실전 활성 여부는 여기서
          주장하지 않습니다.
        </p>
      </div>
      <ol className="space-y-2">
        {steps.map((step, idx) => (
          <li
            key={step.id}
            className={`rounded-lg border px-3 py-2.5 text-sm ${toneClass(step.status)}`}
            data-testid={`ss-lifecycle-step-${step.id}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {idx + 1}. {step.title}
              </span>
              <span className="text-xs opacity-90">{step.statusLabel}</span>
            </div>
            <p className="mt-1 text-xs opacity-90">
              완료 기준: {step.completionCriteria}
            </p>
            {step.blockedReason ? (
              <p className="mt-1 text-xs font-medium">{step.blockedReason}</p>
            ) : null}
            <p className="mt-1 text-xs">다음 행동: {step.nextAction}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

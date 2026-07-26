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

  const steps: LifecycleStep[] = [
    {
      id: "top10",
      title: "TOP 10 검토",
      status:
        top10 > 0 ? "complete" : qualified > 0 ? "ready" : "blocked",
      statusLabel:
        top10 > 0
          ? stepStatusLabel("complete")
          : qualified > 0
            ? stepStatusLabel("ready")
            : stepStatusLabel("blocked"),
      completionCriteria: "장기 저장 TOP 10 후보가 1개 이상",
      blockedReason:
        qualified === 0
          ? "합격 trial이 없어 TOP 10을 만들 수 없습니다."
          : top10 === 0
            ? "아직 TOP 10 저장 증거가 없습니다."
            : null,
      nextAction:
        top10 > 0
          ? "TOP 10 목록을 검토하세요."
          : "탐색 결과 요약에서 TOP 10 저장 여부를 확인하세요.",
    },
    {
      id: "register",
      title: "추천 전략 등록",
      status:
        registered > 0 ? "complete" : qualified > 0 ? "ready" : "blocked",
      statusLabel:
        registered > 0
          ? stepStatusLabel("complete")
          : qualified > 0
            ? stepStatusLabel("ready")
            : stepStatusLabel("blocked"),
      completionCriteria: "등록된 전략 1개 이상 (summary.registeredStrategies)",
      blockedReason:
        qualified === 0 ? "등록할 합격 trial이 없습니다." : null,
      nextAction:
        registered > 0
          ? "등록된 전략으로 백테스트를 진행하세요."
          : "탐색 결과에서 전략 등록을 실행하세요.",
    },
    {
      id: "backtest",
      title: "기간을 선택해 백테스트",
      status:
        backtestRec > 0
          ? "complete"
          : registered > 0
            ? "ready"
            : qualified > 0
              ? "waiting"
              : "blocked",
      statusLabel:
        backtestRec > 0
          ? stepStatusLabel("complete")
          : registered > 0
            ? stepStatusLabel("ready")
            : stepStatusLabel("waiting"),
      completionCriteria: "백테스트 추천 후보 1개 이상 · 기간은 사용자 선택",
      blockedReason:
        registered > 0 && backtestRec === 0
          ? "백테스트 필요"
          : qualified === 0
            ? "백테스트할 합격 trial이 없습니다."
            : registered === 0
              ? "라이브러리 등록 후 백테스트를 실행하세요."
              : null,
      nextAction:
        backtestRec > 0
          ? "백테스트 추천 목록을 확인하세요."
          : registered > 0
            ? "등록 전략에 대해 기간을 선택해 백테스트를 실행하세요."
            : "전략 등록 후 백테스트를 진행하세요.",
    },
    {
      id: "eligibility",
      title: "백테스트 적격성 검토",
      status:
        finalEligible > 0
          ? "complete"
          : backtestRec > 0
            ? "ready"
            : qualified > 0
              ? "waiting"
              : "blocked",
      statusLabel:
        finalEligible > 0
          ? stepStatusLabel("complete")
          : backtestRec > 0
            ? stepStatusLabel("ready")
            : stepStatusLabel("waiting"),
      completionCriteria: "최종 추천 가능 후보 1개 이상 (비용·안정성·과적합 증거)",
      blockedReason:
        backtestRec > 0 && finalEligible === 0
          ? "추가 검증 필요"
          : qualified === 0
            ? "검증할 후보가 없습니다."
            : backtestRec === 0
              ? "백테스트 추천 후 추가 검증을 진행하세요."
              : null,
      nextAction:
        finalEligible > 0
          ? "최종 추천 가능 후보를 확인하세요."
          : "비용·안정성·과적합 증거를 보완하세요.",
    },
    {
      id: "paper",
      title: "모의매매 등록",
      status: finalEligible > 0 ? "ready" : "blocked",
      statusLabel:
        finalEligible > 0 ? stepStatusLabel("ready") : stepStatusLabel("blocked"),
      completionCriteria: "최종 추천 가능 후보 1개 이상 (모의 등록은 별도 실행)",
      blockedReason:
        finalEligible === 0 ? "추가 검증 필요" : null,
      nextAction:
        finalEligible > 0
          ? "모의매매 등록 가능 — 백테스트 화면에서 모의 등록을 실행하세요."
          : "최종 추천 가능 후보가 확보되면 모의 등록을 검토하세요.",
    },
    {
      id: "paper_compare",
      title: "모의매매 성과 비교",
      status: "blocked",
      statusLabel: stepStatusLabel("blocked"),
      completionCriteria: "모의매매 세션·성과 증거가 summary에 있어야 함 (현재 미포함)",
      blockedReason: "추가 검증 필요",
      nextAction:
        "모의매매 등록 후 성과 비교는 모의매매 화면에서 확인하세요.",
    },
    {
      id: "live",
      title: "실전매매 검토",
      status: "blocked",
      statusLabel: stepStatusLabel("blocked"),
      completionCriteria: "실전 검토는 모의매매·승인 증거가 필요합니다 (summary만으로는 확인 불가)",
      blockedReason: "실전매매 검토 불가",
      nextAction:
        finalEligible > 0
          ? "모의매매 결과와 승인 조건을 충족한 뒤 실전 검토를 진행하세요."
          : "최종 추천 가능 후보 확보 후 모의매매를 먼저 진행하세요.",
    },
  ];

  return steps;
}

export function LifecycleNextActionsPanel(props: {
  counts: ResearchResultCountsView;
}) {
  const steps = buildLifecycleNextActionSteps(props.counts);

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
          summary 카운트만으로 판단합니다. 모의·실전 활성 여부는 여기서 주장하지
          않습니다.
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

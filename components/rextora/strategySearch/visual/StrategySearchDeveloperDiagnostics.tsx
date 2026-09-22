"use client";

/** Isolated developer-only panels. Not imported into the customer render path. */
export function StrategySearchRuntimeDiagnostics(props: {
  generationFact: string | null;
  completionNote: string | null;
  liveNote: string | null;
  selectedStatusKo: string | null;
  qualifiedFact: string | null;
}) {
  return (
    <details className="v3-ss-disc ss-developer-diagnostics">
      <summary>실행 파이프라인 · 런타임 세부</summary>
      <p className="v3-ss-note">
        {props.generationFact
          ? `세대 ${props.generationFact}`
          : "세대 · 평가 · 합격 필터는 선택된 탐색의 실제 런타임 값만 표시합니다."}
        {props.completionNote ? ` · ${props.completionNote}` : ""}
        {props.liveNote ? ` · ${props.liveNote}` : ""}
      </p>
      {props.selectedStatusKo ? (
        <p className="v3-ss-note">
          상태 {props.selectedStatusKo}
          {props.qualifiedFact && props.qualifiedFact !== "—"
            ? ` · 통과 후보 ${props.qualifiedFact}`
            : ""}
        </p>
      ) : (
        <p className="v3-ss-note">선택된 탐색이 없습니다.</p>
      )}
    </details>
  );
}

export function StrategySearchDeveloperInfo(props: {
  jobId: string;
  status: string;
  completionReason?: string | null;
  terminationReason?: string | null;
  finalizedHash?: string | null;
}) {
  return (
    <details
      className="ss-developer-diagnostics"
      data-testid="ss-completion-tech-details"
    >
      <summary className="cursor-pointer select-none">개발자 정보</summary>
      <div className="mt-2 space-y-1 font-mono">
        <p>jobId: {props.jobId}</p>
        <p>status: {props.status}</p>
        {props.completionReason ? (
          <p>completionReason: {props.completionReason}</p>
        ) : null}
        {props.terminationReason ? (
          <p>terminationReason: {props.terminationReason}</p>
        ) : null}
        {props.finalizedHash ? (
          <p>finalizedHash: {props.finalizedHash}</p>
        ) : null}
      </div>
    </details>
  );
}

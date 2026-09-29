"use client";

export function CompletedResultLoading() {
  return (
    <div
      className="ss-completed-result-loading rextora-card"
      data-testid="ss-completed-result-loading"
      role="status"
      aria-live="polite"
    >
      <p className="ss-completed-result-loading__title">탐색 결과를 불러오는 중…</p>
      <p className="ss-completed-result-loading__detail">
        완료된 탐색 결과와 후보 분석을 준비하고 있습니다.
      </p>
    </div>
  );
}

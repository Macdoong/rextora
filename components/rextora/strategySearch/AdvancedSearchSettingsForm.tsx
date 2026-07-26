"use client";

import Link from "next/link";

/**
 * Legacy advanced settings surface — settings now live on the main Strategy Search form.
 * Kept for imports/tests; directs operators back to the unified form.
 */
export function AdvancedSearchSettingsForm() {
  return (
    <section
      className="rextora-card space-y-4 p-5"
      data-testid="ss-advanced-settings-redirect"
      aria-labelledby="ss-advanced-settings-redirect-title"
    >
      <h2 id="ss-advanced-settings-redirect-title" className="ss-section-title">
        고급 탐색 설정
      </h2>
      <p className="text-sm text-slate-300">
        고급 탐색 설정은 전략 탐색 페이지에 통합되었습니다. 실행·자원 제한,
        전문가 조건, 설정 저장은 메인 화면에서 바로 조정할 수 있습니다.
      </p>
      <Link
        href="/strategy-search#ss-section-engine"
        className="inline-flex text-sm font-medium text-sky-300 underline-offset-2 hover:underline"
        data-testid="ss-advanced-back-link"
      >
        ← 통합 탐색 설정으로 이동
      </Link>
    </section>
  );
}

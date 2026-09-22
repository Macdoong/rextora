"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function SetupResultsCollapsible(props: {
  active: boolean;
  summaryMeta: string;
  children: ReactNode;
}) {
  if (!props.active) {
    return <>{props.children}</>;
  }
  return (
    <details
      className="v3-ss-setup-results-collapsible"
      data-testid="ss-setup-results-collapsible"
    >
      <summary
        className="v3-ss-setup-results-summary"
        data-testid="ss-setup-results-toggle"
      >
        <div className="v3-ss-setup-results-summary__lead">
          <span className="v3-ss-setup-results-summary__title">최근 탐색 결과</span>
          <span className="v3-ss-setup-results-summary__meta">{props.summaryMeta}</span>
        </div>
        <span className="v3-ss-setup-results-summary__action" aria-hidden="true">
          결과 보기
          <ChevronDown className="v3-ss-setup-results-summary__chevron" />
        </span>
      </summary>
      <div className="v3-ss-setup-results-panel">{props.children}</div>
    </details>
  );
}

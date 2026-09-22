"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function GuidedDisclosure(props: {
  title: string;
  summaryMeta?: string;
  defaultOpen?: boolean;
  testId?: string;
  coach?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details
      className="ss-guided-disclosure"
      data-testid={props.testId}
      open={props.defaultOpen}
    >
      <summary className="ss-guided-disclosure__summary">
        <span className="ss-guided-disclosure__lead">
          <span className="ss-guided-disclosure__title">{props.title}</span>
          {props.summaryMeta ? (
            <span className="ss-guided-disclosure__meta">{props.summaryMeta}</span>
          ) : null}
        </span>
        <span className="ss-guided-disclosure__action" aria-hidden="true">
          세부 조정
          <ChevronDown className="ss-guided-disclosure__chevron" />
        </span>
      </summary>
      <div className="ss-guided-disclosure__body">
        {props.coach}
        {props.children}
      </div>
    </details>
  );
}

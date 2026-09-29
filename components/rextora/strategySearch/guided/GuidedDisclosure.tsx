"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

function guidedDisclosureMetaParts(
  summaryMeta: string | readonly string[] | undefined,
): string[] {
  if (summaryMeta == null) return [];
  if (typeof summaryMeta !== "string") {
    return summaryMeta.map((part) => part.trim()).filter(Boolean);
  }
  const trimmed = summaryMeta.trim();
  return trimmed ? [trimmed] : [];
}

export function GuidedDisclosure(props: {
  title: string;
  summaryMeta?: string | readonly string[];
  defaultOpen?: boolean;
  testId?: string;
  coach?: ReactNode;
  children: ReactNode;
}) {
  const metaParts = guidedDisclosureMetaParts(props.summaryMeta);

  return (
    <details
      className="ss-guided-disclosure"
      data-testid={props.testId}
      open={props.defaultOpen}
    >
      <summary className="ss-guided-disclosure__summary">
        <span className="ss-guided-disclosure__lead">
          <span className="ss-guided-disclosure__title">{props.title}</span>
          {metaParts.map((part, index) => (
            <span
              key={`${part}-${index}`}
              className="ss-guided-disclosure__meta-group"
            >
              <span className="ss-guided-disclosure__sep" aria-hidden="true">
                {" · "}
              </span>
              <span className="ss-guided-disclosure__meta">{part}</span>
            </span>
          ))}
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

"use client";

import { Badge } from "@/components/ui/primitives";

/** Visible demo identity badge — never implies live/verified performance. */
export function DemoDataBadge({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span title="데모 데이터 · 예시이며 실전 증거나 실전 주문이 아닙니다">
      <Badge
        tone="warning"
        className={className}
        data-testid="demo-data-badge"
      >
        {compact ? "데모" : "데모 데이터"}
      </Badge>
    </span>
  );
}

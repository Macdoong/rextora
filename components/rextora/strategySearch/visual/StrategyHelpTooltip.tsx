"use client";

import { useId, useState, type ReactNode } from "react";

export function StrategyHelpTooltip({
  label,
  content,
}: {
  label: string;
  content: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="ss-help-tip">
      <button
        type="button"
        className="ss-help-tip__hit"
        aria-label={`${label} 설명`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        data-testid="ss-help-tooltip"
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span className="ss-help-tip__mark" aria-hidden="true">
          ?
        </span>
      </button>
      {open ? (
        <span id={id} role="tooltip" className="ss-help-tip__bubble">
          {content}
        </span>
      ) : null}
    </span>
  );
}

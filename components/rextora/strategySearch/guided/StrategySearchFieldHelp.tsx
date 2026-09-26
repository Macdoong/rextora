"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  STRATEGY_SEARCH_FIELD_HELP,
  type StrategySearchFieldHelpEntry,
} from "./strategySearchFieldHelpContent";

export function StrategySearchFieldHelp(props: {
  fieldId: keyof typeof STRATEGY_SEARCH_FIELD_HELP | string;
  entry?: StrategySearchFieldHelpEntry;
}) {
  const entry =
    props.entry ??
    STRATEGY_SEARCH_FIELD_HELP[props.fieldId as string] ??
    null;
  if (!entry) return null;

  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <span className="ss-field-help" ref={rootRef}>
      <button
        type="button"
        className="ss-field-help__trigger"
        aria-label={`${entry.title} 도움말`}
        aria-expanded={open}
        aria-controls={id}
        data-testid={`ss-field-help-${props.fieldId}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          className="ss-field-help__popover"
          data-testid={`ss-field-help-popover-${props.fieldId}`}
        >
          <p className="ss-field-help__title">{entry.title}</p>
          <p>
            <strong>무엇인가?</strong> {entry.what}
          </p>
          <p>
            <strong>영향</strong> {entry.impact}
          </p>
          <p>
            <strong>설정 방법</strong> {entry.how}
          </p>
          {entry.example ? (
            <p className="ss-field-help__example">{entry.example}</p>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  computeFieldHelpPopoverLayout,
  type FieldHelpPopoverPlacement,
} from "./fieldHelpPopoverLayout";
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

  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const [placement, setPlacement] = useState<FieldHelpPopoverPlacement>("right");
  const [caretStyle, setCaretStyle] = useState<CSSProperties>({});
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const tr = trigger.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const maxWidth = Math.min(340, window.innerWidth - 24);
    const width = Math.min(
      maxWidth,
      Math.max(popover.scrollWidth, popRect.width || 0, 200),
    );
    const height = popover.offsetHeight || popRect.height || 120;
    const next = computeFieldHelpPopoverLayout({
      trigger: tr,
      popoverWidth: width,
      popoverHeight: height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    setPopoverStyle(next.style);
    setPlacement(next.placement);
    setCaretStyle({
      ["--ss-field-help-caret-top" as string]: `${Math.round(next.caretTopPx)}px`,
      ...(next.caretLeftPx != null
        ? { ["--ss-field-help-caret-left" as string]: `${Math.round(next.caretLeftPx)}px` }
        : {}),
    });
  };

  const portalTarget =
    open && typeof document !== "undefined"
      ? (rootRef.current?.closest<HTMLElement>(".v3-strategy-search") ??
        document.body)
      : null;
  const portalUsesBodyHost = portalTarget === document.body;

  useLayoutEffect(() => {
    if (!open || !portalTarget) return;
    reposition();
    requestAnimationFrame(() => reposition());
  }, [open, entry?.title, portalTarget]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      const root = rootRef.current;
      const popover = popoverRef.current;
      if (root?.contains(target) || popover?.contains(target)) return;
      setOpen(false);
    };
    const onReflow = () => reposition();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  if (!entry) return null;

  const popoverBody = (
    <>
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
    </>
  );

  const popoverPanel = (
    <div
      id={id}
      role="dialog"
      ref={popoverRef}
      className="ss-field-help__popover ss-field-help__popover--viewport"
      style={{ ...popoverStyle, ...caretStyle }}
      data-placement={placement}
      data-testid={`ss-field-help-popover-${props.fieldId}`}
    >
      {popoverBody}
    </div>
  );

  return (
    <span className="ss-field-help" ref={rootRef}>
      <button
        ref={triggerRef}
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
      {open && portalTarget
        ? createPortal(
            portalUsesBodyHost ? (
              <div className="v3-strategy-search ss-field-help__portal-host">
                {popoverPanel}
              </div>
            ) : (
              popoverPanel
            ),
            portalTarget,
          )
        : null}
    </span>
  );
}

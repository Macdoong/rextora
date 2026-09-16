"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function V3Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  closeOnBackdrop = true,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  closeOnBackdrop?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="v3-dialog-backdrop"
      data-open="true"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        className={cx("v3-dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="v3-dialog__head">
          <h2 className="v3-dialog__title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="v3-dialog__close"
            aria-label="닫기"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="v3-dialog__body">{children}</div>
        {actions != null ? <div className="v3-dialog__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

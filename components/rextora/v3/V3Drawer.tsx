"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function V3Drawer({
  open,
  onClose,
  title,
  children,
  wide = false,
  keepMounted = false,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  wide?: boolean;
  keepMounted?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
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

  if (!open && !keepMounted) return null;

  return (
    <>
      {open ? (
        <div
          className="v3-drawer-backdrop"
          data-open="true"
          onClick={onClose}
        />
      ) : null}
      <aside
        ref={panelRef}
        className={cx("v3-drawer", wide && "v3-drawer--wide", className)}
        data-open={open ? "true" : "false"}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-hidden={open ? undefined : true}
        aria-labelledby={titleId}
        tabIndex={-1}
        inert={open ? undefined : true}
      >
        <div className="v3-drawer__head">
          <h2 className="v3-drawer__title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="v3-drawer__close"
            aria-label="닫기"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="v3-drawer__body">{children}</div>
      </aside>
    </>
  );
}

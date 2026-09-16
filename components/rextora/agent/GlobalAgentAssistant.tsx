"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrainCircuit, X, Play } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSharedAgentSession } from "./AgentSessionProvider";
import { useGlobalAgentPresentation } from "./GlobalAgentPresentationContext";
import { AgentPanel, type AgentPanelVariant } from "./AgentPanel";
import { OPEN_EVENT } from "./agentPersistence";
import { useAgentPresentationSurface } from "@/components/rextora/shell/ShellAgentWorkspace";

/** Shared bottom slot so FAB never covers sticky primary CTAs. */
export const REXTORA_FAB_OFFSET_VAR = "--rextora-fab-offset";
export const REXTORA_FAB_OFFSET_DEFAULT = "5.5rem";

function panelVariantForSurface(
  surface: ReturnType<typeof useAgentPresentationSurface>,
): AgentPanelVariant {
  if (surface === "mobile") return "mobile-sheet";
  return "drawer";
}

/**
 * Global AI Trading Employee host.
 * Open/close chrome and a single shared AgentPanel instance.
 * Shell placement is owned by ShellAgentWorkspace + globals.css.
 */
export function GlobalAgentAssistant() {
  const session = useSharedAgentSession();
  const pathname = usePathname() ?? "";
  const surface = useAgentPresentationSurface();
  const { open, setOpen } = useGlobalAgentPresentation();
  const fabRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pendingCount = session.missionTimeline.pendingApprovals.length;
  const showResume =
    session.canResume && session.turns.length > 0 && !session.isThinking;

  const hasStickyPrimary =
    pathname.startsWith("/strategy-search") ||
    pathname.startsWith("/backtest") ||
    pathname.startsWith("/paper-trading") ||
    pathname.startsWith("/live-trading");

  const closeAgent = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      fabRef.current?.focus();
    });
  };

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (
        event as CustomEvent<{ resume?: boolean; query?: string | null }>
      ).detail;
      setOpen(true);
      if (detail?.resume) {
        void session.resumeWhereLeftOff();
      } else if (detail?.query) {
        void session.sendQuery(detail.query);
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(OPEN_EVENT, onOpen as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => {
          fabRef.current?.focus();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      closeRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (!open || surface === "desktop") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, surface]);

  const fabMode = hasStickyPrimary ? "raised" : "default";
  const panelVariant = panelVariantForSurface(surface);

  return (
    <div
      className="rextora-agent-root"
      data-agent-open={open ? "true" : "false"}
      data-agent-surface={surface}
      data-agent-expanded="false"
      data-agent-host="global"
    >
      {!open ? (
        <button
          ref={fabRef}
          type="button"
          onClick={() => setOpen(true)}
          className={`rextora-agent-fab rextora-agent-fab--${fabMode}${session.isThinking ? " is-working" : ""}`}
          style={
            hasStickyPrimary
              ? ({
                  [REXTORA_FAB_OFFSET_VAR]: REXTORA_FAB_OFFSET_DEFAULT,
                } as CSSProperties)
              : undefined
          }
          data-testid="global-agent-fab"
          data-fab-mode={fabMode}
          aria-label="AI 트레이딩 직원 열기"
        >
          <BrainCircuit className="rextora-agent-fab-icon" aria-hidden="true" />
          <span className="rextora-agent-fab-label">AI</span>
          {pendingCount > 0 ? (
            <span
              className="rextora-agent-fab-badge"
              data-testid="global-agent-pending-badge"
            >
              {pendingCount}
            </span>
          ) : null}
        </button>
      ) : null}

      {open ? (
        <div
          className={`rextora-agent-host rextora-agent-host--open rextora-agent-host--${surface}`}
          data-testid="global-agent-overlay"
          role="dialog"
          aria-modal={surface !== "desktop" ? "true" : "false"}
          aria-label="AI 트레이딩 직원"
        >
          <button
            type="button"
            className="rextora-agent-host-dismiss"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeAgent}
          />
          <aside
            className={`rextora-agent-drawer rextora-agent-workspace rextora-agent-workspace--${surface}`}
            data-testid="global-agent-drawer"
            data-agent-surface={surface}
          >
            <header className="rextora-agent-drawer-header">
              <div className="rextora-agent-drawer-heading">
                <p className="rextora-agent-drawer-title">AI 트레이딩 직원</p>
                <p className="rextora-agent-drawer-subtitle">
                  승인 후에만 실행 · Live/실주문 없음
                </p>
              </div>
              <div className="rextora-agent-drawer-actions">
                {showResume ? (
                  <button
                    type="button"
                    onClick={() => void session.resumeWhereLeftOff()}
                    className="rextora-agent-drawer-resume"
                    data-testid="global-agent-resume"
                  >
                    <Play className="size-3.5" aria-hidden="true" />
                    이어서
                  </button>
                ) : null}
                <button
                  ref={closeRef}
                  type="button"
                  onClick={closeAgent}
                  className="rextora-agent-drawer-close"
                  aria-label="닫기"
                  data-testid="global-agent-close"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </header>
            <div className="rextora-agent-drawer-body">
              <AgentPanel variant={panelVariant} shared />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

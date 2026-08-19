"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { BrainCircuit, X, Play } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSharedAgentSession } from "./AgentSessionProvider";
import { AgentPanel } from "./AgentPanel";
import { OPEN_EVENT } from "./agentPersistence";

/** Shared bottom slot so FAB never covers sticky primary CTAs. */
export const REXTORA_FAB_OFFSET_VAR = "--rextora-fab-offset";
export const REXTORA_FAB_OFFSET_DEFAULT = "5.5rem";

/**
 * Global floating AI Trading Employee.
 * Compact drawer — must not obscure critical page CTAs.
 */
export function GlobalAgentAssistant() {
  const session = useSharedAgentSession();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const pendingCount = session.missionTimeline.pendingApprovals.length;
  const showResume =
    session.canResume && session.turns.length > 0 && !session.isThinking;

  // Pages with sticky primary actions: park FAB above the sticky bar slot.
  const hasStickyPrimary =
    pathname.startsWith("/strategy-search") ||
    pathname.startsWith("/backtest") ||
    pathname.startsWith("/paper-trading") ||
    pathname.startsWith("/live-trading");

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
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`fixed z-40 flex min-h-11 items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/90 px-3 py-2 text-sm font-semibold text-emerald-50 shadow-lg backdrop-blur transition hover:bg-emerald-900 ${
            hasStickyPrimary
              ? "bottom-[var(--rextora-fab-offset,5.5rem)] right-4 sm:right-5"
              : "bottom-5 right-4 sm:right-5"
          }`}
          style={
            hasStickyPrimary
              ? ({
                  [REXTORA_FAB_OFFSET_VAR]: REXTORA_FAB_OFFSET_DEFAULT,
                } as CSSProperties)
              : undefined
          }
          data-testid="global-agent-fab"
          data-fab-mode={hasStickyPrimary ? "raised" : "default"}
          aria-label="AI 트레이딩 직원 열기"
        >
          <BrainCircuit className="size-4 text-emerald-300" />
          <span className="hidden sm:inline">AI</span>
          {pendingCount > 0 ? (
            <span
              className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-950"
              data-testid="global-agent-pending-badge"
            >
              {pendingCount}
            </span>
          ) : null}
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px] sm:bg-slate-950/50"
          data-testid="global-agent-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="AI 트레이딩 직원"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="닫기"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative flex h-full w-full max-w-[100vw] flex-col border-l border-slate-700/70 bg-slate-950 shadow-2xl sm:max-w-md lg:max-w-lg"
            data-testid="global-agent-drawer"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100">
                  AI 트레이딩 직원
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  승인 후에만 실행 · Live/실주문 없음
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {showResume ? (
                  <button
                    type="button"
                    onClick={() => void session.resumeWhereLeftOff()}
                    className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-emerald-500/35 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/40"
                    data-testid="global-agent-resume"
                  >
                    <Play className="size-3.5" />
                    이어서
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                  aria-label="닫기"
                  data-testid="global-agent-close"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
              <AgentPanel variant="drawer" shared />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

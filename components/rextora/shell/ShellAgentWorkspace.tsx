"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type AgentPresentationSurface = "desktop" | "tablet" | "mobile";

function resolveAgentSurface(width: number): AgentPresentationSurface {
  if (width >= 1180) return "desktop";
  if (width >= 768) return "tablet";
  return "mobile";
}

/**
 * Shell-owned placement surface for the global Agent UI.
 * Presentation only — no session state, providers, fetching, or AgentPanel duplication.
 */
export function ShellAgentWorkspace({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<AgentPresentationSurface>("desktop");
  const [agentOpen, setAgentOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => {
      setSurface(resolveAgentSurface(window.innerWidth));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;

    const syncOpenState = () => {
      setAgentOpen(
        aside.querySelector('[data-agent-open="true"]') !== null,
      );
    };

    syncOpenState();
    const observer = new MutationObserver(syncOpenState);
    observer.observe(aside, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-agent-open"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <aside
      ref={asideRef}
      className={`rextora-shell-agent-workspace${
        agentOpen && surface === "desktop"
          ? " rextora-shell-agent-workspace--open"
          : ""
      }`}
      data-testid="shell-agent-workspace"
      data-agent-surface={surface}
      data-agent-open={agentOpen ? "true" : "false"}
      aria-label="Agent workspace"
    >
      <div className="rextora-shell-agent-workspace-inner">{children}</div>
    </aside>
  );
}

export function useAgentPresentationSurface(): AgentPresentationSurface {
  const [surface, setSurface] = useState<AgentPresentationSurface>("desktop");

  useEffect(() => {
    const update = () => {
      setSurface(resolveAgentSurface(window.innerWidth));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return surface;
}

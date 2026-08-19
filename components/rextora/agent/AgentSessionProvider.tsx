"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  useAgentSession,
  type UseAgentSessionResult,
} from "./useAgentSession";

const AgentSessionContext = createContext<UseAgentSessionResult | null>(null);

/**
 * Single shared AI Trading Employee session for the whole app shell.
 * Dashboard panel and Global Assistant consume the same conversation.
 * V2: server-authoritative session with client cache fallback.
 */
export function AgentSessionProvider({ children }: { children: ReactNode }) {
  const session = useAgentSession();
  return (
    <AgentSessionContext.Provider value={session}>
      {children}
    </AgentSessionContext.Provider>
  );
}

export function useSharedAgentSession(): UseAgentSessionResult {
  const ctx = useContext(AgentSessionContext);
  if (!ctx) {
    throw new Error(
      "useSharedAgentSession must be used within AgentSessionProvider",
    );
  }
  return ctx;
}

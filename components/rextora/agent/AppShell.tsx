"use client";

import type { ReactNode } from "react";
import { GlobalAgentAssistant } from "./GlobalAgentAssistant";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";

/**
 * Client shell wrapping the dashboard with a shared AI Trading Employee session.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ClientHydrated>
        <GlobalAgentAssistant />
      </ClientHydrated>
    </>
  );
}

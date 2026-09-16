"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/rextora/Sidebar";
import { AgentSessionProvider } from "@/components/rextora/agent/AgentSessionProvider";
import { GlobalAgentPresentationProvider } from "@/components/rextora/agent/GlobalAgentPresentationContext";
import { GlobalAgentAssistant } from "@/components/rextora/agent/GlobalAgentAssistant";
import { ClientHydrated } from "@/components/rextora/ClientHydrated";
import { ContextBar } from "@/components/rextora/shell/ContextBar";
import { OperatorPageContextProvider } from "@/components/rextora/shell/OperatorPageContext";
import { ShellAgentWorkspace } from "@/components/rextora/shell/ShellAgentWorkspace";
import { AuthSessionProvider } from "@/components/rextora/auth/AuthSessionProvider";
import type { PublicRextoraUser } from "@/src/lib/rextora/auth/authTypes";

export function GlobalShell({
  children,
  user,
}: {
  children: ReactNode;
  user: PublicRextoraUser;
}) {
  return (
    <AuthSessionProvider user={user}>
      <AgentSessionProvider>
      <GlobalAgentPresentationProvider>
        <OperatorPageContextProvider>
        <div className="dashboard-shell v3-shell">
          <Sidebar />
          <main className="dashboard-main">
            <header className="rextora-shell-context-region">
              <ContextBar />
            </header>
            <div className="rextora-main-workspace">
              <div className="rextora-main-content">{children}</div>
              <ShellAgentWorkspace>
                <ClientHydrated>
                  <GlobalAgentAssistant />
                </ClientHydrated>
              </ShellAgentWorkspace>
            </div>
          </main>
        </div>
        </OperatorPageContextProvider>
      </GlobalAgentPresentationProvider>
    </AgentSessionProvider>
    </AuthSessionProvider>
  );
}

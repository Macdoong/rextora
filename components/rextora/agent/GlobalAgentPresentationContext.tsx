"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type GlobalAgentPresentationContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const GlobalAgentPresentationContext =
  createContext<GlobalAgentPresentationContextValue | null>(null);

/**
 * Presentation-only bridge: global Agent open/close visibility for embedded surfaces.
 * Does not own session, approval, or routing state.
 */
export function GlobalAgentPresentationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return (
    <GlobalAgentPresentationContext.Provider value={value}>
      {children}
    </GlobalAgentPresentationContext.Provider>
  );
}

export function useGlobalAgentPresentation(): GlobalAgentPresentationContextValue {
  const context = useContext(GlobalAgentPresentationContext);
  if (!context) {
    throw new Error(
      "useGlobalAgentPresentation must be used within GlobalAgentPresentationProvider",
    );
  }
  return context;
}

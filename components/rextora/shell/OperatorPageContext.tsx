"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PaperOperatorPageContext } from "@/src/lib/rextora/paper/paperOperatorPresentation";
import type { BacktestOperatorPageContext } from "@/src/lib/rextora/backtest/backtestOperatorPresentation";
import type { LiveGateOperatorPageContext } from "@/src/lib/rextora/live/liveGateOperatorPresentation";

export type OperatorPageContextValue =
  | PaperOperatorPageContext
  | BacktestOperatorPageContext
  | LiveGateOperatorPageContext
  | null;

type OperatorPageContextState = {
  value: OperatorPageContextValue;
  setValue: (next: OperatorPageContextValue) => void;
};

const OperatorPageContext = createContext<OperatorPageContextState>({
  value: null,
  setValue: () => undefined,
});

export function OperatorPageContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [value, setValue] = useState<OperatorPageContextValue>(null);
  const state = useMemo(() => ({ value, setValue }), [value]);
  return (
    <OperatorPageContext.Provider value={state}>
      {children}
    </OperatorPageContext.Provider>
  );
}

export function useOperatorPageContext(): OperatorPageContextValue {
  return useContext(OperatorPageContext).value;
}

export function useSetOperatorPageContext(
  next: OperatorPageContextValue,
): void {
  const { setValue } = useContext(OperatorPageContext);
  const serialized = JSON.stringify(next);
  useEffect(() => {
    setValue(next);
    return () => setValue(null);
    // serialized is the stable dependency for the page-supplied snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, setValue]);
}

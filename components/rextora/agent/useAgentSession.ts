"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  AgentLifecycleContext,
  AgentResponse,
  AgentErrorResponse,
  AgentTurn,
} from "@/src/lib/rextora/agent/types";
import { analytics } from "./agentAnalytics";

export interface AgentSessionTurn {
  id: string;
  query: string;
  response: AgentResponse | null;
  error: string | null;
  isLoading: boolean;
  timestamp: string;
}

function readStorage(key: string, storage: Storage): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Collect current operator lifecycle context from URL + persistence keys. */
export function collectLifecycleContext(): AgentLifecycleContext {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  type ViewState = {
    strategyId?: string | null;
    runId?: string | null;
    symbol?: string | null;
  };
  let viewState: ViewState | null = null;
  try {
    const raw = readStorage("rextora.backtest.viewState", sessionStorage);
    if (raw) viewState = JSON.parse(raw) as ViewState;
  } catch {
    viewState = null;
  }

  const jobId =
    params.get("jobId") ||
    readStorage("rextora.strategySearch.selectedJobId", localStorage);

  return {
    route: window.location.pathname,
    strategyId:
      params.get("strategyId") ||
      viewState?.strategyId ||
      readStorage("rextora.lastBacktestStrategyId", localStorage) ||
      null,
    runId: params.get("runId") || viewState?.runId || null,
    jobId: jobId || null,
    symbol: params.get("symbol") || viewState?.symbol || null,
    timeframe: params.get("timeframe") || null,
    paperSessionId: params.get("sessionId") || null,
  };
}

export function useAgentSession() {
  const [turns, setTurns] = useState<AgentSessionTurn[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const activeTurnRef = useRef<string | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!openedRef.current) {
      openedRef.current = true;
      analytics.agentOpened();
    }
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const sendQuery = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || isThinking) return;

    const id = `turn-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const newTurn: AgentSessionTurn = {
      id,
      query: trimmed,
      response: null,
      error: null,
      isLoading: true,
      timestamp,
    };

    setTurns((prev) => [...prev, newTurn]);
    setIsThinking(true);

    const history: AgentTurn[] = turns
      .slice(-5)
      .flatMap<AgentTurn>((t) => {
        const msgs: AgentTurn[] = [
          { role: "user", content: t.query, timestamp: t.timestamp },
        ];
        if (t.response) {
          msgs.push({
            role: "agent",
            content: t.response.interpretationKo,
            timestamp: t.response.respondedAt,
          });
        }
        return msgs;
      });

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    activeTurnRef.current = id;

    const context = collectLifecycleContext();

    try {
      const res = await fetch("/api/rextora/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, history, context }),
        signal: controller.signal,
      });

      const data = (await res.json()) as AgentResponse | AgentErrorResponse;

      if ("error" in data) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, isLoading: false, error: data.messageKo } : t,
          ),
        );
      } else {
        analytics.messageSent(data.intentType, trimmed.length);

        if (data.safetyBlocked) {
          analytics.safetyBlocked(data.intentType);
        }

        if (data.interpretationSource === "llm" && data.providerMeta) {
          analytics.llmAnswerReturned(
            data.intentType,
            data.providerMeta.provider,
            data.providerMeta.latencyMs,
            data.providerMeta.cached,
          );
          if (data.providerMeta.errorKo) {
            analytics.providerError(data.providerMeta.provider, "fallback");
          }
        } else {
          analytics.localAnswerReturned(data.intentType, data.facts.length);
        }

        if (data.actions.length > 0) {
          analytics.resultExplained(data.intentType);
        }

        setTurns((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, isLoading: false, response: data } : t,
          ),
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                isLoading: false,
                error: "에이전트에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
              }
            : t,
        ),
      );
    } finally {
      if (activeTurnRef.current === id) {
        activeTurnRef.current = null;
        abortRef.current = null;
        setIsThinking(false);
      }
    }
  }, [turns, isThinking]);

  const stopResponse = useCallback(() => {
    const activeId = activeTurnRef.current;
    if (!activeId) return;
    abortRef.current?.abort();
    activeTurnRef.current = null;
    abortRef.current = null;
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === activeId
          ? {
              ...turn,
              isLoading: false,
              error: "응답 생성을 중지했습니다. 같은 질문을 다시 시도할 수 있습니다.",
            }
          : turn,
      ),
    );
    setIsThinking(false);
  }, []);

  const clearSession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeTurnRef.current = null;
    setTurns([]);
    setIsThinking(false);
  }, []);

  return { turns, isThinking, sendQuery, stopResponse, clearSession };
}

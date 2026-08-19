"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  AgentLifecycleContext,
  AgentResponse,
  AgentErrorResponse,
  AgentTurn,
} from "@/src/lib/rextora/agent/types";
import type { ConversationEntityMemory } from "@/src/lib/rextora/agent/conversationContext";
import type { ProposedAction } from "@/src/lib/rextora/agent/proposedAction";
import type { ResearchWorkspaceSummary } from "@/src/lib/rextora/agent/researchWorkspace";
import {
  buildMissionTimeline,
  emptyMissionTimeline,
  type MissionTimeline,
} from "@/src/lib/rextora/agent/missionTimeline";
import { analytics } from "./agentAnalytics";
import {
  type AgentSessionTurn,
  clearAgentPersistence,
  hasResumableSession,
  loadEntityMemory,
  loadPersistedWorkspace,
  loadSessionTurns,
  persistEntityMemory,
  persistTurns,
  persistWorkspaceBundle,
} from "./agentPersistence";
import {
  applyServerRecordToCache,
  buildSessionPatch,
  ensureClientSessionId,
  fetchAgentSession,
  hydrateStateFromRecord,
  patchAgentSessionClient,
  recoverPendingAction,
  resetAgentSessionClient,
} from "./agentSessionSync";
import {
  clearAgentProviderSelection,
  readAgentProviderSelection,
  type AgentProviderSelection,
} from "./AgentModelSelector";

export type { AgentSessionTurn };
export type { AgentProviderSelection };

const SYNC_DEBOUNCE_MS = 400;
/** Client-side bound — server provider timeout is 20s; allow tool execution headroom. */
const CLIENT_REQUEST_TIMEOUT_MS = 90_000;

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
    const raw = sessionStorage.getItem("rextora.backtest.viewState");
    if (raw) viewState = JSON.parse(raw) as ViewState;
  } catch {
    viewState = null;
  }

  let jobId: string | null = params.get("jobId");
  try {
    jobId = jobId || localStorage.getItem("rextora.strategySearch.selectedJobId");
  } catch {
    // ignore
  }

  let lastStrategy: string | null = null;
  try {
    lastStrategy = localStorage.getItem("rextora.lastBacktestStrategyId");
  } catch {
    // ignore
  }

  return {
    route: window.location.pathname,
    strategyId:
      params.get("strategyId") || viewState?.strategyId || lastStrategy || null,
    runId: params.get("runId") || viewState?.runId || null,
    jobId: jobId || null,
    symbol: params.get("symbol") || viewState?.symbol || null,
    timeframe: params.get("timeframe") || null,
    paperSessionId: params.get("sessionId") || null,
  };
}

export interface UseAgentSessionResult {
  turns: AgentSessionTurn[];
  isThinking: boolean;
  sessionHydrated: boolean;
  sendQuery: (query: string) => Promise<void>;
  stopResponse: () => void;
  clearSession: () => void;
  cancelPendingPlan: () => void;
  resumeWhereLeftOff: () => Promise<void>;
  entityMemory: ConversationEntityMemory | null;
  pendingProposedAction: ProposedAction | null;
  pinnedObjective: string | null;
  workspace: ResearchWorkspaceSummary | null;
  missionTimeline: MissionTimeline;
  canResume: boolean;
  providerSelection: AgentProviderSelection | null;
  setProviderSelection: (next: AgentProviderSelection | null) => void;
}

export function useAgentSession(): UseAgentSessionResult {
  // Keep the server render and the browser's first render identical. Browser
  // persistence is applied after mount by the hydration effect below.
  const [turns, setTurns] = useState<AgentSessionTurn[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [entityMemory, setEntityMemory] =
    useState<ConversationEntityMemory | null>(null);
  const [pendingProposedAction, setPendingProposedAction] =
    useState<ProposedAction | null>(null);
  const [pinnedObjective, setPinnedObjective] = useState<string | null>(null);
  const [workspace, setWorkspace] =
    useState<ResearchWorkspaceSummary | null>(null);
  const [missionTimeline, setMissionTimeline] = useState<MissionTimeline>(() =>
    emptyMissionTimeline(),
  );
  const [providerSelection, setProviderSelectionState] =
    useState<AgentProviderSelection | null>(null);
  const providerSelectionRef = useRef<AgentProviderSelection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeTurnRef = useRef<string | null>(null);
  const openedRef = useRef(false);
  const turnsRef = useRef<AgentSessionTurn[]>([]);
  const entityRef = useRef<ConversationEntityMemory | null>(null);
  const pendingRef = useRef<ProposedAction | null>(null);
  const workspaceRef = useRef<ResearchWorkspaceSummary | null>(null);
  const missionRef = useRef<MissionTimeline>(emptyMissionTimeline());
  const persistReady = useRef(false);
  const hydratingRef = useRef(true);
  const sessionIdRef = useRef<string | null>(null);
  const serverUpdatedAtRef = useRef<string>(new Date(0).toISOString());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const syncQueuedRef = useRef(false);

  useEffect(() => {
    persistReady.current = true;
  }, []);

  useEffect(() => {
    const existing = readAgentProviderSelection();
    if (!existing) return;
    providerSelectionRef.current = existing;
    queueMicrotask(() => {
      setProviderSelectionState(existing);
    });
  }, []);

  const setProviderSelection = useCallback(
    (next: AgentProviderSelection | null) => {
      providerSelectionRef.current = next;
      setProviderSelectionState(next);
      if (typeof window !== "undefined") {
        try {
          if (!next) sessionStorage.removeItem("rextora.agent.providerSelection");
          else
            sessionStorage.setItem(
              "rextora.agent.providerSelection",
              JSON.stringify(next),
            );
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  const syncToServer = useCallback(async (immediate = false) => {
    const sessionId = sessionIdRef.current ?? ensureClientSessionId();
    sessionIdRef.current = sessionId;
    if (hydratingRef.current) return;

    const run = async () => {
      if (syncInFlightRef.current) {
        // A newer local approval must not be dropped while an older sync is in flight.
        syncQueuedRef.current = true;
        return;
      }
      syncInFlightRef.current = true;
      try {
        do {
          syncQueuedRef.current = false;
          const updatedAt = new Date().toISOString();
          const localPending = pendingRef.current;
          const patch = buildSessionPatch({
            sessionId,
            updatedAt,
            turns: turnsRef.current,
            entityMemory: entityRef.current,
            pendingApproval: localPending,
            workspace: workspaceRef.current,
            missionTimeline: missionRef.current,
            context: collectLifecycleContext(),
          });
          const result = await patchAgentSessionClient(patch);
          if (result?.session) {
            serverUpdatedAtRef.current = result.session.updatedAt;
            if (!result.applied) {
              const hydrated = hydrateStateFromRecord(result.session);
              // On conflict, local pending wins — including explicit null after
              // approve/cancel. Resurrecting a stale server pending re-opens the
              // Approval Center on read-only status turns (lifecycle C).
              const mergedPending = localPending;
              pendingRef.current = mergedPending;
              setTurns(hydrated.turns);
              setEntityMemory(
                hydrated.entityMemory
                  ? {
                      ...hydrated.entityMemory,
                      pendingProposedAction: mergedPending,
                    }
                  : hydrated.entityMemory,
              );
              setPendingProposedAction(mergedPending);
              setPinnedObjective(hydrated.pinnedObjective);
              setWorkspace(hydrated.workspace);
              if (hydrated.missionTimeline) {
                setMissionTimeline(hydrated.missionTimeline);
              }
              applyServerRecordToCache(result.session);
            } else {
              applyServerRecordToCache(result.session);
            }
          }
        } while (syncQueuedRef.current);
      } finally {
        syncInFlightRef.current = false;
      }
    };

    if (immediate) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      await run();
      return;
    }

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void run();
    }, SYNC_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sessionId = ensureClientSessionId();
    sessionIdRef.current = sessionId;

    const cachedTurns = loadSessionTurns().map((turn) => ({
      ...turn,
      isLoading: false,
    }));
    const cachedEntity = loadEntityMemory();
    const cachedBundle = loadPersistedWorkspace();
    const cachedWorkspace = cachedBundle?.workspace ?? null;
    const cachedMission =
      cachedBundle?.missionTimeline ??
      buildMissionTimeline({
        entities: cachedEntity,
        workspace: cachedWorkspace,
      });

    turnsRef.current = cachedTurns;
    entityRef.current = cachedEntity;
    pendingRef.current = cachedEntity?.pendingProposedAction ?? null;
    workspaceRef.current = cachedWorkspace;
    missionRef.current = cachedMission;

    void (async () => {
      // Defer the external-store hydration until after the mount effect returns.
      await Promise.resolve();
      if (cancelled) return;
      setTurns(cachedTurns);
      setEntityMemory(cachedEntity);
      setPendingProposedAction(cachedEntity?.pendingProposedAction ?? null);
      setPinnedObjective(cachedEntity?.pinnedObjectiveKo ?? null);
      setWorkspace(cachedWorkspace);
      setMissionTimeline(cachedMission);

      const fetched = await fetchAgentSession(sessionId);
      if (cancelled) return;

      if (fetched.ok) {
        const hydrated = hydrateStateFromRecord(fetched.session);
        serverUpdatedAtRef.current = fetched.session.updatedAt;
        setTurns(hydrated.turns);
        setEntityMemory(hydrated.entityMemory);
        setPendingProposedAction(hydrated.pendingProposedAction);
        setPinnedObjective(hydrated.pinnedObjective);
        setWorkspace(hydrated.workspace);
        if (hydrated.missionTimeline) {
          setMissionTimeline(hydrated.missionTimeline);
        } else {
          setMissionTimeline(
            buildMissionTimeline({
              entities: hydrated.entityMemory,
              workspace: hydrated.workspace,
            }),
          );
        }
        applyServerRecordToCache(fetched.session);
      }

      hydratingRef.current = false;
      setSessionHydrated(true);
      if (!fetched.ok) await syncToServer(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [syncToServer]);

  useEffect(() => {
    turnsRef.current = turns;
    if (!persistReady.current || hydratingRef.current) return;
    persistTurns(turns);
    void syncToServer();
  }, [turns, syncToServer]);

  useEffect(() => {
    entityRef.current = entityMemory;
    if (!persistReady.current || hydratingRef.current) return;
    persistEntityMemory(entityMemory);
    persistWorkspaceBundle({
      entityMemory,
      workspace: workspaceRef.current,
      missionTimeline: missionRef.current,
      lastRoute:
        typeof window !== "undefined" ? window.location.pathname : null,
      updatedAt: new Date().toISOString(),
    });
    void syncToServer();
  }, [entityMemory, syncToServer]);

  useEffect(() => {
    pendingRef.current = pendingProposedAction;
    if (hydratingRef.current) return;
    void syncToServer();
  }, [pendingProposedAction, syncToServer]);

  useEffect(() => {
    workspaceRef.current = workspace;
    if (!persistReady.current || hydratingRef.current) return;
    persistWorkspaceBundle({
      entityMemory: entityRef.current,
      workspace,
      missionTimeline: missionRef.current,
      lastRoute:
        typeof window !== "undefined" ? window.location.pathname : null,
      updatedAt: new Date().toISOString(),
    });
    void syncToServer();
  }, [workspace, syncToServer]);

  useEffect(() => {
    missionRef.current = missionTimeline;
    if (!persistReady.current || hydratingRef.current) return;
    persistWorkspaceBundle({
      entityMemory: entityRef.current,
      workspace: workspaceRef.current,
      missionTimeline,
      lastRoute:
        typeof window !== "undefined" ? window.location.pathname : null,
      updatedAt: new Date().toISOString(),
    });
    void syncToServer();
  }, [missionTimeline, syncToServer]);

  useEffect(() => {
    if (!openedRef.current) {
      openedRef.current = true;
      analytics.agentOpened();
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const sendQuery = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const approvalCommand = trimmed === "진행해" || trimmed === "취소해";
    if (activeTurnRef.current) {
      const inFlight = turnsRef.current.find((t) => t.id === activeTurnRef.current);
      if (inFlight?.isLoading) {
        if (!approvalCommand) return;
        abortRef.current?.abort();
        setTurns((prev) =>
          prev.map((t) =>
            t.id === inFlight.id ? { ...t, isLoading: false } : t,
          ),
        );
      }
      activeTurnRef.current = null;
      setIsThinking(false);
    }

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

    setTurns((prev) => {
      const next = [...prev, newTurn];
      turnsRef.current = next;
      return next;
    });
    setIsThinking(true);

    const history: AgentTurn[] = turnsRef.current
      .slice(-5)
      .flatMap<AgentTurn>((t) => {
        const msgs: AgentTurn[] = [
          { role: "user", content: t.query, timestamp: t.timestamp },
        ];
        if (t.response) {
          const content =
            t.response.conclusionKo || t.response.interpretationKo || "";
          msgs.push({
            role: "agent",
            content: content.slice(0, 280),
            timestamp: t.response.respondedAt,
          });
        }
        return msgs;
      });

    if (abortRef.current && activeTurnRef.current) {
      const supersededId = activeTurnRef.current;
      abortRef.current.abort();
      setTurns((prev) =>
        prev.map((t) =>
          t.id === supersededId ? { ...t, isLoading: false } : t,
        ),
      );
    }
    const controller = new AbortController();
    abortRef.current = controller;
    activeTurnRef.current = id;

    const context = collectLifecycleContext();
    const clientTimeout = window.setTimeout(() => {
      controller.abort();
    }, CLIENT_REQUEST_TIMEOUT_MS);

    // Prefer live ref; if a stale session sync cleared it, recover the latest
    // proposed action from the conversation so Approve still executes once.
    const recoveredPending = recoverPendingAction({
      livePending: pendingRef.current,
      turns: turnsRef.current,
      entityMemory: entityRef.current,
    });
    if (recoveredPending && !pendingRef.current) {
      pendingRef.current = recoveredPending;
      setPendingProposedAction(recoveredPending);
    }

    try {
      const res = await fetch("/api/rextora/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          turnId: id,
          history,
          context,
          entityMemory: entityRef.current,
          pendingProposedAction: recoveredPending,
          pendingApprovals: recoveredPending ? [recoveredPending] : [],
          conversationContext: [...turnsRef.current]
            .reverse()
            .find((turn) => turn.response?.conversationContext)
            ?.response?.conversationContext,
          sessionId: sessionIdRef.current ?? ensureClientSessionId(),
          providerSelection: providerSelectionRef.current,
        }),
        signal: controller.signal,
      });

      const raw = await res.text();
      if (!raw.trim()) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  isLoading: false,
                  error: "서버 응답이 비어 있습니다. 잠시 후 다시 시도해 주세요.",
                }
              : t,
          ),
        );
        return;
      }
      let data: AgentResponse | AgentErrorResponse;
      try {
        data = JSON.parse(raw) as AgentResponse | AgentErrorResponse;
      } catch {
        const looksHtml = raw.trimStart().startsWith("<");
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  isLoading: false,
                  error: looksHtml
                    ? "서버가 HTML 오류 페이지를 반환했습니다. 잠시 후 다시 시도해 주세요."
                    : "응답 형식이 올바르지 않습니다.",
                }
              : t,
          ),
        );
        return;
      }

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

        if (data.entityMemory) {
          entityRef.current = data.entityMemory;
          setEntityMemory(data.entityMemory);
          setPinnedObjective(data.entityMemory.pinnedObjectiveKo);
        }
        if (data.pinnedObjectiveKo) {
          setPinnedObjective(data.pinnedObjectiveKo);
        }
        if (data.workspace) {
          workspaceRef.current = data.workspace;
          setWorkspace(data.workspace);
        }
        let nextPending = pendingRef.current;
        if (data.intentType === "cancel_pending") {
          nextPending = null;
        } else if (data.executionResult) {
          nextPending = null;
        } else if (data.conversationRoute?.mode === "READ_AND_ANSWER") {
          // Server is authoritative for read turns: echo unexecuted pending or null.
          nextPending =
            data.proposedAction ??
            data.entityMemory?.pendingProposedAction ??
            null;
        } else if (data.proposedAction) {
          nextPending = data.proposedAction;
        } else if (data.entityMemory?.pendingProposedAction) {
          nextPending = data.entityMemory.pendingProposedAction;
        } else if (data.intentType === "approve_pending") {
          nextPending = null;
        }
        pendingRef.current = nextPending;
        setPendingProposedAction(nextPending);

        const timelinePendingAction =
          data.intentType === "cancel_pending" || data.executionResult
            ? null
            : nextPending;
        const timelinePendingPlan =
          data.intentType === "cancel_pending" || data.executionResult
            ? null
            : data.plan ?? data.entityMemory?.pendingPlan ?? null;
        const nextTimeline =
          data.intentType === "cancel_pending" || data.executionResult
            ? buildMissionTimeline({
                entities: data.entityMemory ?? entityRef.current,
                workspace: data.workspace ?? workspaceRef.current,
                workingState: data.conversationState ?? null,
                pendingAction: null,
                pendingPlan: null,
              })
            : (data.missionTimeline ??
              buildMissionTimeline({
                entities: data.entityMemory ?? entityRef.current,
                workspace: data.workspace ?? workspaceRef.current,
                workingState: data.conversationState ?? null,
                pendingAction: timelinePendingAction,
                pendingPlan: timelinePendingPlan,
              }));
        missionRef.current = nextTimeline;
        setMissionTimeline(nextTimeline);

        setTurns((prev) => {
          const next = prev.map((t) =>
            t.id === id ? { ...t, isLoading: false, response: data } : t,
          );
          turnsRef.current = next;
          return next;
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === id && t.isLoading
              ? {
                  ...t,
                  isLoading: false,
                  error:
                    "응답 시간이 초과되었거나 생성이 중지되었습니다. 다시 시도해 주세요.",
                }
              : t,
          ),
        );
      } else {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                isLoading: false,
                error:
                  "에이전트에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
              }
            : t,
        ),
      );
      }
    } finally {
      window.clearTimeout(clientTimeout);
      if (activeTurnRef.current === id) {
        activeTurnRef.current = null;
        abortRef.current = null;
        setIsThinking(false);
        void syncToServer(true);
      }
    }
  }, [syncToServer]);

  const cancelPendingPlan = useCallback(() => {
    void sendQuery("취소");
  }, [sendQuery]);

  const resumeWhereLeftOff = useCallback(async () => {
    const memory = entityRef.current ?? loadEntityMemory();
    if (memory?.pendingProposedAction) {
      await sendQuery("이어서 진행해줘. 지금 승인하면 어떤 일이 일어나?");
      return;
    }
    if (memory?.pinnedObjectiveKo || memory?.previousRecommendation) {
      await sendQuery("이어서 하자. 다음 단계는?");
      return;
    }
    await sendQuery("오늘 무엇을 해야 하지?");
  }, [sendQuery]);

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
              error:
                "응답 생성을 중지했습니다. 같은 질문을 다시 시도할 수 있습니다.",
            }
          : turn,
      ),
    );
    setIsThinking(false);
    void syncToServer(true);
  }, [syncToServer]);

  const clearSession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeTurnRef.current = null;
    setTurns([]);
    setEntityMemory(null);
    setPendingProposedAction(null);
    setPinnedObjective(null);
    setWorkspace(null);
    setMissionTimeline(emptyMissionTimeline());
    setIsThinking(false);
    clearAgentPersistence();
    // New session adopts global default — clear per-chat override.
    clearAgentProviderSelection();
    providerSelectionRef.current = null;
    setProviderSelectionState(null);
    const sessionId = sessionIdRef.current ?? ensureClientSessionId();
    void resetAgentSessionClient(sessionId).then((record) => {
      if (record) {
        serverUpdatedAtRef.current = record.updatedAt;
        applyServerRecordToCache(record);
      }
    });
  }, []);

  const canResume =
    turns.length > 0 ||
    Boolean(
      entityMemory?.pinnedObjectiveKo ||
        entityMemory?.pendingProposedAction ||
        entityMemory?.previousRecommendation,
    ) ||
    hasResumableSession();

  return {
    turns,
    isThinking,
    sessionHydrated,
    sendQuery,
    stopResponse,
    clearSession,
    cancelPendingPlan,
    resumeWhereLeftOff,
    entityMemory,
    pendingProposedAction,
    pinnedObjective,
    workspace,
    missionTimeline,
    canResume,
    providerSelection,
    setProviderSelection,
  };
}

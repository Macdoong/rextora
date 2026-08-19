"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Pin, MessageSquare } from "lucide-react";
import type { ConversationEntityMemory } from "@/src/lib/rextora/agent/conversationContext";
import {
  LIFECYCLE_LABEL_KO,
  type PipelineLifecycleStage,
} from "@/src/lib/rextora/agent/lifecycleStage";
import { sanitizePrimaryUserText } from "@/src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";
import {
  MEMORY_KEY,
  WORKSPACE_KEY,
  requestOpenAssistant,
  type PersistedAgentWorkspace,
} from "./agentPersistence";

function readMemory(): ConversationEntityMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const hot = sessionStorage.getItem(MEMORY_KEY);
    if (hot) return JSON.parse(hot) as ConversationEntityMemory;
    const durable = localStorage.getItem(WORKSPACE_KEY);
    if (!durable) return null;
    const parsed = JSON.parse(durable) as PersistedAgentWorkspace;
    return parsed.entityMemory ?? null;
  } catch {
    return null;
  }
}

interface AgentContextStripProps {
  /** Current page label for context, e.g. "전략 탐색" */
  pageLabelKo: string;
}

/**
 * Lightweight working-session strip on lifecycle pages.
 * Opens the global AI assistant — same shared conversation session.
 */
export function AgentContextStrip({ pageLabelKo }: AgentContextStripProps) {
  const [memory, setMemory] = useState<ConversationEntityMemory | null>(null);

  useEffect(() => {
    const initialRead = window.setTimeout(() => setMemory(readMemory()), 0);
    const onStorage = (e: StorageEvent) => {
      if (e.key === MEMORY_KEY || e.key === WORKSPACE_KEY) {
        setMemory(readMemory());
      }
    };
    window.addEventListener("storage", onStorage);
    const t = window.setInterval(() => {
      const next = readMemory();
      setMemory((prev) => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(next);
        return prevJson === nextJson ? prev : next;
      });
    }, 2000);
    return () => {
      window.clearTimeout(initialRead);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, []);

  const objective =
    memory?.pinnedObjectiveKo ??
    memory?.previousRecommendation ??
    "AI 직원과 다음 단계를 이어서 확인하세요.";
  const pending = memory?.pendingProposedAction?.summary;
  const stage = memory?.pipelineStage ?? memory?.lifecycleStage;
  const stageLabel =
    stage && stage in LIFECYCLE_LABEL_KO
      ? LIFECYCLE_LABEL_KO[stage as PipelineLifecycleStage]
      : null;

  return (
    <div
      className="mb-4 flex flex-col gap-2 rounded-xl border border-emerald-500/20 bg-emerald-950/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      data-testid="agent-context-strip"
      aria-label="AI 트레이딩 직원 작업 컨텍스트"
    >
      <div className="min-w-0 flex items-start gap-2.5">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600/15 ring-1 ring-emerald-500/30">
          <BrainCircuit className="size-3.5 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-500">
            AI 직원 · {pageLabelKo}
            {stageLabel ? ` · ${stageLabel}` : ""}
          </p>
          <p className="mt-0.5 flex items-start gap-1.5 text-sm text-emerald-100/90">
            <Pin className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            <span className="leading-snug">
              {sanitizePrimaryUserText(objective)}
            </span>
          </p>
          {pending ? (
            <p className="mt-1 text-xs text-amber-200/90">
              승인 대기: {sanitizePrimaryUserText(pending)} · 엔진 자동 실행 없음
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          requestOpenAssistant({
            resume: Boolean(memory?.pendingProposedAction || memory?.pinnedObjectiveKo),
          })
        }
        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/35 px-3 py-1.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-900/40"
        data-testid="agent-context-strip-open"
      >
        <MessageSquare className="size-3.5" />
        이어서 대화
      </button>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { BrainCircuit, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { useAgentSession } from "./useAgentSession";
import { AgentInput } from "./AgentInput";
import { AgentSuggestions } from "./AgentSuggestions";
import { AgentMessage } from "./AgentMessage";

export function AgentPanel() {
  const { turns, isThinking, sendQuery, stopResponse, clearSession } =
    useAgentSession();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new turns
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [turns, isThinking]);

  const isEmpty = turns.length === 0;

  return (
    <section
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/70 shadow-xl"
      data-testid="dashboard-agent-workspace"
      aria-label="AI 트레이딩 연구원"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/30">
            <BrainCircuit className="size-4 text-violet-400" />
          </div>
          <div>
            <div className="text-base font-semibold text-slate-100">AI 트레이딩 연구원</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <Badge tone="success">읽기 전용</Badge>
              <span className="text-xs text-slate-400">
                조사·분석·설명만 수행하며 실행은 직접 승인 후 진행됩니다.
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={clearSession}
          disabled={isEmpty && !isThinking}
          aria-label="새 대화"
          className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="size-4" />
          <span className="hidden sm:inline">새 대화</span>
        </button>
      </div>

      {/* Conversation area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ minHeight: "16rem", maxHeight: "38rem" }}
        aria-live="polite"
        aria-label="에이전트 대화"
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 py-8 text-center">
            <div className="space-y-2">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-violet-600/10 ring-1 ring-violet-500/20">
                <BrainCircuit className="size-7 text-violet-400/70" />
              </div>
              <p className="text-sm font-medium text-slate-300">무엇을 도와드릴까요?</p>
              <p className="text-xs text-slate-500">
                탐색 상태, 백테스트 결과, 전략 설명, 리스크 현황 등을 물어보세요.
              </p>
            </div>
            <AgentSuggestions onSelect={sendQuery} disabled={isThinking} />
          </div>
        ) : (
          <div className="space-y-6">
            {turns.map((turn) => (
              <AgentMessage
                key={turn.id}
                query={turn.query}
                response={turn.response}
                error={turn.error}
                isLoading={turn.isLoading}
                onRetry={() => sendQuery(turn.query)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-slate-800/60 px-4 py-3 space-y-2">
        <AgentInput
          onSend={sendQuery}
          onStop={stopResponse}
          disabled={isThinking}
          disabledReason={isThinking ? "저장된 데이터를 확인해 답변을 준비하고 있습니다." : undefined}
        />
        <p className="text-center text-xs text-slate-500">
          AI 분석은 실제 데이터 기반이지만, 투자 결정은 반드시 직접 검토 후 승인하세요.
        </p>
      </div>
    </section>
  );
}

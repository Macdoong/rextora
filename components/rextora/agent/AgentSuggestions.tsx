"use client";

import { analytics } from "./agentAnalytics";

interface AgentSuggestionsProps {
  onSelect: (query: string) => void;
  disabled?: boolean;
}

const SUGGESTIONS = [
  "오늘 뭘 해야 해?",
  "이어서 하자",
  "연구 현황 알려줘",
  "BTC 탐색 계획 준비해",
  "왜 기다리는 거야?",
  "지금 승인하면 어떤 일이 일어나?",
] as const;

export function AgentSuggestions({ onSelect, disabled = false }: AgentSuggestionsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2" role="list" aria-label="빠른 질문">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          role="listitem"
          onClick={() => {
            analytics.suggestionClicked(s);
            onSelect(s);
          }}
          disabled={disabled}
          className="min-h-11 rounded-full border border-slate-700/70 bg-slate-800/50 px-3.5 py-2 text-sm text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

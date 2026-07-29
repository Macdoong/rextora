"use client";

import { analytics } from "./agentAnalytics";

interface AgentSuggestionsProps {
  onSelect: (query: string) => void;
  disabled?: boolean;
}

const SUGGESTIONS = [
  "현재 탐색 상태 알려줘",
  "최근 백테스트 결과 요약해줘",
  "SAFE 전략 설명해줘",
  "BTC와 ETH 전략 비교해줘",
  "Paper 시작해줘",
  "실패한 탐색 원인 설명해줘",
  "다음에 뭘 해야 하지?",
] as const;

export function AgentSuggestions({ onSelect, disabled = false }: AgentSuggestionsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="list" aria-label="빠른 질문">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          role="listitem"
          onClick={() => { analytics.suggestionClicked(s); onSelect(s); }}
          disabled={disabled}
          className="min-h-11 rounded-full border border-slate-700/70 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 transition hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

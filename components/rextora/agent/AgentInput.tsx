"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SendHorizontal, Square } from "lucide-react";

interface AgentInputProps {
  onSend: (query: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  onStop?: () => void;
  placeholder?: string;
}

export function AgentInput({
  onSend,
  disabled = false,
  disabledReason,
  onStop,
  placeholder = "무엇이 궁금하신가요? 탐색 상태, 백테스트 결과, 전략 설명 등을 물어보세요.",
}: AgentInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const syncFromDom = () => {
      setValue(ta.value);
    };
    ta.addEventListener("input", syncFromDom);
    return () => ta.removeEventListener("input", syncFromDom);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = (textareaRef.current?.value ?? value).trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      // Auto-resize
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
      }
    },
    [],
  );

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div>
      <div className="flex items-end gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 p-2 transition focus-within:border-violet-500/60 focus-within:bg-slate-900/80">
        <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        data-testid="agent-input-textarea"
        className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
        aria-label="에이전트에게 질문"
        aria-describedby={disabled && disabledReason ? "agent-input-disabled-reason" : undefined}
      />
      <button
        onClick={disabled && onStop ? onStop : handleSend}
        disabled={disabled ? !onStop : !canSend}
        aria-label={disabled ? "응답 중지" : "전송"}
        data-testid="agent-input-send"
        className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-white transition ${
          disabled
            ? "border border-slate-600 bg-slate-800 hover:bg-slate-700"
            : "bg-violet-600 hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        }`}
      >
        {disabled ? (
          <Square className="size-4 fill-current" />
        ) : (
          <SendHorizontal className="size-4" />
        )}
      </button>
      </div>
      {disabled && disabledReason ? (
        <p id="agent-input-disabled-reason" className="rextora-helper mt-1.5 px-1">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}

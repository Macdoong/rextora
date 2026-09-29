"use client";

import { ChevronRight, MessageSquare } from "lucide-react";
import { requestOpenAssistant } from "@/components/rextora/agent/agentPersistence";

export function CompletedAskAiAction() {
  return (
    <div className="ss-completed-ask-ai" data-testid="ss-completed-ask-ai">
      <button
        type="button"
        className="ss-completed-ask-ai__button"
        data-testid="ss-completed-ask-ai-button"
        onClick={() => requestOpenAssistant({ resume: true })}
      >
        <MessageSquare className="ss-completed-ask-ai__icon" aria-hidden />
        AI에게 이 결과 질문하기
        <ChevronRight className="ss-completed-ask-ai__chevron" aria-hidden />
      </button>
    </div>
  );
}

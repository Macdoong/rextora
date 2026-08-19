import type { ConversationEntityMemory } from "../../conversationContext";
import type { AgentTurn } from "../../types";
import type {
  ResolvedConversationReference,
  SelectedUiObject,
} from "./conversationTypes";

const DEICTIC_RE =
  /(?:이건|이거|이게|그건|그거|그게|저건|저거|그\s*전략|아까\s*(?:거|것|계획)|방금\s*(?:말한|그))/i;

export function hasDeicticReference(query: string): boolean {
  return DEICTIC_RE.test(query.trim());
}

function explicitReference(query: string): ResolvedConversationReference | null {
  if (/(?:렉스토라|rextora)|앱\s*자체/i.test(query)) {
    return {
      kind: "product",
      labelKo: "렉스토라 앱",
      id: null,
      source: "explicit_turn",
      confidence: 1,
    };
  }
  if (/백테스트/i.test(query)) {
    return {
      kind: "feature",
      labelKo: "백테스트",
      id: null,
      source: "explicit_turn",
      confidence: 0.98,
    };
  }
  if (/모의매매|페이퍼|paper/i.test(query)) {
    return {
      kind: "feature",
      labelKo: "모의매매",
      id: null,
      source: "explicit_turn",
      confidence: 0.98,
    };
  }
  return null;
}

export function resolveConversationReference(input: {
  query: string;
  history: AgentTurn[];
  entities: ConversationEntityMemory;
  selectedUiObject?: SelectedUiObject | null;
}): ResolvedConversationReference | null {
  const explicit = explicitReference(input.query);
  if (explicit) return explicit;
  if (!hasDeicticReference(input.query)) return null;

  if (input.selectedUiObject) {
    return {
      kind: input.selectedUiObject.kind,
      labelKo: input.selectedUiObject.labelKo,
      id: input.selectedUiObject.id ?? null,
      source: "selected_ui_object",
      confidence: 0.9,
    };
  }

  // Explicit object nouns constrain the candidate type. Do not resolve a
  // "card" to an old product explanation or "the strategy" to a backtest.
  if (/카드/.test(input.query)) {
    if (input.entities.pendingProposedAction) {
      return {
        kind: "approval",
        labelKo: input.entities.pendingProposedAction.summary,
        id: input.entities.pendingProposedAction.actionId,
        source: "workflow_state",
        confidence: 0.58,
      };
    }
    return null;
  }
  if (/그\s*전략/.test(input.query)) {
    if (input.entities.strategyId) {
      return {
        kind: "strategy",
        labelKo: input.entities.strategyLabel ?? "현재 선택된 전략",
        id: input.entities.strategyId,
        source: "workspace_object",
        confidence: 0.76,
      };
    }
    return null;
  }

  const recentAssistant = [...input.history]
    .reverse()
    .find((turn) => turn.role === "agent");
  if (/^왜\s*그/i.test(input.query.trim()) && recentAssistant) {
    if (
      /(?:모의매매|다음|권장|우선|단계|백테스트|탐색|점검)/.test(
        recentAssistant.content,
      )
    ) {
      return {
        kind: "product",
        labelKo: "직전 추천 단계",
        id: null,
        source: "recent_assistant_turn",
        confidence: 0.85,
      };
    }
  }

  if (recentAssistant) {
    if (/렉스토라|AI\s*트레이딩\s*직원/.test(recentAssistant.content)) {
      return {
        kind: "product",
        labelKo: "렉스토라 앱",
        id: null,
        source: "recent_assistant_turn",
        confidence: 0.82,
      };
    }
    if (/백테스트/.test(recentAssistant.content)) {
      return {
        kind: "backtest",
        labelKo: "방금 설명한 백테스트",
        id: input.entities.runId,
        source: "recent_assistant_turn",
        confidence: 0.78,
      };
    }
  }

  // Workflow objects are intentionally last: active state is background context.
  if (input.entities.pendingProposedAction) {
    return {
      kind: "approval",
      labelKo: input.entities.pendingProposedAction.summary,
      id: input.entities.pendingProposedAction.actionId,
      source: "workflow_state",
      confidence: 0.58,
    };
  }
  return null;
}


import { isSimplificationFollowUp } from "./conversationContext";
import { stableDomainAnswer, type StableDomainAnswer } from "./productKnowledge";
import type {
  ConversationRouteDecision,
  ResolvedConversationReference,
} from "./conversationTypes";

function approvalAnswer(): StableDomainAnswer {
  return {
    conclusionKo:
      "승인은 렉스토라가 상태를 바꾸는 작업을 사용자의 판단 없이 실행하지 못하게 하는 안전장치입니다.",
    explanationKo:
      "조회와 설명은 바로 할 수 있지만, 탐색 시작·취소, 백테스트 실행, 모의매매 준비처럼 기록이나 상태를 바꾸는 일은 계획을 먼저 보여 드립니다. 승인된 계획은 같은 승인으로 한 번만 실행됩니다.",
    recommendedActionKo: null,
  };
}

function backtestPaperComparison(): StableDomainAnswer {
  return {
    conclusionKo:
      "백테스트는 과거 데이터를 재생해 전략을 검증하고, 모의매매는 실제 주문 없이 앞으로 들어오는 흐름에서 전략을 관찰합니다.",
    explanationKo:
      "백테스트는 다양한 과거 구간을 빠르게 확인하는 데 유리하고, 모의매매는 신호 생성과 운영 흐름이 현재 환경에서도 안정적인지 보는 데 유리합니다. 둘 다 실제 수익을 보장하지 않습니다.",
    recommendedActionKo: null,
  };
}

function referenceAnswer(
  reference: ResolvedConversationReference,
): StableDomainAnswer {
  if (reference.kind === "product") {
    return stableDomainAnswer("rextora_product")!;
  }
  if (reference.kind === "approval") {
    return {
      conclusionKo: `‘${reference.labelKo}’는 실행 전에 검토하는 승인 카드입니다.`,
      explanationKo:
        "승인하기 전에는 상태 변경이 일어나지 않습니다. 카드의 대상과 조건이 맞는지 확인한 뒤 승인하거나 취소할 수 있습니다.",
      recommendedActionKo: null,
    };
  }
  return {
    conclusionKo: `말씀하신 대상은 ‘${reference.labelKo}’입니다.`,
    explanationKo:
      "현재 대화에서 확인된 대상을 기준으로 설명했습니다. 다른 항목을 뜻했다면 이름이나 화면 위치를 알려 주세요.",
    recommendedActionKo: null,
  };
}

export type ExecutionReportEvidence = {
  summaryKo: string;
  jobId?: string | null;
  runId?: string | null;
  ok?: boolean;
  executedAt?: string | null;
  stepToolIds?: string[];
};

export function deterministicConversationAnswer(input: {
  query: string;
  route: ConversationRouteDecision;
  /** When set, execution_report answers from persisted receipt — never invent. */
  latestExecution?: ExecutionReportEvidence | null;
}): StableDomainAnswer | null {
  if (input.route.mode === "CLARIFY_REFERENCE") {
    return {
      conclusionKo:
        input.route.clarificationQuestionKo ??
        "어떤 대상을 말씀하시는지 조금만 더 알려 주세요.",
      explanationKo: "",
      recommendedActionKo: null,
    };
  }
  if (input.route.mode === "SAFE_REFUSAL") {
    if (input.route.answerIntent === "secret_exposure_refusal") {
      return {
        conclusionKo:
          "API 키나 비밀값은 보여 드릴 수 없습니다.",
        explanationKo:
          "자격 증명은 대화와 로그에 노출하지 않고, 연결 상태만 안전하게 확인할 수 있습니다.",
        recommendedActionKo: null,
      };
    }
    if (input.route.answerIntent === "safe_mutation_refusal") {
      return {
        conclusionKo:
          "그 식별값은 폐기되어 현재 전략으로 사용할 수 없습니다.",
        explanationKo:
          "과거 기준 전략 기록은 유지될 수 있지만, 더 이상 선택된 전략이나 수정 대상이 아닙니다.",
        recommendedActionKo: null,
      };
    }
    return {
      conclusionKo:
        "실전매매 활성화나 실제 거래소 주문은 대화형 에이전트가 실행할 수 없습니다.",
      explanationKo:
        "렉스토라는 연구, 백테스트, 모의매매 준비와 설명까지만 지원하며 실제 자금 작업은 별도 정책과 승인 경계를 통과해야 합니다.",
      recommendedActionKo: null,
    };
  }
  if (
    input.route.topic === "feature_paper" &&
    /(?:백테스트|그럼).*(?:차이)|(?:차이).*(?:백테스트|모의매매)/i.test(
      input.query,
    )
  ) {
    return backtestPaperComparison();
  }
  if (input.route.answerIntent === "approval_concept") return approvalAnswer();
  if (input.route.answerIntent === "execution_report") {
    const exec = input.latestExecution;
    if (exec?.summaryKo?.trim()) {
      const refs = [
        exec.jobId ? `작업 ${exec.jobId}` : null,
        exec.runId ? `실행 ${exec.runId}` : null,
      ].filter(Boolean);
      return {
        conclusionKo: exec.summaryKo.trim(),
        explanationKo: refs.length
          ? `방금 승인 후 실제로 반영된 결과입니다. (${refs.join(" · ")})`
          : "방금 승인 후 실제로 반영된 결과입니다. 새 작업은 만들지 않았습니다.",
        recommendedActionKo: null,
      };
    }
    return {
      conclusionKo:
        "방금 저는 대화로만 응답했습니다. 외부 도구 호출이나 실제 주문·시스템 변경은 없었습니다.",
      explanationKo:
        "설명·조회·권장만 했으며, 상태를 바꾸는 작업은 승인 없이 실행하지 않습니다.",
      recommendedActionKo: null,
    };
  }
  if (
    input.route.answerIntent === "resolved_reference_answer" &&
    input.route.resolvedReference
  ) {
    return referenceAnswer(input.route.resolvedReference);
  }
  return stableDomainAnswer(input.route.topic, {
    simpler: isSimplificationFollowUp(input.query),
  });
}

export function safeConversationalFallback(
  query: string,
  route: ConversationRouteDecision,
): StableDomainAnswer {
  const deterministic = deterministicConversationAnswer({ query, route });
  if (deterministic) return deterministic;
  if (route.mode === "READ_AND_ANSWER") {
    return {
      conclusionKo:
        "현재 저장된 정보를 확인했지만, 이 질문에 답할 충분한 근거를 찾지 못했습니다.",
      explanationKo:
        "확인할 전략, 탐색 작업, 백테스트 또는 모의매매 대상을 지정해 주시면 실제 기록을 기준으로 다시 설명하겠습니다.",
      recommendedActionKo: null,
    };
  }
  if (route.mode === "PLAN_AND_APPROVE") {
    return {
      conclusionKo:
        "요청한 작업의 대상과 조건을 확정해야 계획을 만들 수 있습니다.",
      explanationKo:
        "대상 전략이나 탐색 조건을 조금 더 구체적으로 알려 주세요. 확인 전에는 실행하거나 승인을 만들지 않습니다.",
      recommendedActionKo: null,
    };
  }
  return {
    conclusionKo:
      "질문의 뜻을 정확히 이해하지 못했습니다.",
    explanationKo:
      "렉스토라 기능, 거래 개념, 현재 작업 상태 중 어떤 내용을 알고 싶은지 한 문장으로 알려 주세요.",
    recommendedActionKo: null,
  };
}


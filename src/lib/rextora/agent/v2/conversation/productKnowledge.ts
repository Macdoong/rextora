import type { ConversationTopic } from "./conversationTypes";

export interface StableDomainAnswer {
  conclusionKo: string;
  explanationKo: string;
  recommendedActionKo: string | null;
}

const ANSWERS: Partial<Record<ConversationTopic, StableDomainAnswer>> = {
  rextora_product: {
    conclusionKo:
      "렉스토라는 자동으로 주문을 내는 봇이 아니라, 전략을 찾고 검증해서 사람이 더 좋은 판단을 하도록 돕는 AI 트레이딩 직원입니다.",
    explanationKo:
      "시장 연구와 전략 탐색, 백테스트, 모의매매 준비, 결과 설명을 맡습니다. 상태를 바꾸는 작업은 먼저 계획을 보여 주고 승인을 받은 뒤 한 번만 실행하며, 실전매매는 별도 안전 게이트 없이 시작하지 않습니다.",
    recommendedActionKo: null,
  },
  feature_search: {
    conclusionKo:
      "전략 탐색은 여러 규칙과 설정을 실제 과거 데이터에 적용해 검토할 후보를 찾는 단계입니다.",
    explanationKo:
      "탐색 결과는 아직 채택된 전략이 아닙니다. 결과 등록과 백테스트 검토를 거쳐야 하며, 새 탐색이나 취소처럼 상태를 바꾸는 작업은 승인 후 실행됩니다.",
    recommendedActionKo: null,
  },
  feature_results: {
    conclusionKo:
      "결과 화면은 탐색에서 나온 후보를 비교하고, 실제 검증 대상으로 등록할지 판단하는 곳입니다.",
    explanationKo:
      "후보의 출처와 설정을 확인한 뒤 등록해야 백테스트와 후속 검토로 이어집니다. 탐색 점수만으로 우수하다고 단정하지 않습니다.",
    recommendedActionKo: null,
  },
  feature_backtest: {
    conclusionKo:
      "백테스트는 정해진 전략을 과거 시장 데이터에 적용해 어떤 거래가 발생했는지 재현하는 검증 과정입니다.",
    explanationKo:
      "수익률뿐 아니라 거래 수, 최대 낙폭, 수수료와 슬리피지, 여러 기간에서의 일관성을 함께 봐야 합니다. 과거 결과가 미래 수익을 보장하지는 않습니다.",
    recommendedActionKo: null,
  },
  feature_paper: {
    conclusionKo:
      "모의매매는 실제 자금을 쓰지 않고 승인된 전략을 현재 흐름에서 관찰하는 단계입니다.",
    explanationKo:
      "백테스트가 과거 데이터를 재생한다면, 모의매매는 실제 주문 없이 앞으로 들어오는 흐름을 시뮬레이션합니다. 렉스토라의 모의매매는 거래소 주문을 호출하지 않습니다.",
    recommendedActionKo: null,
  },
  feature_live: {
    conclusionKo:
      "실전매매는 실제 자금과 주문이 연결되는 별도 단계이며, 렉스토라 에이전트가 대화만으로 활성화할 수 없습니다.",
    explanationKo:
      "백테스트와 모의매매 증거, 정책 검토, 명시적 사람의 승인이 모두 필요합니다. 현재 대화형 에이전트에는 실주문 도구가 없습니다.",
    recommendedActionKo: null,
  },
  concept_mdd: {
    conclusionKo:
      "MDD는 자산이 이전 최고점에서 가장 크게 떨어진 폭입니다.",
    explanationKo:
      "수익률이 높아도 MDD가 너무 크면 실제 운용 중 버티기 어렵고, 손실 회복에도 더 큰 수익이 필요합니다. 그래서 수익률과 함께 위험의 크기를 보는 핵심 지표입니다.",
    recommendedActionKo: null,
  },
  concept_overfitting: {
    conclusionKo:
      "과적합은 전략이 시장의 반복 가능한 특징보다 특정 과거 구간의 우연에 지나치게 맞춰진 상태입니다.",
    explanationKo:
      "표본 밖 기간, 여러 시장 구간, 비용 반영 결과가 크게 나빠지면 의심해야 합니다. 복잡한 규칙과 지나친 파라미터 조정도 위험 신호입니다.",
    recommendedActionKo: null,
  },
  concept_costs: {
    conclusionKo:
      "수수료와 슬리피지는 체결할 때마다 전략 수익을 줄이는 실제 비용입니다.",
    explanationKo:
      "거래가 잦거나 기대 수익이 작은 전략은 비용 반영 전에는 좋아 보여도 실제 검증에서 무너질 수 있습니다. 백테스트에는 비용 가정을 명시적으로 포함해야 합니다.",
    recommendedActionKo: null,
  },
  concept_order_block: {
    conclusionKo:
      "오더블럭은 강한 가격 이동이 시작되기 직전의 수급 집중 구간을 후보 영역으로 보는 패턴입니다.",
    explanationKo:
      "렉스토라는 캔들 몸통 기반 구간과 후속 충격, 재진입 깊이, 무효화 규칙을 함께 검증합니다. 표시된 영역만으로 거래 가능하다고 단정하지 않습니다.",
    recommendedActionKo: null,
  },
  concept_fvg: {
    conclusionKo:
      "가격 불균형은 빠른 움직임 때문에 인접한 캔들 사이에 거래가 충분히 겹치지 않은 구간입니다.",
    explanationKo:
      "가격이 나중에 그 구간을 다시 확인할 수 있지만 반드시 채워진다는 뜻은 아닙니다. 다른 구조와 검증 규칙을 함께 사용해야 합니다.",
    recommendedActionKo: null,
  },
};

export function stableDomainAnswer(
  topic: ConversationTopic,
  options?: { simpler?: boolean },
): StableDomainAnswer | null {
  const answer = ANSWERS[topic];
  if (!answer) return null;
  if (topic === "rextora_product" && options?.simpler) {
    return {
      conclusionKo:
        "쉽게 말하면, 렉스토라는 투자 아이디어를 대신 조사하고 시험해 주는 AI 직원입니다.",
      explanationKo:
        "좋아 보이는 전략을 찾고 과거 데이터와 모의매매로 확인한 뒤, 근거를 보여 줍니다. 실제로 상태를 바꾸는 일은 먼저 승인을 받습니다.",
      recommendedActionKo: null,
    };
  }
  return answer;
}


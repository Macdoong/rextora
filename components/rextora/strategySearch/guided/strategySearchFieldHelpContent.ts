export type StrategySearchFieldHelpEntry = {
  title: string;
  what: string;
  impact: string;
  how: string;
  example?: string;
};

export const STRATEGY_SEARCH_FIELD_HELP: Record<
  string,
  StrategySearchFieldHelpEntry
> = {
  minTotalReturn: {
    title: "최소 수익률",
    what: "후보 전략이 통과해야 하는 최소 누적 수익률입니다.",
    impact: "값을 높이면 통과 후보가 줄고 탐색이 더 오래 걸릴 수 있습니다.",
    how: "목표 기준 탐색에서는 필수 조건으로 사용됩니다.",
    example: "예: 5 = 5%",
  },
  maxMdd: {
    title: "최대 낙폭",
    what: "허용할 수 있는 최대 낙폭(드로다운) 한도입니다.",
    impact: "값을 낮추면 보수적인 후보만 남고 탐색 범위가 좁아집니다.",
    how: "프리셋 또는 직접 입력으로 설정합니다.",
  },
  minTradeCount: {
    title: "최소 거래수",
    what: "통계적으로 의미 있으려면 필요한 최소 거래 횟수입니다.",
    impact: "값을 높이면 표본이 부족한 전략을 걸러냅니다.",
    how: "분석 기간과 타임프레임에 맞게 설정하세요.",
    example: "예: 10회",
  },
  minWinRate: {
    title: "최소 승률",
    what: "선택적 추가 조건입니다. 승률 하한을 둡니다.",
    impact: "설정하면 승률이 낮은 후보는 목표 조건을 통과하지 못합니다.",
    how: "비우면 승률 제한 없이 탐색합니다.",
  },
  minScore: {
    title: "최소 점수",
    what: "선택적 추가 조건입니다. 연구 점수 하한을 둡니다.",
    impact: "점수가 낮은 후보를 제외해 추천 품질을 높입니다.",
    how: "비우면 점수 제한 없이 탐색합니다.",
  },
  depthProfile: {
    title: "탐색 수준",
    what: "한 번에 평가할 후보 깊이와 탐색 범위의 균형입니다.",
    impact: "깊을수록 더 많은 조합을 시도하지만 시간이 늘 수 있습니다.",
    how: "처음에는 균형형을 권장합니다.",
  },
  tradingStyle: {
    title: "탐색 프리셋",
    what: "수익·안정·공격 성향에 맞춘 기본 합격 기준 묶음입니다.",
    impact: "프리셋에 따라 낙폭·거래수·수익률 기준이 함께 바뀝니다.",
    how: "목표에 가장 가까운 프리셋을 고르세요.",
  },
  feeRate: {
    title: "수수료",
    what: "백테스트·검증에 적용할 거래 수수료율입니다.",
    impact: "높을수록 비용을 반영한 보수적 결과가 나옵니다.",
    how: "거래소 수수료에 맞게 입력하세요.",
  },
  slippageRate: {
    title: "슬리피지",
    what: "체결 가격이 불리하게 움직였다고 가정하는 비율입니다.",
    impact: "높을수록 실전에 가까운 보수적 평가가 됩니다.",
    how: "시장·주문 방식에 맞게 조정하세요.",
  },
  stressEnabled: {
    title: "보수적 비용 검증",
    what: "수수료·슬리피지를 높여 전략을 한 번 더 검증합니다.",
    impact: "켜면 통과 후보는 줄지만 실전 내성이 높아집니다.",
    how: "실전 전환 전에는 켜 두는 것을 권장합니다.",
  },
  leverageMode: {
    title: "레버리지",
    what: "후보 전략에 적용할 레버리지 탐색 방식입니다.",
    impact: "레버리지는 수익과 손실을 함께 확대합니다.",
    how: "불확실하면 자동 추천 또는 사용 안 함을 고려하세요.",
  },
  researchBasis: {
    title: "탐색 기준",
    what: "후보를 비교할 때 우선하는 연구 기준 축입니다.",
    impact: "기준에 따라 같은 후보도 순위·추천 우선순위 해석이 달라질 수 있습니다.",
    how: "목표에 맞는 기준을 선택하세요. 확실하지 않으면 균형형을 유지합니다.",
  },
  candidateBudgetOverride: {
    title: "초기 평가 묶음",
    what: "한 번에 생성·평가할 후보 묶음 크기입니다. 탐색 종료 조건이 아닙니다.",
    impact: "값을 키우면 한 사이클당 더 많은 후보를 보지만 응답이 느려질 수 있습니다.",
    how: "비우면 탐색 수준 기본값을 사용합니다.",
  },
  jitterEnabled: {
    title: "안정성 검증 (파라미터 변동)",
    what: "입력 파라미터를 약간 흔들어 전략이 비슷한 조건에서도 버티는지 봅니다.",
    impact: "켜면 통과 후보가 줄지만 과적합 위험을 줄입니다.",
    how: "실전 전환 전에는 켜 두는 것을 권장합니다.",
  },
  comboFailurePolicy: {
    title: "실패 정책",
    what: "복합 패턴에서 블록 실패가 전체 조건 실패로 이어지는 규칙입니다.",
    impact: "엄격할수록 통과 후보가 줄고 조건 충족이 더 어렵습니다.",
    how: "ALL은 가장 엄격, ANY는 가장 느슨합니다.",
  },
  patternCombinationWeightedThreshold: {
    title: "가중 점수 임계값",
    what: "가중 점수 조합에서 블록 점수 합이 넘어야 하는 하한입니다.",
    impact: "값을 높이면 더 많은 패턴 증거가 필요합니다.",
    how: "WEIGHTED SCORE 조합일 때만 적용됩니다.",
  },
  orderBlockZoneBasis: {
    title: "오더블럭 존 기준",
    what: "차트·검증에 쓰는 오더블럭 영역을 몸통 기준으로 할지, wick 포함 비율로 할지 정합니다.",
    impact: "엔진이 그리는 존과 합격 판정이 이 기준과 일치해야 합니다.",
    how: "기본은 몸통 기준입니다. wick 확장은 더 넓은 존을 만듭니다.",
  },
};

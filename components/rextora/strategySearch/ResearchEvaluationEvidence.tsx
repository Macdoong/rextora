"use client";

import {
  costChannelDisclosure,
  evaluationProvenanceLabel,
  rankingGroupTechnicalId,
  truncateEvaluationHash,
  type EvaluationProvenanceStatus,
  type ResearchCostProvenanceView,
} from "@/src/lib/rextora/researchRankingReadModel";

export function ResearchEvaluationEvidence(props: {
  researchEvaluationHash?: string | null;
  engineCostModel?: string | null;
  rankingCompatibilityGroup?: string | null;
  identityVersion?: string | null;
  provenanceStatus?: EvaluationProvenanceStatus | null;
  cost?: ResearchCostProvenanceView | null;
}) {
  const hash = props.researchEvaluationHash ?? null;
  const provenance = evaluationProvenanceLabel(props.provenanceStatus);
  const funding = costChannelDisclosure(props.cost?.funding ?? null);
  const spread = costChannelDisclosure(props.cost?.spread ?? null);
  const fee = costChannelDisclosure(props.cost?.fee ?? null);
  const slippage = costChannelDisclosure(props.cost?.slippage ?? null);
  return (
    <dl
      className="min-w-0 space-y-1 text-xs text-slate-400"
      data-testid="research-evaluation-evidence"
    >
      <div className="flex min-w-0 flex-wrap gap-x-2">
        <dt>평가 해시</dt>
        <dd
          className="min-w-0 break-all font-mono text-slate-300"
          title={hash ?? undefined}
          data-testid="research-evaluation-hash"
        >
          {truncateEvaluationHash(hash)}
        </dd>
      </div>
      <div className="flex min-w-0 flex-wrap gap-x-2">
        <dt>엔진</dt>
        <dd data-testid="research-engine-cost-model">
          {props.engineCostModel ?? rankingGroupTechnicalId(props.rankingCompatibilityGroup)}
        </dd>
      </div>
      <div className="flex min-w-0 flex-wrap gap-x-2">
        <dt>그룹</dt>
        <dd data-testid="research-ranking-group-id">
          {rankingGroupTechnicalId(props.rankingCompatibilityGroup)}
        </dd>
      </div>
      {props.identityVersion ? (
        <div className="flex min-w-0 flex-wrap gap-x-2">
          <dt>버전</dt>
          <dd>{props.identityVersion}</dd>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-wrap gap-x-2">
        <dt>증빙</dt>
        <dd data-testid="research-provenance-status">{provenance}</dd>
      </div>
      {props.cost ? (
        <div className="min-w-0 space-y-0.5" data-testid="research-cost-provenance">
          <p>
            수수료 {fee.applied ? "적용" : "미적용"}
            {fee.configured ? ` · 설정 ${fee.configuredRate}` : ""}
          </p>
          <p>
            슬리피지 {slippage.applied ? "적용" : "미적용"}
            {slippage.configured ? ` · 설정 ${slippage.configuredRate}` : ""}
          </p>
          <p data-testid="research-funding-disclosure">
            펀딩 설정 {funding.configured ? "예" : "아니오"} · 적용{" "}
            {funding.applied ? "예" : "아니오"}
          </p>
          <p data-testid="research-spread-disclosure">
            스프레드 설정 {spread.configured ? "예" : "아니오"} · 적용{" "}
            {spread.applied ? "예" : "아니오"}
          </p>
          <p>
            비용 가드{" "}
            {props.cost.costGuard?.engineApplied ? "적용" : "미적용"}
          </p>
        </div>
      ) : null}
    </dl>
  );
}

"use client";

import {
  ChevronRight,
  Clock3,
  Layers,
  SearchCheck,
  Settings2,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { StrategySearchOperatorFormState } from "../formDefaults";
import { formatTimeframeCustomerKo } from "../customerTimeframeKo";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { Step5DirectionGraphic } from "./Step5DirectionGraphic";
import { Step5DurationPresetRail } from "./Step5DurationPresetRail";
import { Step5StrategyNodeCluster } from "./Step5StrategyNodeCluster";
import { buildStep5LaunchRowMap } from "./step5LaunchFlowModel";
import { step5SearchObjectiveLabel } from "./step5ReviewPresentation";
import { step5StoredRateDisplay } from "./step5RateReviewDisplay";
import {
  step5ObjectiveModePillKo,
  step5PatternDirectionKind,
  step5StrategyFamilyNodeCount,
} from "./step5VisualShared";

export function Step5LaunchPipelineVisual(props: {
  form: StrategySearchOperatorFormState;
  combinationSentence: string;
}) {
  const { form } = props;
  const { rowMap, targetMode } = buildStep5LaunchRowMap(form);
  const mode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  const familyCount = step5StrategyFamilyNodeCount(form);
  const direction = step5PatternDirectionKind(form);
  const combo = rowMap.get("선택 전략군") ?? props.combinationSentence ?? "—";
  const leverage = rowMap.get("레버리지") ?? "—";
  const stress = (rowMap.get("비용 검증") ?? "—").replace(/^비용 검증:\s*/, "");
  const jitter = (rowMap.get("파라미터 재확인") ?? "—").replace(/^파라미터 재확인:\s*/, "");
  const fee = step5StoredRateDisplay(form.feeRate);
  const slippage = step5StoredRateDisplay(form.slippageRate);
  const objectivePill = step5ObjectiveModePillKo(form);
  const symbol = form.symbol || rowMap.get("코인") || "—";
  const timeframe = formatTimeframeCustomerKo(form.timeframe);
  const period = rowMap.get("분석 기간") ?? "—";
  const depth = rowMap.get("탐색 깊이") ?? "—";

  const nodes: Array<{
    id: "market" | "search" | "strategy" | "validation" | "ready";
    titleKo: string;
    Icon: typeof Target;
  }> = [
    { id: "market", titleKo: "분석 대상", Icon: Target },
    { id: "search", titleKo: "탐색 방식", Icon: Settings2 },
    { id: "strategy", titleKo: "전략 구성", Icon: Layers },
    { id: "validation", titleKo: "검증 · 위험", Icon: ShieldCheck },
    { id: "ready", titleKo: "실행", Icon: SearchCheck },
  ];

  return (
    <div
      className="ss-step5-launch-flow ss-step5-launch-flow--pipeline ss-step5-launch-flow--enter"
      data-testid="ss-step5-launch-flow"
      role="list"
      aria-label="탐색 구성 파이프라인"
    >
      {nodes.map((meta, index) => {
        const isLast = index === nodes.length - 1;
        const Icon = meta.Icon;
        return (
          <div
            key={meta.id}
            className="ss-step5-launch-flow__segment"
            role="listitem"
            data-flow-node={meta.id}
            style={{ ["--flow-i" as string]: index }}
          >
            {!isLast ? (
              <span className="ss-step5-launch-flow__connector" aria-hidden="true" />
            ) : null}
            <article className="ss-step5-launch-flow__node">
              <span className="ss-step5-launch-flow__node-icon-wrap" aria-hidden="true">
                <Icon className="ss-step5-launch-flow__node-icon" strokeWidth={2} />
              </span>
              <div className="ss-step5-launch-flow__node-body">
                <h4 className="ss-step5-launch-flow__node-title">{meta.titleKo}</h4>
                {meta.id === "market" ? (
                  <MarketNodeBody symbol={symbol} timeframe={timeframe} period={period} />
                ) : null}
                {meta.id === "search" ? (
                  <SearchNodeBody
                    form={form}
                    objectivePill={objectivePill}
                    objectiveLabel={step5SearchObjectiveLabel(form)}
                    depth={depth}
                    showDurationRail={mode === "automatic"}
                  />
                ) : null}
                {meta.id === "strategy" ? (
                  <StrategyNodeBody
                    familyCount={familyCount}
                    combo={combo}
                    direction={direction}
                  />
                ) : null}
                {meta.id === "validation" ? (
                  <ValidationNodeBody
                    targetMode={targetMode}
                    leverage={leverage}
                    stress={stress}
                    jitter={jitter}
                    fee={fee}
                    slippage={slippage}
                    comparison={rowMap.get("후보 비교 기준")}
                  />
                ) : null}
                {meta.id === "ready" ? (
                  <p className="ss-step5-launch-flow__node-primary" data-testid="ss-launch-ready-state">
                    준비 완료
                  </p>
                ) : null}
              </div>
            </article>
            {!isLast ? (
              <ChevronRight
                className="ss-step5-launch-flow__chevron"
                aria-hidden="true"
                strokeWidth={2}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MarketNodeBody(props: {
  symbol: string;
  timeframe: string;
  period: string;
}) {
  return (
    <div className="ss-step5-pipeline-market">
      <p className="ss-step5-pipeline-market__symbol" data-testid="ss-launch-market-symbol">
        {props.symbol}
      </p>
      <span className="ss-step5-pipeline-market__tf" data-testid="ss-launch-market-timeframe">
        <Clock3 className="ss-step5-pipeline-market__tf-icon" aria-hidden />
        {props.timeframe}
      </span>
      <p className="ss-step5-launch-flow__node-secondary">{props.period}</p>
    </div>
  );
}

function SearchNodeBody(props: {
  form: StrategySearchOperatorFormState;
  objectivePill: string;
  objectiveLabel: string;
  depth: string;
  showDurationRail: boolean;
}) {
  return (
    <div className="ss-step5-pipeline-search">
      <span
        className="ss-step5-pipeline-search__pill"
        data-testid="ss-launch-method"
        aria-label={props.objectiveLabel}
      >
        {props.objectivePill}
      </span>
      {props.showDurationRail ? (
        <Step5DurationPresetRail
          durationPreset={props.form.durationPreset}
          maxRuntimeMinutesOverride={props.form.maxRuntimeMinutesOverride}
          testId="ss-launch-runtime"
        />
      ) : null}
      <p className="ss-step5-launch-flow__node-secondary">{props.depth}</p>
    </div>
  );
}

function StrategyNodeBody(props: {
  familyCount: number;
  combo: string;
  direction: ReturnType<typeof step5PatternDirectionKind>;
}) {
  const countLabel = props.familyCount > 0 ? `${props.familyCount}개 전략군` : "—";
  return (
    <div className="ss-step5-pipeline-strategy">
      <Step5StrategyNodeCluster
        count={props.familyCount}
        testId="ss-launch-strategy-composition"
        staggerBase={0}
      />
      <p className="ss-step5-launch-flow__node-primary">{countLabel}</p>
      <p className="ss-step5-launch-flow__node-secondary">
        {props.combo}
        <Step5DirectionGraphic direction={props.direction} />
      </p>
    </div>
  );
}

function ValidationNodeBody(props: {
  targetMode: boolean;
  leverage: string;
  stress: string;
  jitter: string;
  fee: ReturnType<typeof step5StoredRateDisplay>;
  slippage: ReturnType<typeof step5StoredRateDisplay>;
  comparison?: string;
}) {
  return (
    <ul className="ss-step5-pipeline-validation" data-testid="ss-launch-validation-chips">
      {props.targetMode && props.comparison ? (
        <li>
          <span className="ss-step5-pipeline-validation__key">후보 비교</span>
          <span className="ss-step5-pipeline-validation__chip">{props.comparison}</span>
        </li>
      ) : null}
      <li>
        <span className="ss-step5-pipeline-validation__key">레버리지</span>
        <span className="ss-step5-pipeline-validation__chip">{props.leverage}</span>
      </li>
      <li>
        <span className="ss-step5-pipeline-validation__key">비용검증</span>
        <span className="ss-step5-pipeline-validation__chip">{props.stress}</span>
      </li>
      <li>
        <span className="ss-step5-pipeline-validation__key">재확인</span>
        <span className="ss-step5-pipeline-validation__chip">{props.jitter}</span>
      </li>
      <li>
        <span className="ss-step5-pipeline-validation__key">수수료</span>
        <span className="ss-step5-pipeline-validation__chip">
          {props.fee.rawKo}
          {props.fee.hintKo ? ` · ${props.fee.hintKo}` : ""}
        </span>
      </li>
      <li>
        <span className="ss-step5-pipeline-validation__key">슬리피지</span>
        <span className="ss-step5-pipeline-validation__chip">
          {props.slippage.rawKo}
          {props.slippage.hintKo ? ` · ${props.slippage.hintKo}` : ""}
        </span>
      </li>
    </ul>
  );
}

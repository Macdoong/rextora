"use client";

import { Clock3 } from "lucide-react";
import type { StrategySearchOperatorFormState } from "../formDefaults";
import { formatTimeframeCustomerKo } from "../customerTimeframeKo";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import { Step5DirectionGraphic } from "./Step5DirectionGraphic";
import { Step5DurationPresetRail } from "./Step5DurationPresetRail";
import { Step5StrategyNodeCluster } from "./Step5StrategyNodeCluster";
import type { Step5ReviewCardId } from "./step5ReviewPresentation";
import { step5SearchObjectiveLabel } from "./step5ReviewPresentation";
import { step5StoredRateDisplay } from "./step5RateReviewDisplay";
import {
  step5ObjectiveModePillKo,
  step5PatternDirectionKind,
  step5StrategyFamilyNodeCount,
} from "./step5VisualShared";

export function Step5ReviewCardVisual(props: {
  cardId: Step5ReviewCardId;
  form: StrategySearchOperatorFormState;
  rowMap: Map<string, string>;
  targetMode: boolean;
}) {
  const { cardId, form, rowMap, targetMode } = props;
  const mode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });

  switch (cardId) {
    case "market":
      return (
        <div className="ss-step5-review-card-visual ss-step5-review-card-visual--market">
          <p className="ss-step5-review-card-visual__symbol">
            {rowMap.get("코인") ?? form.symbol ?? "—"}
          </p>
          <span className="ss-step5-review-card-visual__tf" data-testid="ss-step5-timeframe-display">
            <Clock3 aria-hidden className="ss-step5-review-card-visual__tf-icon" />
            {formatTimeframeCustomerKo(form.timeframe)}
          </span>
          <p className="ss-step5-review-card-visual__caption">
            {rowMap.get("분석 기간") ?? "—"}
          </p>
        </div>
      );
    case "approach":
      return (
        <div className="ss-step5-review-card-visual ss-step5-review-card-visual--approach">
          <span
            className="ss-step5-review-card-visual__pill"
            data-testid="ss-step5-review-objective-pill"
            aria-label={step5SearchObjectiveLabel(form)}
          >
            {step5ObjectiveModePillKo(form)}
          </span>
          {mode === "automatic" ? (
            <Step5DurationPresetRail
              durationPreset={form.durationPreset}
              maxRuntimeMinutesOverride={form.maxRuntimeMinutesOverride}
            />
          ) : null}
          <p className="ss-step5-review-card-visual__caption">
            {rowMap.get("탐색 깊이") ?? "—"}
          </p>
        </div>
      );
    case "strategy": {
      const count = step5StrategyFamilyNodeCount(form);
      const combo = rowMap.get("선택 전략군") ?? "—";
      const direction = step5PatternDirectionKind(form);
      return (
        <div className="ss-step5-review-card-visual ss-step5-review-card-visual--strategy">
          <Step5StrategyNodeCluster count={count} testId="ss-step5-strategy-count-visual" />
          <p
            className="ss-step5-review-card-visual__primary"
            data-testid="ss-step5-strategy-count"
          >
            {count > 0 ? `${count}개 전략군` : "—"}
          </p>
          <p className="ss-step5-review-card-visual__caption">
            {combo}
            <Step5DirectionGraphic direction={direction} />
          </p>
        </div>
      );
    }
    case "validation": {
      const leverage = rowMap.get("레버리지") ?? "—";
      const stress = (rowMap.get("비용 검증") ?? "—").replace(/^비용 검증:\s*/, "");
      const jitter = (rowMap.get("파라미터 재확인") ?? "—").replace(
        /^파라미터 재확인:\s*/,
        "",
      );
      const fee = step5StoredRateDisplay(form.feeRate);
      const slip = step5StoredRateDisplay(form.slippageRate);
      return (
        <div
          className="ss-step5-review-card-visual ss-step5-review-card-visual--validation"
          data-testid="ss-guided-review-primary-validation"
        >
          <div className="ss-step5-review-card-visual__chips">
            <span className="ss-step5-review-card-visual__chip">
              레버리지 · {leverage}
            </span>
            <span className="ss-step5-review-card-visual__chip">
              비용검증 · {stress}
            </span>
            <span className="ss-step5-review-card-visual__chip">
              재확인 · {jitter}
            </span>
            {targetMode ? (
              <span className="ss-step5-review-card-visual__chip">
                목표 조건 · 사용
              </span>
            ) : null}
            <span className="ss-step5-review-card-visual__chip" data-testid="ss-guided-review-fee-chip">
              수수료 · {fee.rawKo}
              {fee.hintKo ? ` · ${fee.hintKo}` : ""}
            </span>
            <span className="ss-step5-review-card-visual__chip" data-testid="ss-guided-review-slippage-chip">
              슬리피지 · {slip.rawKo}
              {slip.hintKo ? ` · ${slip.hintKo}` : ""}
            </span>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

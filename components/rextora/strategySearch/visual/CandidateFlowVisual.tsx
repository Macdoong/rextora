"use client";

import type { CSSProperties } from "react";
import type { StrategySearchActivityEvent } from "@/src/lib/rextora/strategySearch/activityTelemetry";
import type { CandidateVisualItem } from "./runningVisualModel";
import {
  activityEventKey,
  candidateFlowItems,
  candidateItemIsEntering,
  enteringStaggerIndex,
  latestCampaignQualifiedEvent,
} from "./runningVisualModel";

function outcomeMark(outcome: CandidateVisualItem["outcome"]): string {
  if (outcome === "rejected") return "×";
  if (outcome === "gate_passed") return "✓";
  return "·";
}

function outcomeLabelKo(outcome: CandidateVisualItem["outcome"]): string {
  if (outcome === "rejected") return "탈락";
  if (outcome === "gate_passed") return "평가 통과";
  return "평가";
}

function Token({
  item,
  entering,
  stagger,
}: {
  item: CandidateVisualItem;
  entering: boolean;
  stagger: number;
}) {
  return (
    <li
      className={
        "ss-cand-token" + (entering ? " is-entering" : "")
      }
      data-testid={`ss-cand-token-${item.evaluatedCount}`}
      data-outcome={item.outcome}
      data-enter={entering ? "true" : "false"}
      data-sequence={item.sequenceLabel}
      style={
        entering
          ? ({ "--enter-i": stagger } as CSSProperties)
          : undefined
      }
    >
      <span className="ss-cand-token__mark" aria-hidden="true">
        {outcomeMark(item.outcome)}
      </span>
      <span className="ss-cand-token__seq">{item.sequenceLabel}</span>
      <span className="ss-sr-only">
        후보 {item.evaluatedCount} {outcomeLabelKo(item.outcome)}
      </span>
    </li>
  );
}

export function CandidateFlowVisual({
  items,
  events,
  freshKeys,
}: {
  items: readonly CandidateVisualItem[];
  events?: readonly StrategySearchActivityEvent[] | null;
  freshKeys: ReadonlySet<string>;
}) {
  const visible = candidateFlowItems(items);
  const evaluated = visible.filter((item) => item.outcome === "evaluated");
  const rejected = visible.filter((item) => item.outcome === "rejected");
  const passed = visible.filter((item) => item.outcome === "gate_passed");
  const qualified = latestCampaignQualifiedEvent(events);
  const qualifiedEntering =
    qualified != null && freshKeys.has(activityEventKey(qualified));

  return (
    <section
      className="ss-cand-flow"
      data-testid="ss-running-candidate-flow"
      aria-label="실시간 후보 흐름"
    >
      <h3 className="ss-cand-flow__title">실시간 후보 흐름</h3>
      {qualified ? (
        <p
          className={
            "ss-cand-flow__qualified" +
            (qualifiedEntering ? " is-entering" : "")
          }
          data-testid="ss-running-campaign-qualified"
          data-campaign-qualified="true"
          data-enter={qualifiedEntering ? "true" : "false"}
        >
          최종 적격 {qualified.qualifiedCount}
        </p>
      ) : null}
      <div className="ss-cand-flow__diagram" aria-hidden="true">
        <div className="ss-cand-flow__lane" data-lane="source">
          <span>후보</span>
        </div>
        <span className="ss-cand-flow__arrow">↓</span>
        <div className="ss-cand-flow__lane" data-lane="eval">
          <span>평가</span>
          <ol className="ss-cand-flow__tokens">
            {evaluated.map((item) => (
              <Token
                key={item.key}
                item={item}
                entering={candidateItemIsEntering(item, freshKeys)}
                stagger={enteringStaggerIndex(visible, item, freshKeys)}
              />
            ))}
          </ol>
        </div>
        <div className="ss-cand-flow__split">
          <span className="ss-cand-flow__branch" aria-hidden="true">
            ↙
          </span>
          <span className="ss-cand-flow__branch" aria-hidden="true">
            ↘
          </span>
        </div>
        <div className="ss-cand-flow__outcomes">
          <div className="ss-cand-flow__lane" data-lane="rejected">
            <span>탈락</span>
            <ol className="ss-cand-flow__tokens">
              {rejected.map((item) => (
                <Token
                  key={item.key}
                  item={item}
                  entering={candidateItemIsEntering(item, freshKeys)}
                  stagger={enteringStaggerIndex(visible, item, freshKeys)}
                />
              ))}
            </ol>
          </div>
          <div className="ss-cand-flow__lane" data-lane="passed">
            <span>평가 통과</span>
            <ol className="ss-cand-flow__tokens">
              {passed.map((item) => (
                <Token
                  key={item.key}
                  item={item}
                  entering={candidateItemIsEntering(item, freshKeys)}
                  stagger={enteringStaggerIndex(visible, item, freshKeys)}
                />
              ))}
            </ol>
          </div>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="ss-cand-flow__empty" data-testid="ss-cand-flow-empty">
          평가가 시작되면 실제 후보가 이 흐름에 나타납니다.
        </p>
      ) : null}
    </section>
  );
}

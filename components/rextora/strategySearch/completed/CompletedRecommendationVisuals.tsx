"use client";

import type { CompletedRecommendationView } from "./completedViewModel";
import {
  COMPLETED_COMPARE_SCORE_LABEL,
  formatCompositeScore,
  formatSignedReturnPct,
} from "./completedDisplayFormat";
import { CompletedScoreHelp } from "./CompletedScoreHelp";
import { formatMddAbsPct, formatPct } from "../formatters";
import { usePresentationEnter } from "./usePresentationEnter";

function WinRateRing(props: { winRate: number | null }) {
  if (props.winRate == null) {
    return (
      <div className="ss-completed-rec-visual__tile ss-completed-rec-visual__tile--win">
        <span className="ss-completed-rec-visual__icon" aria-hidden="true">
          ◔
        </span>
        <span className="ss-completed-type-metric">—</span>
        <span className="ss-completed-type-caption">승률</span>
      </div>
    );
  }
  const pct = Math.min(100, Math.max(0, props.winRate * 100));
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div
      className="ss-completed-rec-visual__tile ss-completed-rec-visual__tile--win"
      data-testid="ss-completed-rec-win-donut"
    >
      <svg viewBox="0 0 52 52" className="ss-completed-rec-visual__ring" aria-hidden="true">
        <circle cx="26" cy="26" r={r} className="ss-completed-rec-visual__ring-bg" />
        <circle
          cx="26"
          cy="26"
          r={r}
          className="ss-completed-rec-visual__ring-fg"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span className="ss-completed-type-metric">{formatPct(props.winRate)}</span>
      <span className="ss-completed-type-caption">승률</span>
    </div>
  );
}

export function CompletedRecommendationVisuals(props: {
  recommendation: CompletedRecommendationView;
  dataStable: boolean;
  minScoreEnabled: boolean;
}) {
  const entered = usePresentationEnter(500, props.dataStable);
  const r = props.recommendation;
  const ret = r.netReturn ?? 0;
  const retBar = Math.min(100, Math.abs(ret) * 200);
  const mddAbs = r.maxDrawdown != null ? Math.abs(r.maxDrawdown) : null;
  const mddMeter = mddAbs != null ? Math.min(100, mddAbs * 400) : 0;

  return (
    <div
      className={
        "ss-completed-rec-visual ss-completed-rec-visual--bright" +
        (entered ? " ss-completed-rec-visual--entered" : "")
      }
      data-testid="ss-completed-recommendation-visuals"
    >
      <div className="ss-completed-rec-visual__tile ss-completed-rec-visual__tile--return">
        <span className="ss-completed-rec-visual__icon" aria-hidden="true">
          ↗
        </span>
        <span className="ss-completed-type-metric" data-testid="ss-completed-rec-return">
          {formatSignedReturnPct(r.netReturn)}
        </span>
        <span className="ss-completed-type-caption">수익률</span>
        <div className="ss-completed-rec-visual__mini-bar">
          <div style={{ width: `${retBar}%` }} />
        </div>
      </div>
      <div className="ss-completed-rec-visual__tile ss-completed-rec-visual__tile--mdd">
        <span className="ss-completed-rec-visual__icon" aria-hidden="true">
          ⚠
        </span>
        <span className="ss-completed-type-metric" data-testid="ss-completed-rec-mdd">
          {r.maxDrawdown != null ? formatMddAbsPct(r.maxDrawdown) : "—"}
        </span>
        <span className="ss-completed-type-caption">최대 낙폭</span>
        <div className="ss-completed-rec-visual__risk-meter">
          <div style={{ width: `${mddMeter}%` }} />
        </div>
      </div>
      <WinRateRing winRate={r.winRate} />
      <div className="ss-completed-rec-visual__tile ss-completed-rec-visual__tile--trades">
        <span className="ss-completed-rec-visual__icon" aria-hidden="true">
          #
        </span>
        <span className="ss-completed-type-metric">{r.tradeCount ?? "—"}회</span>
        <span className="ss-completed-type-caption">거래수</span>
      </div>
      <div className="ss-completed-rec-visual__tile ss-completed-rec-visual__tile--score">
        <span className="ss-completed-rec-visual__icon" aria-hidden="true">
          Σ
        </span>
        <div
          className="ss-completed-rec-visual__score-label-row"
          data-testid="ss-completed-rec-score-label-row"
        >
          <span className="ss-completed-type-caption">
            {COMPLETED_COMPARE_SCORE_LABEL}
          </span>
          <CompletedScoreHelp minScoreEnabled={props.minScoreEnabled} />
        </div>
        <span className="ss-completed-type-metric" data-testid="ss-completed-rec-score">
          {formatCompositeScore(r.score)}
        </span>
      </div>
    </div>
  );
}

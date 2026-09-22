"use client";

import type { ReactNode } from "react";
import type { SearchScopeProgress } from "./searchScopeVisual";
import {
  formatElapsedCompact,
  formatLiveCount,
  liveEvaluatedCount,
  provenSearchStageLabel,
  qualificationFillRatio,
  resolveRunningProgressVisual,
  runtimeUtilizationPct,
} from "./searchScopeVisual";

function ScopeVisualSlot({ children }: { children: ReactNode }) {
  return <div className="ss-scope-visual-slot">{children}</div>;
}

export function MarketScopeVisual({
  symbol,
  timeframe,
  periodDays,
}: {
  symbol: string;
  timeframe: string;
  periodDays: number | null;
}) {
  const fill =
    periodDays != null ? Math.max(0.22, Math.min(1, periodDays / 120)) : 0.45;
  return (
    <ScopeVisualSlot>
    <svg
      className="ss-scope-visual ss-scope-visual--market"
      viewBox="0 0 120 52"
      role="img"
      aria-label={`${symbol} ${timeframe} ${periodDays != null ? `${periodDays}일` : "직접 지정"}`}
      data-scope-visual="market"
    >
      <text x="4" y="11" className="ss-scope-visual__label">
        {symbol}
      </text>
      <text x="116" y="11" textAnchor="end" className="ss-scope-visual__muted">
        {timeframe}
      </text>
      {[
        [10, 28, 14],
        [28, 22, 18],
        [46, 30, 12],
        [64, 20, 16],
        [82, 26, 14],
      ].map(([x, high, body], index) => (
        <g key={x} className="ss-market-candle" data-candle-index={index}>
          <path
            d={`M${x + 4} ${48 - high - 8} v${high}`}
            className="ss-market-wick"
          />
          <rect
            x={x}
            y={48 - body - 8}
            width="8"
            height={body}
            rx="0.8"
            className="ss-market-body"
          />
        </g>
      ))}
      <rect x="4" y="46" width="112" height="3" rx="1.5" className="ss-market-track" />
      <rect
        x="4"
        y="46"
        width={112 * fill}
        height="3"
        rx="1.5"
        className="ss-market-period"
        data-period-days={periodDays ?? "custom"}
      />
    </svg>
    </ScopeVisualSlot>
  );
}

export function FamilyNetworkVisual({
  familyIds,
}: {
  familyIds: readonly string[];
}) {
  const count = familyIds.length;
  const nodes = familyIds.slice(0, 8);
  const gap = nodes.length > 1 ? 96 / (nodes.length - 1) : 0;
  return (
    <ScopeVisualSlot>
    <svg
      className="ss-scope-visual ss-scope-visual--families"
      viewBox="0 0 120 52"
      role="img"
      aria-label={`탐색 대상 ${count}개`}
      data-scope-visual="families"
      data-family-count={count}
    >
      {nodes.map((id, index) => {
        const x = nodes.length === 1 ? 60 : 12 + gap * index;
        const y = index % 2 === 0 ? 22 : 34;
        return (
          <g key={id}>
            {index > 0 ? (
              <line
                x1={nodes.length === 1 ? 60 : 12 + gap * (index - 1)}
                y1={(index - 1) % 2 === 0 ? 22 : 34}
                x2={x}
                y2={y}
                className="ss-family-link"
              />
            ) : null}
            <circle cx={x} cy={y} r="6.5" className="ss-family-node" />
          </g>
        );
      })}
      <text x="60" y="50" textAnchor="middle" className="ss-scope-visual__muted">
        {count}개 전략군
      </text>
    </svg>
    </ScopeVisualSlot>
  );
}

export function CandidateBranchVisual({
  branchCount,
}: {
  branchCount: number;
}) {
  const n = Math.max(1, Math.min(6, branchCount));
  return (
    <ScopeVisualSlot>
    <svg
      className="ss-scope-visual ss-scope-visual--candidates"
      viewBox="0 0 40 40"
      width="40"
      height="40"
      role="img"
      aria-label="파라미터 조합 생성"
      data-scope-visual="candidates"
      data-branch-count={n}
    >
      <path d="M20 13 V17" className="ss-combo-stem" />
      <path d="M20 17 L10 25" className="ss-combo-stem" />
      <path d="M20 17 L20 25" className="ss-combo-stem" />
      <path d="M20 17 L30 25" className="ss-combo-stem" />
      <circle cx="20" cy="9" r="4" className="ss-combo-source" />
      <circle cx="10" cy="29" r="3.4" className="ss-combo-node" />
      <circle cx="20" cy="30" r="3.4" className="ss-combo-node" />
      <circle cx="30" cy="29" r="3.4" className="ss-combo-node" />
    </svg>
    </ScopeVisualSlot>
  );
}

export function HistoryScanVisual({
  periodDays,
}: {
  periodDays: number | null;
}) {
  const ticks = periodDays != null ? Math.max(3, Math.min(6, Math.round(periodDays / 30))) : 4;
  return (
    <ScopeVisualSlot>
    <svg
      className="ss-scope-visual ss-scope-visual--history"
      viewBox="0 0 120 52"
      role="img"
      aria-label="과거 데이터 검증"
      data-scope-visual="history"
    >
      <line x1="8" y1="28" x2="112" y2="28" className="ss-history-line" />
      {Array.from({ length: ticks }, (_, index) => {
        const x = 12 + (index * 96) / Math.max(1, ticks - 1);
        return (
          <g key={index}>
            <circle cx={x} cy="28" r="3.2" className="ss-history-tick" />
          </g>
        );
      })}
      <rect x="8" y="20" width="18" height="16" rx="2" className="ss-history-sweep" />
    </svg>
    </ScopeVisualSlot>
  );
}

export function CostChannelVisual({
  channels,
}: {
  channels: Array<{ id: string; label: string; multiplier: number }>;
}) {
  if (channels.length === 0) {
    return (
      <ScopeVisualSlot>
      <svg
        className="ss-scope-visual ss-scope-visual--cost"
        viewBox="0 0 120 52"
        role="img"
        aria-label="비용 스트레스 꺼짐"
        data-scope-visual="cost"
      >
        <rect
          x="36"
          y="10"
          width="48"
          height="32"
          rx="6"
          className="ss-cost-shield ss-cost-shield--off"
        />
      </svg>
      </ScopeVisualSlot>
    );
  }
  const max = Math.max(...channels.map((channel) => channel.multiplier), 1);
  return (
    <ScopeVisualSlot>
    <svg
      className="ss-scope-visual ss-scope-visual--cost"
      viewBox="0 0 120 52"
      role="img"
      aria-label={channels.map((c) => `${c.label} ${c.multiplier}×`).join(", ")}
      data-scope-visual="cost"
    >
      {channels.map((channel, index) => {
        const height = Math.max(8, (channel.multiplier / max) * 28);
        const x = 18 + index * 32;
        return (
          <g key={channel.id} data-cost-channel={channel.id}>
            <rect
              x={x}
              y={40 - height}
              width="16"
              height={height}
              rx="3"
              className="ss-cost-bar"
            />
            <text
              x={x + 8}
              y="50"
              textAnchor="middle"
              className="ss-scope-visual__muted"
            >
              {channel.multiplier}×
            </text>
          </g>
        );
      })}
    </svg>
    </ScopeVisualSlot>
  );
}

export function QualificationTargetVisual({
  target,
  qualifiedCount,
}: {
  target: number;
  qualifiedCount?: number | null;
}) {
  const fill = qualificationFillRatio({ target, qualifiedCount });
  const r = 14;
  const c = 2 * Math.PI * r;
  const offset = fill == null ? c : c * (1 - fill);
  return (
    <ScopeVisualSlot>
    <svg
      className="ss-scope-visual ss-scope-visual--qualify"
      viewBox="0 0 120 52"
      role="img"
      aria-label={`목표 합격 후보 ${target}개`}
      data-scope-visual="qualification"
      data-qualified-target={target}
    >
      <circle cx="28" cy="26" r={r} className="ss-qualify-track" />
      <circle
        cx="28"
        cy="26"
        r={r}
        className="ss-qualify-fill"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 28 26)"
      />
      <text x="28" y="30" textAnchor="middle" className="ss-scope-visual__label">
        {target}
      </text>
      <text x="52" y="24" className="ss-scope-visual__muted">
        합격 목표
      </text>
      <text x="52" y="38" className="ss-scope-visual__label">
        {formatLiveCount(qualifiedCount) ?? "대기"}
      </text>
    </svg>
    </ScopeVisualSlot>
  );
}

export function TopResultVisual({
  top10Count,
}: {
  top10Count: number | null;
}) {
  const filled = top10Count != null ? Math.max(0, Math.min(3, top10Count)) : 0;
  const heights = [16, 24, 12];
  return (
    <ScopeVisualSlot>
    <svg
      className="ss-scope-visual ss-scope-visual--top"
      viewBox="0 0 120 52"
      role="img"
      aria-label={
        top10Count != null && top10Count > 0
          ? `상위 후보 ${top10Count}개`
          : top10Count === 0
            ? "상위 후보 준비 중"
            : "상위 후보"
      }
      data-scope-visual="top"
      data-top10-count={top10Count ?? 0}
    >
      {heights.map((height, index) => {
        const x = 18 + index * 22;
        const on = index < filled;
        return (
          <rect
            key={index}
            x={x}
            y={42 - height}
            width="16"
            height={height}
            rx="3"
            className={on ? "ss-podium ss-podium--on" : "ss-podium"}
            data-podium-slot={index + 1}
          />
        );
      })}
      <text x="92" y="30" className="ss-scope-visual__label">
        {formatLiveCount(top10Count) ?? "—"}
      </text>
    </svg>
    </ScopeVisualSlot>
  );
}

export function SearchProgressRing({
  progress,
}: {
  progress: SearchScopeProgress | null | undefined;
}) {
  const visual = resolveRunningProgressVisual(progress);
  const evaluated = formatLiveCount(liveEvaluatedCount(progress));
  const qualified = formatLiveCount(progress?.qualifiedCount ?? null);
  const elapsed = formatElapsedCompact(progress?.elapsedMs);
  const stage = provenSearchStageLabel(progress);
  const utilization = runtimeUtilizationPct(progress);
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c * 0.72;
  const label = "탐색 진행 중";

  if (!visual.running) return null;

  return (
    <div
      className="ss-running-strip"
      data-testid="ss-running-progress"
      data-progress-mode="indeterminate"
    >
      <div
        className="ss-progress-ring ss-progress-ring--indeterminate"
        role="status"
        aria-label="탐색 진행 중"
        data-testid="ss-progress-ring"
      >
        <svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
          <circle cx="24" cy="24" r={r} className="ss-progress-track" />
          <circle
            cx="24"
            cy="24"
            r={r}
            className="ss-progress-fill"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 24 24)"
          />
        </svg>
      </div>
      <div className="ss-running-copy">
        <p className="ss-running-status">{label}</p>
        {stage ? (
          <p className="ss-running-stage" data-testid="ss-running-stage">
            현재 탐색 전략군 {stage}
          </p>
        ) : null}
        {utilization != null ? (
          <p
            className="ss-runtime-util"
            data-testid="ss-runtime-utilization"
          >
            최대 실행시간 사용률 {utilization}%
          </p>
        ) : null}
      </div>
      <ul className="ss-running-metrics">
        {evaluated != null ? (
          <li>
            <span>평가 완료</span>
            <strong
              key={evaluated}
              className="ss-live-count"
              data-testid="ss-live-evaluated"
            >
              {evaluated}
            </strong>
          </li>
        ) : null}
        {qualified != null ? (
          <li>
            <span>통과 후보</span>
            <strong
              key={qualified}
              className="ss-live-count"
              data-testid="ss-live-qualified"
            >
              {qualified}
            </strong>
          </li>
        ) : null}
        {elapsed != null ? (
          <li>
            <span>경과 시간</span>
            <strong
              key={elapsed}
              className="ss-live-count"
              data-testid="ss-live-elapsed"
            >
              {elapsed}
            </strong>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

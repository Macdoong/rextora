"use client";

import {
  LIVE_DISABLED_LABEL,
  LIVE_ORDERS_BLOCKED_LABEL,
} from "@/src/lib/rextora/live/liveGateOperatorPresentation";

export function LiveSafetyHeader({
  modeLabel,
  liveStatus,
  realOrderStatus,
  emergencyLabel,
  approvalLabel,
  riskLabel,
  headline,
  detail,
  gatePassed,
  gateTotal,
}: {
  modeLabel: string;
  liveStatus: string;
  realOrderStatus: string;
  emergencyLabel: string;
  approvalLabel: string;
  riskLabel: string;
  headline: string;
  detail: string;
  gatePassed: number | null;
  gateTotal: number | null;
}) {
  const liveInactive = liveStatus === LIVE_DISABLED_LABEL;
  const ordersBlocked = realOrderStatus === LIVE_ORDERS_BLOCKED_LABEL;
  const emergencyActive = emergencyLabel === "긴급 정지";
  const liveTone = liveInactive ? "bad" : "warn";
  const orderTone = ordersBlocked ? "bad" : "warn";
  const approvalTone = approvalLabel.includes("완료") ? "ok" : "warn";
  const riskTone =
    riskLabel === "정상" ? "ok" : riskLabel.includes("중단") || riskLabel.includes("정지")
      ? "bad"
      : "warn";
  const emergencyTone = emergencyActive ? "bad" : "ok";
  const gateLabel =
    gatePassed == null || gateTotal == null
      ? "데이터 없음"
      : `${gatePassed} / ${gateTotal}`;

  return (
    <section className="v3-lv-hero" data-testid="live-safety-header">
      <div className="v3-lv-hero-main">
        <small>실전 준비 상태 · {modeLabel}</small>
        <h2>{headline}</h2>
        <p>
          {detail}{" "}
          {ordersBlocked
            ? "실제 주문은 전송되지 않습니다."
            : "실전 주문 허용 설정을 다시 확인하세요."}
        </p>
      </div>
      <div className="v3-lv-hero-cell">
        <span>실전 기능</span>
        <b className={liveTone}>{liveStatus}</b>
      </div>
      <div className="v3-lv-hero-cell">
        <span>실제 주문</span>
        <b className={orderTone}>{realOrderStatus}</b>
      </div>
      <div className="v3-lv-hero-cell">
        <span>승인</span>
        <b className={approvalTone}>{approvalLabel}</b>
      </div>
      <div className="v3-lv-hero-cell">
        <span>위험</span>
        <b className={riskTone}>{riskLabel}</b>
      </div>
      <div className="v3-lv-hero-cell">
        <span>긴급 정지</span>
        <b className={emergencyTone}>{emergencyLabel}</b>
      </div>
      <div className="v3-lv-hero-cell">
        <span>게이트</span>
        <b>{gateLabel}</b>
      </div>
    </section>
  );
}

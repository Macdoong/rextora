"use client";

import { useEffect, useState } from "react";
import { useSetOperatorPageContext } from "@/components/rextora/shell/OperatorPageContext";
import { RiskOperatorWorkbench } from "@/components/rextora/risk/RiskOperatorWorkbench";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import {
  liveGateLiveStatusLabel,
  liveGateRealOrderLabel,
} from "@/src/lib/rextora/live/liveGateOperatorPresentation";
import { riskOperatorStatePresentation } from "@/src/lib/rextora/risk/riskOperatorPresentation";

export default function RiskOperatorPage() {
  const [riskView, setRiskView] = useState<UnifiedRiskView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [flags, setFlags] = useState({
    liveTradingEnabled: false,
    allowLiveTrading: false,
  });
  const [emergencyStopActive, setEmergencyStopActive] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([
        fetch("/api/rextora/bot/status", { cache: "no-store" }).then((r) =>
          r.json(),
        ),
        fetch("/api/rextora/settings", { cache: "no-store" }).then((r) =>
          r.json(),
        ),
        fetch("/api/rextora/live/readiness", { cache: "no-store" }).then((r) =>
          r.json(),
        ),
      ])
        .then(([bot, settingsRes, ready]) => {
          setRiskView(bot.data?.riskView ?? null);
          const trading = settingsRes.data?.settings?.trading as
            | { liveTradingEnabled?: boolean; allowLiveTrading?: boolean }
            | undefined;
          setFlags({
            liveTradingEnabled: trading?.liveTradingEnabled === true,
            allowLiveTrading: trading?.allowLiveTrading === true,
          });
          const emergency = (
            ready.data?.checklist as
              | Array<{ id: string; status: string }>
              | undefined
          )?.find((item) => item.id === "emergency_status");
          setEmergencyStopActive(emergency?.status === "blocked");
        })
        .finally(() => {
          setLoaded(true);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const liveStatus = liveGateLiveStatusLabel(flags);
  const realOrderStatus = liveGateRealOrderLabel(flags);
  const riskState = riskOperatorStatePresentation({
    riskState: riskView?.riskState ?? null,
    emergencyStopActive,
    limitBreached: Boolean(riskView?.limitBreached),
  });

  useSetOperatorPageContext({
    source: "live_gate",
    strategyId: null,
    runId: null,
    paperSessionId: null,
    symbol: null,
    timeframe: null,
    readinessLabel: riskState.labelKo,
  });

  return (
    <div className="rextora-page v3 v3-risk" data-testid="risk-operator-page">
      <RiskOperatorWorkbench
        loaded={loaded}
        riskView={riskView}
        riskState={riskState}
        liveStatus={liveStatus}
        realOrderStatus={realOrderStatus}
        emergencyStopActive={emergencyStopActive}
        approvalLabel="위험 페이지 · 승인 변경 없음"
        modeLabel="검증 모드"
      />
    </div>
  );
}

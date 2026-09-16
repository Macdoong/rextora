"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { TradingChartsPanel } from "@/components/rextora/charts/TradingChartsPanel";
import { LiveActivationGates } from "@/components/rextora/live/LiveActivationGates";
import { AgentContextStrip } from "@/components/rextora/agent/AgentContextStrip";
import { LiveSafetyHeader } from "@/components/rextora/live/operator/LiveSafetyHeader";
import { ApiPermissionPanel } from "@/components/rextora/live/operator/ApiPermissionPanel";
import { RiskLimitsPanel } from "@/components/rextora/live/operator/RiskLimitsPanel";
import { V3Card } from "@/components/rextora/v3/V3Card";
import { useSetOperatorPageContext } from "@/components/rextora/shell/OperatorPageContext";
import type { UnifiedMetricsSnapshot } from "@/src/lib/rextora/metrics/types";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import type { LiveReadinessChecklistItem } from "@/src/lib/rextora/liveReadinessChecklist";
import {
  LIVE_DISABLED_LABEL,
  LIVE_ORDERS_BLOCKED_LABEL,
  LIVE_SETTINGS_BLOCK_COPY,
  liveGateFailurePresentation,
  liveGateLiveStatusLabel,
  liveGatePermissionRows,
  liveGateRealOrderCountLabel,
  liveGateRealOrderLabel,
} from "@/src/lib/rextora/live/liveGateOperatorPresentation";
import {
  riskOperatorRowsFromUnified,
  riskOperatorStatePresentation,
  riskOperatorUtilizationFromUnified,
} from "@/src/lib/rextora/risk/riskOperatorPresentation";

function LiveTradingPageInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [riskView, setRiskView] = useState<UnifiedRiskView | null>(null);
  const [flags, setFlags] = useState({
    liveTradingEnabled: false,
    allowLiveTrading: false,
  });
  const [gateSnapshot, setGateSnapshot] = useState<{
    checklist: LiveReadinessChecklistItem[];
    remainingBlocks: string[];
    liveReady: boolean;
    liveAllowed: boolean;
    approvalOk: boolean | null;
    riskOk: boolean | null;
    approvedAt: string | null;
    approvedBy: string | null;
    approvalLabel: string | null;
    emergencyStopActive: boolean;
    gatePassed: number;
    gateTotal: number;
  } | null>(null);

  async function refresh() {
    const [dash, bot, settingsRes] = await Promise.all([
      fetch("/api/rextora/trading/dashboard").then((r) => r.json()),
      fetch("/api/rextora/bot/status").then((r) => r.json()),
      fetch("/api/rextora/settings").then((r) => r.json()),
    ]);
    setStatus(dash.data?.status ?? dash.status ?? null);
    setRiskView(bot.data?.riskView ?? null);
    const trading = settingsRes.data?.settings?.trading as
      | { liveTradingEnabled?: boolean; allowLiveTrading?: boolean }
      | undefined;
    setFlags({
      liveTradingEnabled: trading?.liveTradingEnabled === true,
      allowLiveTrading: trading?.allowLiveTrading === true,
    });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    const t = setInterval(() => void refresh(), 8000);
    return () => {
      clearTimeout(timer);
      clearInterval(t);
    };
  }, []);

  async function run(path: string, mode = "LIVE") {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const json = await res.json();
    setMessage(
      json.message ??
        json.data?.message ??
        (json.ok ? "완료" : (json.error ?? "실패")),
    );
    await refresh();
  }

  const s = status as {
    liveAllowed?: boolean;
    canStartLive?: boolean;
    liveBlockReason?: string | null;
    botStatusLabel?: "대기 중" | "실행 중" | "중지됨" | "오류" | string;
    safetyLabel?: string;
    activeStrategy?: { name: string; paramsHash: string };
    positions?: Array<Record<string, unknown>>;
    metrics?: UnifiedMetricsSnapshot;
    todayStats?: {
      realizedPnlUsdt?: number;
      unrealizedPnlUsdt?: number;
      accountEquity?: number;
      accountReturnPct?: number;
      feeUsdt?: number;
      fundingUsdt?: number;
      slippageUsdt?: number;
    };
  } | null;

  const liveEnabled = Boolean(s?.canStartLive);
  const m = s?.metrics;
  const ts = s?.todayStats;
  const liveSessionActive = s?.botStatusLabel === "실행 중";
  const liveStatus = liveGateLiveStatusLabel(flags);
  const realOrderStatus = liveGateRealOrderLabel(flags);
  const emergencyLabel = gateSnapshot?.emergencyStopActive
    ? "긴급 정지"
    : "비활성";
  const approvalLabel =
    gateSnapshot?.approvalLabel ??
    (gateSnapshot?.approvalOk === true ? "실전 승인 완료" : "실전 승인 전");
  const riskState = riskOperatorStatePresentation({
    riskState: riskView?.riskState ?? null,
    emergencyStopActive: Boolean(gateSnapshot?.emergencyStopActive),
    limitBreached: Boolean(riskView?.limitBreached),
  });
  const riskRows = riskOperatorRowsFromUnified(riskView ?? {});
  const riskUsageById = Object.fromEntries(
    riskOperatorUtilizationFromUnified(riskView ?? {}).metrics.map((metric) => [
      metric.id,
      metric.usageRatio,
    ]),
  );
  const permissionRows = liveGatePermissionRows({
    apiConfigured:
      gateSnapshot?.checklist.find((item) => item.id === "binance_connection")
        ?.status !== "needed",
    readPermission:
      gateSnapshot?.checklist.find((item) => item.id === "account_queries")
        ?.status === "passed"
        ? "정상"
        : gateSnapshot?.checklist.find((item) => item.id === "account_queries")
            ?.status === "blocked"
          ? "차단"
          : "미확인",
    futuresPermission:
      gateSnapshot?.checklist.find((item) => item.id === "futures_permission")
        ?.status === "passed"
        ? "정상"
        : gateSnapshot?.checklist.find((item) => item.id === "futures_permission")
            ?.status === "blocked"
          ? "차단"
          : "미확인",
    orderPermission:
      gateSnapshot?.checklist.find((item) => item.id === "order_permission")
        ?.status === "passed"
        ? "정상"
        : gateSnapshot?.checklist.find((item) => item.id === "order_permission")
            ?.status === "blocked"
          ? "차단"
          : "미확인",
    usedPublicMarketDataOnly: false,
  });
  const primaryBlock = gateSnapshot?.remainingBlocks[0]
    ? liveGateFailurePresentation(gateSnapshot.remainingBlocks[0])
    : null;
  const headline = gateSnapshot?.emergencyStopActive
    ? "차단 · 긴급 정지"
    : !flags.liveTradingEnabled || !flags.allowLiveTrading
      ? "차단 · 승인과 설정 필요"
      : primaryBlock
        ? primaryBlock.titleKo
        : gateSnapshot?.liveReady
          ? "게이트 통과"
          : "준비 전";
  const detail = `${liveStatus} · ${realOrderStatus} · 긴급 정지 ${emergencyLabel}`;

  const onSnapshot = useCallback(
    (snapshot: NonNullable<typeof gateSnapshot>) => {
      setGateSnapshot(snapshot);
    },
    [],
  );

  useSetOperatorPageContext({
    source: "live_gate",
    strategyId:
      searchParams.get("candidate") ??
      searchParams.get("strategyId") ??
      null,
    runId: searchParams.get("runId"),
    paperSessionId: searchParams.get("sessionId"),
    symbol: searchParams.get("symbol"),
    timeframe: searchParams.get("timeframe"),
    readinessLabel: liveStatus,
  });

  return (
    <div className="rextora-page v3 v3-live" data-testid="live-trading-page">
      <div className="v3-lv-pagehead">
        <header>
          <h1 className="rextora-page-title">실전 진입</h1>
          <p>
            승인과 안전 조건을 모두 통과해야 실전 매매를 시작할 수 있습니다.
          </p>
        </header>
        <p className="v3-lv-asof">{liveStatus}</p>
      </div>
      <AgentContextStrip pageLabelKo="실전 진입" />

      <LiveSafetyHeader
        modeLabel="검증 모드"
        liveStatus={liveStatus}
        realOrderStatus={realOrderStatus}
        emergencyLabel={emergencyLabel}
        approvalLabel={approvalLabel}
        riskLabel={riskState.labelKo}
        headline={headline}
        detail={detail}
        gatePassed={gateSnapshot?.gatePassed ?? null}
        gateTotal={gateSnapshot?.gateTotal ?? null}
      />

      {!flags.liveTradingEnabled || !flags.allowLiveTrading ? (
        <p className="v3-lv-flag" data-testid="live-feature-flag-notice">
          {LIVE_SETTINGS_BLOCK_COPY} {LIVE_DISABLED_LABEL} ·{" "}
          {LIVE_ORDERS_BLOCKED_LABEL}
        </p>
      ) : null}

      <Suspense fallback={<p className="v3-lv-note">게이트를 불러오는 중…</p>}>
        <LiveActivationGates onSnapshot={onSnapshot} />
      </Suspense>

      <div className="v3-lv-grid v3-lv-split">
        <V3Card className="v3-lv-s6" title="위험 상태" meta="읽기 전용" interactive>
          <RiskLimitsPanel
            stateLabel={riskState.labelKo}
            rows={riskRows}
            usageById={riskUsageById}
          />
          <div className="v3-lv-toolbar" style={{ marginTop: 12 }}>
            <Link
              href="/risk"
              className="v3-lv-btn-secondary v3-hover"
              data-testid="live-gate-risk-link"
            >
              위험 설정 확인
            </Link>
          </div>
        </V3Card>
        <V3Card className="v3-lv-s6" title="API 권한" meta="구성 · 조회 · 주문" interactive>
          <ApiPermissionPanel rows={permissionRows} />
        </V3Card>
      </div>

      <V3Card
        title="실전 제어"
        meta={liveEnabled ? "시작 가능" : "시작 불가"}
        data-testid="live-readiness"
      >
        <dl className="v3-lv-control-grid">
          <div>
            <dt>실전 허용</dt>
            <dd className={s?.liveAllowed ? "ok" : "bad"}>
              {s?.liveAllowed ? "허용" : "차단"}
            </dd>
          </div>
          <div>
            <dt>시작 가능</dt>
            <dd className={liveEnabled ? "ok" : "bad"}>
              {liveEnabled ? "가능" : "불가"}
            </dd>
          </div>
          <div>
            <dt>봇 상태</dt>
            <dd>{s?.botStatusLabel ?? "대기 중"}</dd>
          </div>
          <div>
            <dt>활성 전략</dt>
            <dd>{s?.activeStrategy?.name ?? "미선택"}</dd>
          </div>
          <div>
            <dt>안전 상태</dt>
            <dd>{s?.safetyLabel ?? "데이터 없음"}</dd>
          </div>
          <div>
            <dt>실주문</dt>
            <dd>
              {liveGateRealOrderCountLabel(liveSessionActive ? null : 0)}
            </dd>
          </div>
        </dl>
        {!liveSessionActive ? (
          <div className="v3-lv-idle" data-testid="live-idle-status" style={{ marginTop: 12 }}>
            <p>
              <strong>현재 실전매매가 시작되지 않았습니다.</strong>
            </p>
            <p className="v3-lv-note" data-testid="live-start-helper">
              {s?.liveBlockReason ??
                "안전 게이트와 승인을 통과한 뒤 아래에서 시작할 수 있습니다. 시작 전에도 실제 주문은 전송되지 않습니다."}
            </p>
          </div>
        ) : null}
        <div className="v3-lv-toolbar" style={{ marginTop: 14 }}>
          <Button
            tone={liveEnabled ? "success" : "default"}
            data-testid="live-start"
            className="v3-lv-start"
            disabled={!liveEnabled}
            onClick={() => liveEnabled && void run("/api/bot/start", "LIVE")}
          >
            실전 매매 시작
          </Button>
          <Button
            tone="warning"
            data-testid="live-stop"
            onClick={() => void run("/api/bot/stop", "LIVE")}
          >
            실전 매매 중지
          </Button>
        </div>
        {message ? <p className="v3-lv-note">{message}</p> : null}
      </V3Card>

      {liveSessionActive ? (
        <V3Card title="통일 지표" meta="실행 중">
          <div className="v3-lv-status-grid">
            <div>
              <dt>오늘 실현</dt>
              <dd>{`${m?.todayRealizedPnlUsdt ?? ts?.realizedPnlUsdt ?? 0} USDT`}</dd>
            </div>
            <div>
              <dt>오늘 미실현</dt>
              <dd>{`${m?.todayUnrealizedPnlUsdt ?? ts?.unrealizedPnlUsdt ?? 0} USDT`}</dd>
            </div>
            <div>
              <dt>현재 자본</dt>
              <dd>{`${m?.accountEquity ?? ts?.accountEquity ?? "데이터 없음"} USDT`}</dd>
            </div>
            <div>
              <dt>계정 수익률</dt>
              <dd>{`${m?.accountReturnPct ?? ts?.accountReturnPct ?? 0}%`}</dd>
            </div>
          </div>
        </V3Card>
      ) : null}

      <div className="v3-lv-danger" data-testid="live-emergency-controls">
        <h3>위험 제어 · 실전 전용</h3>
        <p className="v3-lv-note">
          이 구역만 긴급 변이를 담습니다. 위험 관리 화면에는 같은 버튼이 없습니다.
          이 검증에서는 실행하지 않습니다.
        </p>
        <div className="v3-lv-toolbar">
          <Button
            tone="danger"
            data-testid="emergency-stop"
            onClick={() => void run("/api/emergency/stop-all", "LIVE")}
          >
            긴급 중지
          </Button>
          <Button
            tone="danger"
            onClick={() => void run("/api/rextora/trading/close-all", "LIVE")}
          >
            전체 포지션 청산
          </Button>
          <Button
            tone="danger"
            onClick={() => void run("/api/rextora/trading/cancel-all", "LIVE")}
          >
            모든 주문 취소
          </Button>
        </div>
      </div>

      {liveSessionActive ? (
        <div className="v3-screen-in">
          <TradingChartsPanel
            mode="LIVE"
            sessionActive={liveSessionActive}
            metrics={(s?.metrics as UnifiedMetricsSnapshot) ?? null}
            riskView={riskView}
            symbol={
              typeof s?.positions?.[0]?.symbol === "string"
                ? String(s.positions[0].symbol)
                : undefined
            }
          />
        </div>
      ) : (
        <div data-testid="trading-charts-live">
          <div className="v3-lv-chart-empty" data-testid="live-charts-idle">
            <strong>실전 차트·지표</strong>
            <p>
              실전 매매가 시작되지 않아 차트 데이터를 표시하지 않습니다. 가짜
              캔들이나 손익 곡선은 그리지 않습니다.
            </p>
            <Link href="/settings">시스템 설정에서 실전 허용 확인</Link>
          </div>
        </div>
      )}

      <details className="v3-lv-tech">
        <summary>기술 정보</summary>
        <dl className="v3-lv-tech-grid">
          <div>
            <dt>실전 허용</dt>
            <dd>{s?.liveAllowed ? "허용" : "차단"}</dd>
          </div>
          <div>
            <dt>시작 가능</dt>
            <dd>{liveEnabled ? "가능" : "불가"}</dd>
          </div>
          <div>
            <dt>봇 상태</dt>
            <dd>{s?.botStatusLabel ?? "대기 중"}</dd>
          </div>
          <div>
            <dt>활성 전략</dt>
            <dd>{s?.activeStrategy?.name ?? "미선택"}</dd>
          </div>
          <div>
            <dt>파라미터 해시</dt>
            <dd>{s?.activeStrategy?.paramsHash ?? "데이터 없음"}</dd>
          </div>
          <div>
            <dt>안전 상태</dt>
            <dd>{s?.safetyLabel ?? "데이터 없음"}</dd>
          </div>
          <div>
            <dt>liveTradingEnabled</dt>
            <dd>{flags.liveTradingEnabled ? "예" : "아니오"}</dd>
          </div>
          <div>
            <dt>allowLiveTrading</dt>
            <dd>{flags.allowLiveTrading ? "예" : "아니오"}</dd>
          </div>
          <div>
            <dt>승인자</dt>
            <dd>{gateSnapshot?.approvedBy ?? "데이터 없음"}</dd>
          </div>
          <div>
            <dt>승인 시각</dt>
            <dd>{gateSnapshot?.approvedAt ?? "데이터 없음"}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

export default function LiveTradingPage() {
  return (
    <Suspense fallback={<p className="v3-lv-note">실전 게이트를 불러오는 중…</p>}>
      <LiveTradingPageInner />
    </Suspense>
  );
}

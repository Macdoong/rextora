"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { TradingChartsPanel } from "@/components/rextora/charts/TradingChartsPanel";
import type { UnifiedMetricsSnapshot } from "@/src/lib/rextora/metrics/types";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import { displayParamsHashLabel } from "@/src/lib/rextora/displayLabels";

export default function LiveTradingPage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [riskView, setRiskView] = useState<UnifiedRiskView | null>(null);

  async function refresh() {
    const [dash, bot] = await Promise.all([
      fetch("/api/rextora/trading/dashboard").then((r) => r.json()),
      fetch("/api/rextora/bot/status").then((r) => r.json()),
    ]);
    setStatus(dash.data?.status ?? dash.status ?? null);
    setRiskView(bot.data?.riskView ?? null);
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
    botStatusLabel?: string;
    serverTpSlLabel?: string;
    safetyLabel?: string;
    activeStrategy?: { name: string; paramsHash: string };
    positions?: Array<Record<string, unknown>>;
    recentTrades?: Array<Record<string, unknown>>;
    metrics?: {
      todayRealizedPnlUsdt: number;
      todayUnrealizedPnlUsdt: number;
      accountEquity: number;
      accountReturnPct: number;
      todayFeeUsdt: number;
      todayFundingUsdt: number;
      todaySlippageUsdt: number;
    };
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

  return (
    <div className="space-y-4" data-testid="live-trading-page">
      <div>
        <h1 className="text-2xl font-bold text-white">실전 매매</h1>
        <p className="mt-1 text-sm text-slate-400">
          Binance Futures 실주문. 명시적 시작 전에는 주문이 발생하지 않습니다.
        </p>
      </div>

      <Card title="실전 준비 상태" data-testid="live-readiness">
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="실전 허용" value={s?.liveAllowed ? "허용" : "차단"} />
          <Metric label="시작 가능" value={liveEnabled ? "가능" : "불가"} />
          <Metric label="서버 손절/익절" value={s?.serverTpSlLabel ?? "-"} />
          <Metric label="안전 상태" value={s?.safetyLabel ?? "-"} />
          <Metric
            label="활성 전략"
            value={s?.activeStrategy?.name ?? "SAFE_v44_i4060"}
          />
          <Metric
            label={displayParamsHashLabel()}
            value={s?.activeStrategy?.paramsHash ?? "-"}
          />
        </div>
        {!liveEnabled && (
          <p
            className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-100"
            data-testid="live-start-helper"
          >
            {s?.liveBlockReason ??
              "설정에서 실전 거래 허용을 켜고 안전 조건을 통과해야 합니다."}
          </p>
        )}
      </Card>

      <Card title="통일 지표">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric
            label="오늘 실현"
            value={`${m?.todayRealizedPnlUsdt ?? ts?.realizedPnlUsdt ?? 0} USDT`}
          />
          <Metric
            label="오늘 미실현"
            value={`${m?.todayUnrealizedPnlUsdt ?? ts?.unrealizedPnlUsdt ?? 0} USDT`}
          />
          <Metric
            label="현재 자본"
            value={`${m?.accountEquity ?? ts?.accountEquity ?? "-"} USDT`}
          />
          <Metric
            label="계정 수익률"
            value={`${m?.accountReturnPct ?? ts?.accountReturnPct ?? 0}%`}
          />
          <Metric
            label="수수료"
            value={`${m?.todayFeeUsdt ?? ts?.feeUsdt ?? 0} USDT`}
          />
          <Metric
            label="펀딩"
            value={`${m?.todayFundingUsdt ?? ts?.fundingUsdt ?? 0} USDT`}
          />
          <Metric
            label="슬리피지"
            value={`${m?.todaySlippageUsdt ?? ts?.slippageUsdt ?? 0} USDT`}
          />
        </div>
      </Card>

      <TradingChartsPanel
        mode="LIVE"
        metrics={(s?.metrics as UnifiedMetricsSnapshot) ?? null}
        riskView={riskView}
        symbol={
          typeof s?.positions?.[0]?.symbol === "string"
            ? String(s.positions[0].symbol)
            : undefined
        }
      />

      <Card title="실전 제어">
        <div className="flex flex-wrap gap-2">
          <Button
            tone={liveEnabled ? "success" : "default"}
            data-testid="live-start"
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
            onClick={() => void run("/api/rextora/trading/cancel-all", "LIVE")}
          >
            모든 주문 취소
          </Button>
        </div>
        {message && <p className="mt-3 text-sm text-slate-300">{message}</p>}
        <div className="mt-3 space-y-1 text-xs text-slate-400">
          <p>실전 거래는 Binance Futures에 실제 주문을 실행합니다.</p>
          <p>진입 직후 거래소 서버 손절/익절을 등록합니다.</p>
          <p>손절/익절 등록 실패 시 포지션을 즉시 정리합니다.</p>
        </div>
      </Card>

      <Card title="현재 실전 포지션">
        {(s?.positions?.length ?? 0) > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th>코인</th>
                <th>방향</th>
                <th>수량</th>
                <th>진입가</th>
                <th>현재가</th>
                <th>미실현 손익</th>
                <th>보호</th>
              </tr>
            </thead>
            <tbody>
              {s?.positions?.map((p) => (
                <tr
                  key={String(p.symbol)}
                  className="border-t border-slate-900"
                >
                  <td className="py-2">{String(p.symbol)}</td>
                  <td>{String(p.side)}</td>
                  <td>{String(p.quantity)}</td>
                  <td>{String(p.entryPrice)}</td>
                  <td>{String(p.currentPrice)}</td>
                  <td>{String(p.unrealizedPnl)}</td>
                  <td>
                    <Badge>{String(p.protectionLabel)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">열린 실전 포지션이 없습니다.</p>
        )}
      </Card>
    </div>
  );
}

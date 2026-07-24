"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { TradingChartsPanel } from "@/components/rextora/charts/TradingChartsPanel";
import type { UnifiedMetricsSnapshot } from "@/src/lib/rextora/metrics/types";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import { EmptyState } from "@/components/rextora/EmptyState";
import {
  displayParamsHashLabel,
  formatDataSourceMeta,
} from "@/src/lib/rextora/displayLabels";

type Metrics = UnifiedMetricsSnapshot;

type PaperStrategy = {
  id: string;
  name: string;
  paramsHash: string;
};

type PaperSession = {
  id: string;
  strategyId: string;
  strategyHash: string;
  strategyName: string;
  status: "active" | "paused" | "stopped";
  virtualBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  tradeCount: number;
  signalCount: number;
};

type CanonicalPaperStatus =
  | "idle"
  | "starting"
  | "active"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

const PAPER_STATUS_LABEL: Record<CanonicalPaperStatus, string> = {
  idle: "대기",
  starting: "시작 중",
  active: "활성",
  paused: "일시정지",
  stopping: "종료 중",
  stopped: "종료됨",
  error: "오류",
};

export default function PaperTradingPage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [strategy, setStrategy] = useState<PaperStrategy | null>(null);
  const [session, setSession] = useState<PaperSession | null>(null);
  const [riskView, setRiskView] = useState<UnifiedRiskView | null>(null);
  const [origin, setOrigin] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [pendingPhase, setPendingPhase] = useState<
    "starting" | "stopping" | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [dash, strategies, bot, sessionRes] = await Promise.all([
        fetch("/api/rextora/trading/dashboard").then((r) => r.json()),
        fetch("/api/rextora/strategies").then((r) => r.json()),
        fetch("/api/rextora/bot/status").then((r) => r.json()),
        fetch("/api/rextora/paper/session?active=1").then((r) => r.json()),
      ]);
      setStatus(dash.data?.status ?? dash.status ?? null);
      if (dash.meta)
        setOrigin(
          formatDataSourceMeta(
            dash.meta.source,
            dash.meta.cached,
            dash.meta.durationMs,
          ),
        );
      setRiskView(bot.data?.riskView ?? null);
      const active = (strategies.data ?? []).find(
        (s: { paperActive?: boolean }) => s.paperActive,
      );
      if (active)
        setStrategy({
          id: active.id,
          name: active.name,
          paramsHash: active.paramsHash,
        });
      else setStrategy(null);
      setSession(sessionRes.data?.active ?? null);
      setIdentityError(null);
      setLoadError(null);
    } catch (e) {
      setIdentityError(
        e instanceof Error ? e.message : "모의매매 데이터를 불러오지 못했습니다.",
      );
      setLoadError("모의매매 상태를 불러오지 못했습니다.");
    } finally {
      setIdentityLoading(false);
      setPendingPhase(null);
    }
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

  const canonicalStatus: CanonicalPaperStatus = (() => {
    if (loadError && !session) return "error";
    if (pendingPhase === "starting") return "starting";
    if (pendingPhase === "stopping") return "stopping";
    if (!session) return "idle";
    if (session.status === "active") return "active";
    if (session.status === "paused") return "paused";
    if (session.status === "stopped") return "stopped";
    return "error";
  })();

  async function startPaper() {
    if (!strategy?.id) {
      setMessage("활성 모의 전략이 없습니다. 탐색 결과에서 등록하세요.");
      return;
    }
    setSessionBusy(true);
    setPendingPhase("starting");
    try {
      const res = await fetch("/api/rextora/paper/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId: strategy.id }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.error ?? "세션 생성 실패");
        return;
      }
      const botRes = await fetch("/api/bot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "PAPER" }),
      });
      const botJson = await botRes.json();
      setMessage(
        botJson.ok
          ? `모의매매 시작 · 전략 ${strategy.id} · ${strategy.paramsHash.slice(0, 12)}`
          : (botJson.error ?? botJson.message ?? "봇 시작 실패"),
      );
      await refresh();
    } finally {
      setSessionBusy(false);
      setPendingPhase(null);
    }
  }

  async function sessionAction(action: "pause" | "resume" | "stop") {
    if (!session?.id) {
      setMessage("활성 세션이 없습니다.");
      return;
    }
    setSessionBusy(true);
    if (action === "stop") setPendingPhase("stopping");
    try {
      const res = await fetch(
        `/api/rextora/paper/session/${encodeURIComponent(session.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const json = await res.json();
      if (action === "stop" && json.ok) {
        await fetch("/api/bot/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "PAPER" }),
        });
      }
      setMessage(
        json.ok
          ? `세션 ${action}: ${json.data?.session?.status ?? ""}`
          : (json.error ?? "세션 작업 실패"),
      );
      await refresh();
    } finally {
      setSessionBusy(false);
      setPendingPhase(null);
    }
  }

  const s = status as {
    modeLabel?: string;
    botStatusLabel?: string;
    todayStats?: {
      realizedPnlPct: number;
      trades: number;
      realizedPnlUsdt?: number;
      unrealizedPnlUsdt?: number;
      feeUsdt?: number;
      fundingUsdt?: number;
      slippageUsdt?: number;
      accountEquity?: number;
      accountReturnPct?: number;
    };
    metrics?: Metrics;
    operations?: { watchedSymbolCount: number; openPositionCount: number };
    positions?: Array<Record<string, unknown>>;
    recentTrades?: Array<Record<string, unknown>>;
    activeStrategy?: { name: string; paramsHash: string };
  } | null;

  const m = s?.metrics;
  const ts = s?.todayStats;

  return (
    <div className="space-y-4" data-testid="paper-trading-page">
      <div>
        <h1 className="text-2xl font-bold text-white">모의 매매</h1>
        <p className="mt-1 text-sm text-slate-400">
          활성 모의 전략을 실행합니다. 실제 주문은 없습니다.
        </p>
      </div>

      <Card title="활성 모의 전략">
        {identityLoading ? (
          <div
            className="mb-3 animate-pulse rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-6 text-sm text-slate-400"
            data-testid="paper-strategy-loading"
          >
            전략·세션 정보를 확인하는 중…
          </div>
        ) : identityError ? (
          <div
            className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-3 text-sm text-red-100"
            data-testid="paper-strategy-error"
            role="alert"
          >
            {identityError}
          </div>
        ) : (
          <div
            className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-50"
            data-testid="paper-active-strategy"
          >
            <p>
              전략 ID:{" "}
              <span className="font-mono">{strategy?.id ?? "미등록"}</span>
            </p>
            <p className="mt-1">
              이름: {strategy?.name ?? "등록된 모의 전략 없음"}
            </p>
            <p className="mt-1">
              {displayParamsHashLabel()}:{" "}
              <span className="font-mono">
                {strategy?.paramsHash ?? "—"}
              </span>
            </p>
            {session ? (
              <p className="mt-1 text-xs text-sky-100/80">
                세션 전략: {session.strategyId} ·{" "}
                {session.strategyHash.slice(0, 12)}
              </p>
            ) : null}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-4">
          <Metric
            label="전략"
            value={
              strategy?.name ?? s?.activeStrategy?.name ?? "—"
            }
          />
          <Metric
            label={displayParamsHashLabel()}
            value={strategy?.paramsHash ?? s?.activeStrategy?.paramsHash ?? "-"}
          />
          <Metric
            label="감시 코인"
            value={String(s?.operations?.watchedSymbolCount ?? 0)}
          />
          <Metric
            label="오늘 실현 손익"
            value={`${m?.todayRealizedPnlUsdt ?? ts?.realizedPnlUsdt ?? 0} USDT (${ts?.realizedPnlPct ?? 0}%)`}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Metric
            label="오늘 미실현"
            value={`${m?.todayUnrealizedPnlUsdt ?? ts?.unrealizedPnlUsdt ?? 0} USDT`}
          />
          <Metric
            label="순수익(계정)"
            value={`${m?.accountReturnPct ?? ts?.accountReturnPct ?? 0}%`}
          />
          <Metric
            label="현재 자본"
            value={`${m?.accountEquity ?? ts?.accountEquity ?? "-"} USDT`}
          />
          <Metric
            label="오늘 거래"
            value={String(ts?.trades ?? m?.todayTradeCount ?? 0)}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
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
      {origin && (
        <p className="text-xs text-slate-500">{origin} · 모의 거래 데이터</p>
      )}

      <Card title="모의매매 제어" data-testid="paper-control-bar">
        <div className="grid gap-3 md:grid-cols-4">
          <div data-testid="paper-canonical-status">
            <Metric
              label="세션 상태"
              value={PAPER_STATUS_LABEL[canonicalStatus]}
            />
          </div>
          <Metric
            label="세션 ID"
            value={session?.id ? session.id.slice(0, 18) + "…" : "—"}
          />
          <Metric
            label="가상 잔고"
            value={
              session
                ? `${session.virtualBalance.toFixed(2)} USDT`
                : "—"
            }
          />
          <Metric
            label="세션 거래"
            value={String(session?.tradeCount ?? 0)}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500" data-testid="paper-status-source">
          상태 원본: {session?.status ?? "none"} → UI: {canonicalStatus}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {canonicalStatus === "idle" || canonicalStatus === "stopped" ? (
            <Button
              tone="success"
              loading={sessionBusy}
              data-testid="paper-start"
              disabled={identityLoading || !strategy?.id}
              onClick={() => void startPaper()}
            >
              {canonicalStatus === "stopped" ? "새 세션 시작" : "모의매매 시작"}
            </Button>
          ) : null}
          {canonicalStatus === "starting" ? (
            <Button tone="muted" disabled data-testid="paper-starting">
              시작 중…
            </Button>
          ) : null}
          {canonicalStatus === "active" ? (
            <>
              <Button
                tone="warning"
                loading={sessionBusy}
                data-testid="paper-session-pause"
                onClick={() => void sessionAction("pause")}
              >
                일시정지
              </Button>
              <Button
                tone="danger"
                loading={sessionBusy}
                data-testid="paper-session-stop"
                onClick={() => void sessionAction("stop")}
              >
                종료
              </Button>
            </>
          ) : null}
          {canonicalStatus === "paused" ? (
            <>
              <Button
                tone="success"
                loading={sessionBusy}
                data-testid="paper-session-resume"
                onClick={() => void sessionAction("resume")}
              >
                재개
              </Button>
              <Button
                tone="danger"
                loading={sessionBusy}
                data-testid="paper-session-stop"
                onClick={() => void sessionAction("stop")}
              >
                종료
              </Button>
            </>
          ) : null}
          {canonicalStatus === "stopping" ? (
            <Button tone="muted" disabled data-testid="paper-stopping">
              종료 중…
            </Button>
          ) : null}
          {canonicalStatus === "stopped" ? (
            <Link
              href="/results"
              className="inline-flex items-center rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200"
              data-testid="paper-view-results"
            >
              결과 보기
            </Link>
          ) : null}
          {canonicalStatus === "error" ? (
            <Button
              tone="warning"
              data-testid="paper-retry"
              onClick={() => void refresh()}
            >
              안전 재시도
            </Button>
          ) : null}
        </div>
        {message && <p className="mt-3 text-sm text-slate-300">{message}</p>}
      </Card>

      <Card
        title="모의 피드백 · 재탐색"
        description="모의 결과를 연구 루프로 되돌립니다."
        data-testid="paper-feedback-actions"
      >
        {session ? (
          <div
            className="mb-3 grid gap-2 md:grid-cols-3"
            data-testid="paper-backtest-comparison"
          >
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm">
              <p className="text-xs text-slate-400">모의 거래 수</p>
              <p className="font-semibold text-white">{session.tradeCount}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm">
              <p className="text-xs text-slate-400">모의 신호 수</p>
              <p className="font-semibold text-white">{session.signalCount}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm">
              <p className="text-xs text-slate-400">전략 해시</p>
              <p className="font-mono text-xs text-sky-200">
                {session.strategyHash.slice(0, 12)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mb-3 text-sm text-slate-400">
            세션을 생성하면 백테스트 비교 카드가 표시됩니다.
          </p>
        )}
        <p className="rextora-helper mb-3 text-slate-400">
          활성 모의 전략을 실행합니다. 임의 가상 롱/숏 수동 진입은 제공하지
          않습니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/strategy-search?researchBasis=paper"
            className="rextora-btn-text inline-flex items-center justify-center rounded-lg border border-sky-500/40 bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            data-testid="paper-feedback-research"
          >
            결과로 재탐색
          </Link>
          <Link
            href="/backtest"
            className="rextora-btn-text inline-flex items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800/90 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700/90"
            data-testid="paper-feedback-backtest"
          >
            백테스트 비교
          </Link>
        </div>
      </Card>

      <TradingChartsPanel
        mode="PAPER"
        metrics={(s?.metrics as Metrics) ?? null}
        riskView={riskView}
        symbol={
          typeof s?.positions?.[0]?.symbol === "string"
            ? String(s.positions[0].symbol)
            : undefined
        }
      />

      <Card title="현재 모의 포지션">
        {(s?.positions?.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th>코인</th>
                  <th>방향</th>
                  <th>진입가</th>
                  <th>현재가</th>
                  <th>손절가</th>
                  <th>익절가</th>
                  <th>수익률</th>
                  <th>보유 시간</th>
                  <th>레버리지</th>
                  <th>증거금</th>
                  <th>청산가</th>
                  <th>위험 비율</th>
                  <th>현재 신호</th>
                  <th>진입 사유</th>
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
                    <td>{String(p.entryPrice)}</td>
                    <td>{String(p.currentPrice)}</td>
                    <td>{String(p.stopLoss)}</td>
                    <td>{String(p.takeProfit)}</td>
                    <td>{String(p.pnlPct)}%</td>
                    <td>{String(p.holdTimeLabel)}</td>
                    <td>
                      {p.leverage != null ? `${String(p.leverage)}배` : "-"}
                    </td>
                    <td>
                      {p.margin != null
                        ? `${Number(p.margin).toFixed(2)} USDT`
                        : "-"}
                    </td>
                    <td>
                      {p.liquidationPrice != null
                        ? String(p.liquidationPrice)
                        : "제공되지 않음"}
                    </td>
                    <td>
                      {p.riskPct != null
                        ? `${String(p.riskPct)}%`
                        : "계산 정보 없음"}
                    </td>
                    <td>{String(p.currentSignal ?? "-")}</td>
                    <td className="max-w-[280px] whitespace-normal">
                      {String(p.entryReason ?? "-")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="열린 모의 포지션이 없습니다. 모의 매매를 시작하면 진입 조건을 통과한 포지션이 여기에 표시됩니다." />
        )}
      </Card>

      <Card title="최근 모의 거래">
        {(s?.recentTrades?.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th>시간</th>
                  <th>코인</th>
                  <th>방향</th>
                  <th>결과</th>
                  <th>순손익</th>
                  <th>청산 이유</th>
                </tr>
              </thead>
              <tbody>
                {s?.recentTrades?.slice(0, 20).map((t, i) => (
                  <tr key={i} className="border-t border-slate-900">
                    <td className="py-2">{String(t.time)}</td>
                    <td>{String(t.symbol)}</td>
                    <td>{String(t.direction)}</td>
                    <td>
                      <Badge>{String(t.resultLabel)}</Badge>
                    </td>
                    <td>
                      {t.netPnl != null ? `${t.netPnl} USDT` : ""}{" "}
                      {t.pnlPct != null ? `(${t.pnlPct}%)` : ""}
                    </td>
                    <td>{String(t.exitReasonLabel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="완료된 모의 거래가 없습니다. 모의 포지션이 청산되면 거래 결과가 표시됩니다." />
        )}
      </Card>
    </div>
  );
}

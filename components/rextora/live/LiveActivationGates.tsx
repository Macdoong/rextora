"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui/primitives";
import type { LiveReadinessChecklistItem } from "@/src/lib/rextora/liveReadinessChecklist";
import { SAFE_STRATEGY_ID } from "@/src/lib/rextora/strategy/strategyTypes";

type ReadinessPayload = {
  checklist: LiveReadinessChecklistItem[];
  remainingBlocks: string[];
  liveReady: boolean;
  liveStatus: string;
  liveAllowed: boolean;
};

type GateRow = {
  id: string;
  label: string;
  passed: boolean;
  reasonKo: string;
};

type ApiEnvelope<T> = { ok: boolean; data: T; error?: string };

function checklistPassed(item: LiveReadinessChecklistItem | undefined): boolean {
  return item?.status === "passed";
}

function findItem(
  checklist: LiveReadinessChecklistItem[],
  id: string,
): LiveReadinessChecklistItem | undefined {
  return checklist.find((c) => c.id === id);
}

function buildGateRows(
  data: ReadinessPayload | null,
  approvalOk: boolean | null,
  riskOk: boolean | null,
): GateRow[] {
  const checklist = data?.checklist ?? [];
  const conn = findItem(checklist, "binance_connection");
  const order = findItem(checklist, "order_permission");
  const futures = findItem(checklist, "futures_permission");
  const emergency = findItem(checklist, "emergency_status");
  const liveSetting = findItem(checklist, "live_setting");

  const permsOk =
    checklistPassed(order) && checklistPassed(futures);

  return [
    {
      id: "connection",
      label: "연결",
      passed: checklistPassed(conn),
      reasonKo: conn
        ? conn.description
        : "Binance 연결 진단을 아직 확인하지 않았습니다.",
    },
    {
      id: "permissions",
      label: "권한",
      passed: permsOk,
      reasonKo: permsOk
        ? "주문·Futures 권한이 정상입니다."
        : "주문 또는 Futures 권한이 부족합니다. 연결 확인을 실행하세요.",
    },
    {
      id: "risk",
      label: "위험 설정",
      passed: riskOk === true,
      reasonKo:
        riskOk === true
          ? "위험 한도가 정상 범위입니다."
          : riskOk === false
            ? "위험 한도가 초과되었거나 설정을 확인해야 합니다."
            : "위험 상태를 불러오는 중입니다.",
    },
    {
      id: "emergency",
      label: "긴급 중단",
      passed: checklistPassed(emergency),
      reasonKo: emergency
        ? emergency.description
        : "긴급 중단 상태를 확인하세요.",
    },
    {
      id: "allowLiveTrading",
      label: "실전 거래 허용",
      passed: Boolean(data?.liveAllowed) || checklistPassed(liveSetting),
      reasonKo: data?.liveAllowed
        ? "설정에서 실전 거래가 허용되어 있습니다."
        : "설정에서 실전 거래 허용을 켜야 합니다. (허용만으로는 주문이 시작되지 않습니다.)",
    },
    {
      id: "operator_approval",
      label: "운영자 승인",
      passed: approvalOk === true,
      reasonKo:
        approvalOk === true
          ? "전략 실전 승인이 기록되어 있습니다."
          : approvalOk === false
            ? "실전매매는 명시적 운영자 승인 없이는 차단됩니다."
            : "승인 상태를 불러오는 중입니다.",
    },
  ];
}

/**
 * Live activation gate panel — readiness / diagnostics / dry-run only.
 * Never starts the LIVE bot.
 */
export function LiveActivationGates() {
  const searchParams = useSearchParams();
  const candidateId = searchParams.get("candidate");
  const candidateRunId = searchParams.get("runId");
  const [data, setData] = useState<ReadinessPayload | null>(null);
  const [approvalOk, setApprovalOk] = useState<boolean | null>(null);
  const [riskOk, setRiskOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagBusy, setDiagBusy] = useState(false);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [readyRes, approveRes, riskRes] = await Promise.all([
        fetch("/api/rextora/live/readiness", { cache: "no-store" }),
        fetch("/api/rextora/strategy/approve", { cache: "no-store" }),
        fetch("/api/rextora/risk", { cache: "no-store" }),
      ]);
      const readyBody = (await readyRes.json()) as ApiEnvelope<ReadinessPayload>;
      if (readyBody.ok) setData(readyBody.data);

      const approveBody = (await approveRes.json()) as ApiEnvelope<{
        approval?: { verifiedForLive?: boolean };
      }>;
      setApprovalOk(Boolean(approveBody.data?.approval?.verifiedForLive));

      const riskBody = (await riskRes.json()) as ApiEnvelope<{
        risk?: { riskState?: string };
      }>;
      const state = riskBody.data?.risk?.riskState ?? "";
      setRiskOk(state === "정상" || state === "주의");
    } catch {
      setMessage("게이트 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function runDiagnostics() {
    setDiagBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rextora/binance/diagnostics", {
        method: "POST",
        cache: "no-store",
      });
      const body = await res.json();
      setMessage(
        body.ok
          ? "연결 진단을 완료했습니다. 게이트를 갱신합니다."
          : (body.error ?? "연결 진단에 실패했습니다."),
      );
      await load();
    } catch {
      setMessage("연결 진단 요청에 실패했습니다.");
    } finally {
      setDiagBusy(false);
    }
  }

  async function runDryRun() {
    setPreflightBusy(true);
    setMessage(null);
    try {
      const strategiesRes = await fetch("/api/rextora/strategies");
      const strategiesJson = await strategiesRes.json();
      const list = (strategiesJson.data ?? []) as Array<{
        id: string;
        paramsHash: string;
        liveActive?: boolean;
        paperActive?: boolean;
      }>;
      const fromQuery = candidateId
        ? list.find((s) => s.id === candidateId)
        : null;
      const selected =
        fromQuery ??
        list.find((s) => s.liveActive && s.id !== SAFE_STRATEGY_ID) ??
        list.find((s) => s.paperActive && s.id !== SAFE_STRATEGY_ID) ??
        null;
      if (!selected?.id || !selected.paramsHash) {
        setMessage(
          "드라이런에 사용할 비-SAFE 전략을 찾지 못했습니다. Results/Backtest에서 후보를 선택하세요.",
        );
        return;
      }
      if (selected.id === SAFE_STRATEGY_ID) {
        setMessage("SAFE 원본으로는 드라이런 후보를 등록하지 않습니다.");
        return;
      }
      const executionKey = `dry_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const res = await fetch("/api/rextora/live/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          executionKey,
          strategyId: selected.id,
          strategyHash: selected.paramsHash,
          symbol: "BTCUSDT",
          side: "BUY",
          quantity: 0.001,
        }),
      });
      const body = await res.json();
      const payload = body.data ?? body;
      const record = payload?.record;
      if (body.ok && record) {
        const path = Array.isArray(record.transitions)
          ? record.transitions
              .map((t: { newState?: string }) => t.newState)
              .filter(Boolean)
              .join(" → ")
          : record.state;
        const runNote = candidateRunId ? ` · run=${candidateRunId}` : "";
        setMessage(
          `${payload.messageKo ?? "드라이런 기록 완료"} · 전략=${record.strategyId} · 해시=${record.strategyHash}${runNote} · 상태=${record.state} · 전이=${path} · key=${record.executionKey} · 거래소호출=${record.exchangeCalled === false ? "없음" : "?"} · 실전 봇은 시작되지 않았습니다.`,
        );
      } else {
        setMessage(
          `드라이런 실패: ${body.error ?? payload?.message ?? "조건 미충족"}. 실전 봇은 시작되지 않았습니다.`,
        );
      }
      await load();
    } catch {
      setMessage("드라이런 요청에 실패했습니다. 실전 봇은 시작되지 않았습니다.");
    } finally {
      setPreflightBusy(false);
    }
  }

  const gates = buildGateRows(data, approvalOk, riskOk);
  const allPassed = gates.every((g) => g.passed) && Boolean(data?.liveReady);
  const blockedWithoutApproval = approvalOk !== true || !data?.liveAllowed;

  return (
    <Card
      title="실전 활성화 게이트"
      action={
        <Badge tone={allPassed ? "success" : "warning"}>
          {allPassed ? "조건 충족" : "차단 중"}
        </Badge>
      }
      data-testid="live-activation-gates"
    >
      <p className="rextora-helper mb-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-orange-100">
        실전매매는 명시적 승인·시작 없이는 절대 자동 시작되지 않습니다.
        아래 게이트는 점검용이며, 이 패널의 버튼은 LIVE 봇을 시작하지 않습니다.
      </p>

      {candidateId ? (
        <p
          className="rextora-helper mb-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sky-100"
          data-testid="live-candidate-identity"
        >
          검토 후보: {candidateId}
          {candidateRunId ? ` · Backtest Run ${candidateRunId}` : ""}
          （SAFE로 대체하지 않음）
        </p>
      ) : null}

      {loading && !data ? (
        <p className="rextora-helper text-slate-400">게이트를 불러오는 중…</p>
      ) : (
        <div className="space-y-2">
          {gates.map((gate) => (
            <div
              key={gate.id}
              className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2"
              data-testid={`live-gate-${gate.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rextora-body font-medium text-slate-100">
                  {gate.label}
                </span>
                <Badge tone={gate.passed ? "success" : "danger"}>
                  {gate.passed ? "통과" : "실패"}
                </Badge>
              </div>
              <p className="rextora-helper mt-1.5 text-slate-400">
                {gate.reasonKo}
              </p>
            </div>
          ))}
        </div>
      )}

      {data?.remainingBlocks?.length ? (
        <div className="rextora-helper mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-orange-100">
          <p className="font-medium">남은 차단 사유</p>
          <ol className="mt-1 list-decimal pl-5">
            {data.remainingBlocks.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {blockedWithoutApproval && (
        <p
          className="rextora-helper mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-100"
          data-testid="live-gate-blocked-notice"
        >
          실전 거래 허용과 운영자 승인이 모두 필요합니다. 현재 LIVE는
          차단되어 있습니다.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          tone="default"
          loading={diagBusy}
          data-testid="live-gate-diagnostics"
          onClick={() => void runDiagnostics()}
        >
          연결 확인
        </Button>
        <Link
          href="/settings#risk"
          className="rextora-btn-text inline-flex items-center justify-center rounded-lg border border-slate-600/80 bg-slate-800/90 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700/90"
          data-testid="live-gate-risk-link"
        >
          위험 설정 확인
        </Link>
        <Button
          tone="warning"
          loading={preflightBusy}
          data-testid="live-gate-dry-run"
          onClick={() => void runDryRun()}
        >
          드라이런 실행
        </Button>
        <Link
          href="/results"
          className="rextora-btn-text inline-flex items-center justify-center rounded-lg border border-sky-500/40 bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          data-testid="live-gate-approval-link"
        >
          실전매매 승인 요청
        </Link>
        <Button tone="muted" data-testid="live-gate-refresh" onClick={() => void load()}>
          새로고침
        </Button>
      </div>

      {message && (
        <p className="mt-3 text-sm text-slate-300" data-testid="live-gate-message">
          {message}
        </p>
      )}
    </Card>
  );
}

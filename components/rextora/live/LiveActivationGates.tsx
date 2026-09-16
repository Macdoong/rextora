"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { V3Card } from "@/components/rextora/v3/V3Card";
import type { LiveReadinessChecklistItem } from "@/src/lib/rextora/liveReadinessChecklist";
import { SAFE_STRATEGY_ID } from "@/src/lib/rextora/strategy/strategyTypes";
import {
  LIVE_GATE_APPROVAL_NOT_LIVE_START,
  LIVE_GATE_APPROVAL_REQUEST_UNAVAILABLE,
  LIVE_GATE_APPROVED_STRATEGY_LABEL,
  LIVE_GATE_CURRENT_STRATEGY_LABEL,
  LIVE_GATE_PARAMS_IDENTITY_LABEL,
  LIVE_GATE_REVIEW_STRATEGY_LABEL,
  LIVE_GATE_UNAVAILABLE,
  liveGateApprovalPresentation,
  liveGateExecutionKindLabel,
  liveGateFailurePresentation,
  liveGateMapChecklistItem,
  liveGateReadinessSummary,
  liveGateShortIdentity,
  liveGateTargetAuthorityPresentation,
  liveGateThreeWayTargetMatch,
  type LiveGateOperatorChecklistItem,
  type LiveGateWorkflowStatus,
} from "@/src/lib/rextora/live/liveGateOperatorPresentation";
import { LiveGateChecklist } from "./operator/LiveGateChecklist";
import { LiveReadinessCard } from "./operator/LiveReadinessCard";
import {
  OperatorApprovalPanel,
  type LiveApprovalHistoryRow,
} from "./operator/OperatorApprovalPanel";

type ReadinessPayload = {
  checklist: LiveReadinessChecklistItem[];
  remainingBlocks: string[];
  liveReady: boolean;
  liveStatus: string;
  liveAllowed: boolean;
};

type ApiEnvelope<T> = { ok: boolean; data: T; error?: string };

/**
 * Live activation gate panel — readiness / diagnostics / dry-run only.
 * Never starts the LIVE bot.
 */
export function LiveActivationGates({
  onSnapshot,
}: {
  onSnapshot?: (snapshot: {
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
  }) => void;
}) {
  const searchParams = useSearchParams();
  const candidateId =
    searchParams.get("candidate") ?? searchParams.get("strategyId");
  const candidateRunId = searchParams.get("runId");
  const candidateSessionId = searchParams.get("sessionId");
  const candidateSymbol = searchParams.get("symbol");
  const [data, setData] = useState<ReadinessPayload | null>(null);
  const [approvalOk, setApprovalOk] = useState<boolean | null>(null);
  const [verifiedForLive, setVerifiedForLive] = useState<boolean | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approvedBy, setApprovedBy] = useState<string | null>(null);
  const [approvalLabel, setApprovalLabel] = useState<string | null>(null);
  const [approvedStrategyId, setApprovedStrategyId] = useState<string | null>(null);
  const [currentStrategyId, setCurrentStrategyId] = useState<string | null>(null);
  const [paramsHash, setParamsHash] = useState<string | null>(null);
  const [strategyHash, setStrategyHash] = useState<string | null>(null);
  const [approvedBacktestRunId, setApprovedBacktestRunId] = useState<string | null>(null);
  const [approvedBacktestResultHash, setApprovedBacktestResultHash] = useState<
    string | null
  >(null);
  const [mismatchReason, setMismatchReason] = useState<string | null>(null);
  const [executionKind, setExecutionKind] = useState<string | null>(null);
  const [executionTargetError, setExecutionTargetError] = useState<string | null>(
    null,
  );
  const [executionParamsHash, setExecutionParamsHash] = useState<string | null>(
    null,
  );
  const [executionStrategyHash, setExecutionStrategyHash] = useState<
    string | null
  >(null);
  const [executionSymbol, setExecutionSymbol] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] =
    useState<LiveGateWorkflowStatus>("none");
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<
    LiveApprovalHistoryRow[]
  >([]);
  const [riskOk, setRiskOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagBusy, setDiagBusy] = useState(false);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
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
        approval?: {
          verifiedForLive?: boolean;
          validForCurrentLiveTarget?: boolean;
          approvedAt?: string | null;
          approvedBy?: string | null;
          statusLabel?: string | null;
          mismatchReason?: string | null;
          strategyId?: string | null;
          paramsHash?: string | null;
          target?: {
            strategyId?: string | null;
            paramsHash?: string | null;
            strategyHash?: string | null;
            backtestRunId?: string | null;
            backtestResultHash?: string | null;
          } | null;
          currentTarget?: {
            strategyId?: string | null;
            paramsHash?: string | null;
            strategyHash?: string | null;
          } | null;
          executionTarget?: {
            strategyId?: string | null;
            paramsHash?: string | null;
            strategyHash?: string | null;
            symbol?: string | null;
            executionKind?: string | null;
          } | null;
          executionTargetError?: string | null;
        };
        workflow?: {
          pending?: { requestId?: string } | null;
          latest?: { status?: LiveGateWorkflowStatus } | null;
          history?: LiveApprovalHistoryRow[];
          liveStartTarget?: { strategyId?: string | null } | null;
        };
      }>;
      const approval = approveBody.data?.approval;
      const verified = Boolean(approval?.verifiedForLive);
      const validForStart = approval?.validForCurrentLiveTarget === true;
      setVerifiedForLive(approval?.verifiedForLive ?? null);
      setApprovalOk(validForStart);
      setApprovedAt(approval?.approvedAt ?? null);
      setApprovedBy(approval?.approvedBy ?? null);
      setApprovalLabel(approval?.statusLabel ?? null);
      setApprovedStrategyId(
        approval?.target?.strategyId ?? approval?.strategyId ?? null,
      );
      setCurrentStrategyId(
        approval?.executionTarget?.strategyId ??
          approval?.currentTarget?.strategyId ??
          approveBody.data?.workflow?.liveStartTarget?.strategyId ??
          null,
      );
      setParamsHash(
        approval?.target?.paramsHash ?? approval?.paramsHash ?? null,
      );
      setStrategyHash(approval?.target?.strategyHash ?? null);
      setApprovedBacktestRunId(approval?.target?.backtestRunId ?? null);
      setApprovedBacktestResultHash(approval?.target?.backtestResultHash ?? null);
      setMismatchReason(verified && !validForStart ? approval?.mismatchReason ?? null : null);
      setExecutionKind(approval?.executionTarget?.executionKind ?? null);
      setExecutionTargetError(approval?.executionTargetError ?? null);
      setExecutionParamsHash(approval?.executionTarget?.paramsHash ?? null);
      setExecutionStrategyHash(approval?.executionTarget?.strategyHash ?? null);
      setExecutionSymbol(approval?.executionTarget?.symbol ?? null);
      const history = Array.isArray(approveBody.data?.workflow?.history)
        ? approveBody.data.workflow.history
        : [];
      setApprovalHistory(history);
      setPendingRequestId(
        approveBody.data?.workflow?.pending?.requestId?.trim() || null,
      );
      const latestStatus = approveBody.data?.workflow?.latest?.status;
      setWorkflowStatus(
        latestStatus === "pending" ||
          latestStatus === "approved" ||
          latestStatus === "rejected" ||
          latestStatus === "revoked"
          ? latestStatus
          : history.length
            ? "none"
            : "none",
      );

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

  const emergencyStopActive = useMemo(() => {
    const item = data?.checklist.find((c) => c.id === "emergency_status");
    return item?.status === "blocked";
  }, [data]);

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
        strategyHash?: string | null;
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
          "드라이런에 사용할 비-SAFE 전략을 찾지 못했습니다. 탐색 결과/백테스트에서 전략을 선택하세요.",
        );
        return;
      }
      if (selected.id === SAFE_STRATEGY_ID) {
        setMessage("SAFE 원본으로는 드라이런 검토 대상을 등록하지 않습니다.");
        return;
      }
      let strategyHash = selected.strategyHash ?? null;
      if (!strategyHash) {
        const detailRes = await fetch(
          `/api/rextora/strategies?id=${encodeURIComponent(selected.id)}`,
        );
        const detailBody = (await detailRes.json()) as ApiEnvelope<{
          strategyHash?: string;
        }>;
        strategyHash = detailBody.data?.strategyHash ?? null;
      }
      if (!strategyHash) {
        setMessage(
          "드라이런에 필요한 strategyHash를 확인하지 못했습니다. 전략을 다시 등록하거나 백테스트를 실행하세요.",
        );
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
          strategyHash,
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

  const items: LiveGateOperatorChecklistItem[] = useMemo(() => {
    const threeWayOk = liveGateThreeWayTargetMatch({
      reviewStrategyId: candidateId,
      executionStrategyId: currentStrategyId,
      approvedStrategyId,
      verifiedForLive,
    });
    const approvalPassed = approvalOk === true && threeWayOk;
    const checklist = (data?.checklist ?? []).map((item) =>
      liveGateMapChecklistItem({
        id: item.id,
        label: item.label,
        status: item.status,
        description: item.description,
        nextAction: item.nextAction,
      }),
    );
    checklist.push(
      liveGateMapChecklistItem({
        id: "risk_configuration",
        label: "위험 설정",
        status:
          riskOk === true ? "passed" : riskOk === false ? "blocked" : "needed",
        description:
          riskOk === true
            ? "위험 한도가 정상 범위입니다."
            : riskOk === false
              ? "위험 한도가 초과되었거나 설정을 확인해야 합니다."
              : "위험 상태를 불러오는 중입니다.",
        nextAction:
          riskOk === true
            ? "한도 사용량을 계속 확인하세요."
            : "위험 설정을 확인하세요.",
      }),
      liveGateMapChecklistItem({
        id: "operator_approval",
        label: "운영자 승인",
        status: approvalPassed
          ? "passed"
          : approvalOk === false || threeWayOk === false
            ? "blocked"
            : "needed",
        description: approvalPassed
          ? "검토 대상, 실제 실행 대상, 승인된 전략이 일치합니다."
          : mismatchReason
            ? mismatchReason
            : "실전매매는 명시적 운영자 승인 없이는 차단됩니다.",
        nextAction: "운영자 승인이 필요합니다.",
      }),
    );
    return checklist;
  }, [
    data,
    approvalOk,
    riskOk,
    mismatchReason,
    candidateId,
    currentStrategyId,
    approvedStrategyId,
    verifiedForLive,
  ]);

  useEffect(() => {
    if (!onSnapshot) return;
    onSnapshot({
      checklist: data?.checklist ?? [],
      remainingBlocks: data?.remainingBlocks ?? [],
      liveReady: Boolean(data?.liveReady),
      liveAllowed: Boolean(data?.liveAllowed),
      approvalOk,
      riskOk,
      approvedAt,
      approvedBy,
      approvalLabel,
      emergencyStopActive,
      gatePassed: items.filter((item) => item.status === "passed").length,
      gateTotal: items.length,
    });
  }, [
    onSnapshot,
    data,
    approvalOk,
    riskOk,
    approvedAt,
    approvedBy,
    approvalLabel,
    emergencyStopActive,
    items,
  ]);

  const readiness = liveGateReadinessSummary({
    liveReady: data?.liveReady,
    liveAllowed: data?.liveAllowed,
    emergencyStopActive,
    failedGateCount: items.filter((item) => item.status !== "passed").length,
  });
  const canRequest = Boolean(candidateId) && !pendingRequestId;
  const approvedRequestId =
    approvalHistory.find((row) => row.status === "approved")?.requestId ?? null;
  const requestDisabledReason = pendingRequestId
    ? "이미 대기 중인 승인 요청이 있습니다."
    : candidateId
      ? LIVE_GATE_APPROVAL_REQUEST_UNAVAILABLE
      : "요청 대상 전략이 없습니다. 전략·Backtest를 선택한 뒤 다시 시도하세요.";
  const threeWayOk = liveGateThreeWayTargetMatch({
    reviewStrategyId: candidateId,
    executionStrategyId: currentStrategyId,
    approvedStrategyId,
    verifiedForLive,
  });
  const approvalPassed = approvalOk === true && threeWayOk;
  const approval = liveGateApprovalPresentation({
    verifiedForLive,
    approvedAt,
    approvedBy,
    statusLabel: approvalLabel,
    workflowStatus,
    canRequest,
    validForCurrentLiveTarget: approvalPassed,
    mismatchReason: threeWayOk
      ? mismatchReason
      : "검토 대상, 실제 실행 대상, 승인된 전략이 일치해야 합니다.",
  });
  const targetAuthority = liveGateTargetAuthorityPresentation({
    verifiedForLive,
    reviewStrategyId: candidateId,
    approvedStrategyId,
    currentStrategyId,
    paramsHash,
    strategyHash,
    backtestRunId: approvedBacktestRunId,
    backtestResultHash: approvedBacktestResultHash,
    validForCurrentLiveTarget: approvalPassed,
    mismatchReason,
  });

  async function postApprovalAction(action: "request" | "approve" | "reject" | "revoke") {
    setApprovalBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rextora/strategy/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          strategyId: candidateId,
          backtestRunId: candidateRunId,
          paperSessionId: candidateSessionId,
          symbol: candidateSymbol,
          requestId:
            action === "revoke" ? approvedRequestId : pendingRequestId,
          requestReason,
          reviewReason,
          revokeReason: reviewReason,
          confirmationText,
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        data?: { message?: string };
      };
      setMessage(
        body.message ??
          body.data?.message ??
          body.error ??
          (body.ok ? "완료" : "요청을 처리하지 못했습니다."),
      );
      setConfirmationText("");
      await load();
    } catch {
      setMessage("승인 워크플로우 요청에 실패했습니다. 실전 매매는 시작되지 않았습니다.");
    } finally {
      setApprovalBusy(false);
    }
  }
  const primaryBlock = data?.remainingBlocks?.[0]
    ? liveGateFailurePresentation(data.remainingBlocks[0])
    : null;
  const blockedWithoutApproval = approvalPassed !== true || !data?.liveAllowed;

  const passedGateCount = items.filter((item) => item.status === "passed").length;
  const targetsUnavailable =
    targetAuthority.reviewStrategyKo === LIVE_GATE_UNAVAILABLE &&
    targetAuthority.approvedStrategyKo === LIVE_GATE_UNAVAILABLE &&
    targetAuthority.currentStrategyKo === LIVE_GATE_UNAVAILABLE;
  const approvalNeedsAction =
    Boolean(candidateId) ||
    Boolean(pendingRequestId) ||
    workflowStatus === "pending" ||
    workflowStatus === "approved";

  const targetNotes = (
    <>
      {executionTargetError ? (
        <p className="v3-lv-blocked">{executionTargetError}</p>
      ) : null}
      {targetAuthority.showMismatch ? (
        <p className="v3-lv-mismatch" data-testid="live-approval-mismatch">
          {targetAuthority.mismatchKo}
        </p>
      ) : null}
      {targetAuthority.technical ? (
        <p className="v3-lv-note" data-testid="live-approval-technical">
          {targetAuthority.technical}
          {executionStrategyHash
            ? ` · executionHash ${executionStrategyHash}`
            : ""}
        </p>
      ) : null}
    </>
  );

  const approvalPanel = (hideHeadline: boolean) => (
    <OperatorApprovalPanel
      hideHeadline={hideHeadline}
      statusKo={approval.statusKo}
      approvedAt={approval.approvedAt}
      approvedBy={approval.approvedBy}
      workflowStatusKo={approval.workflowStatusKo}
      requestActionKo={approval.requestActionKo}
      nextActionKo={approval.nextActionKo}
      canRequest={canRequest}
      requestDisabledReason={requestDisabledReason}
      targetStrategy={candidateId}
      targetBacktestRunId={candidateRunId}
      targetPaperSessionId={candidateSessionId}
      targetSymbol={candidateSymbol}
      blockers={data?.remainingBlocks ?? []}
      pendingRequestId={pendingRequestId}
      history={approvalHistory}
      identityAuthorityGap
      requestReason={requestReason}
      reviewReason={reviewReason}
      confirmationText={confirmationText}
      busy={approvalBusy}
      onRequestReasonChange={setRequestReason}
      onReviewReasonChange={setReviewReason}
      onConfirmationTextChange={setConfirmationText}
      onRequest={() => void postApprovalAction("request")}
      onApprove={() => void postApprovalAction("approve")}
      onReject={() => void postApprovalAction("reject")}
      onRevoke={() => void postApprovalAction("revoke")}
    />
  );

  const diagnosticsToolbar = (
    <div className="v3-lv-toolbar v3-lv-diagnostics">
      <Button
        tone="default"
        loading={diagBusy}
        data-testid="live-gate-diagnostics"
        onClick={() => void runDiagnostics()}
      >
        연결 확인
      </Button>
      <Button
        tone="muted"
        data-testid="live-gate-refresh"
        onClick={() => void load()}
      >
        새로고침
      </Button>
      <Button
        tone="warning"
        loading={preflightBusy}
        data-testid="live-gate-dry-run"
        onClick={() => void runDryRun()}
      >
        드라이런 실행
      </Button>
    </div>
  );

  const approvalRequestControl = (
    <Button
      tone="default"
      data-testid="live-gate-approval-link"
      disabled={!canRequest || approvalBusy}
      onClick={() => void postApprovalAction("request")}
    >
      {approval.requestActionKo}
    </Button>
  );

  return (
    <div className="v3-lv-grid" data-testid="live-activation-gates">
      {targetsUnavailable ? (
        <V3Card
          className="v3-lv-full"
          title="실전 대상"
          meta="검토 · 승인 · 실행"
          interactive
        >
          <div
            className="v3-lv-stack"
            data-testid="live-approval-target-authority"
          >
            <div className="v3-lv-flow" data-testid="live-target-flow">
              <div className="v3-lv-flow-step">
                <span>검토 대상</span>
                <b data-testid="live-review-strategy">
                  {targetAuthority.reviewStrategyKo}
                </b>
              </div>
              <span className="v3-lv-flow-arrow" aria-hidden>
                →
              </span>
              <div className="v3-lv-flow-step">
                <span>승인 대상</span>
                <b data-testid="live-approved-strategy">
                  {targetAuthority.approvedStrategyKo}
                </b>
              </div>
              <span className="v3-lv-flow-arrow" aria-hidden>
                →
              </span>
              <div className="v3-lv-flow-step">
                <span>실행 대상</span>
                <b data-testid="live-current-strategy">
                  {targetAuthority.currentStrategyKo}
                </b>
              </div>
            </div>
            <small data-testid="live-candidate-identity">
              {candidateId
                ? `검토 대상: ${candidateId}${candidateRunId ? ` · Backtest ${candidateRunId}` : ""} （SAFE로 대체하지 않음）`
                : LIVE_GATE_UNAVAILABLE}
            </small>
            {targetNotes}
          </div>
        </V3Card>
      ) : (
        <V3Card
          className="v3-lv-s5 v3-lv-target-detail"
          title="실전 대상"
          meta="검토 · 승인 · 실행"
          interactive
        >
          <div className="v3-lv-stack" data-testid="live-approval-target-authority">
            <div className="v3-lv-metric">
              <span>{LIVE_GATE_REVIEW_STRATEGY_LABEL}</span>
              <b data-testid="live-review-strategy">
                {targetAuthority.reviewStrategyKo}
              </b>
              <small data-testid="live-candidate-identity">
                {candidateId
                  ? `검토 대상: ${candidateId}${candidateRunId ? ` · Backtest ${candidateRunId}` : ""} （SAFE로 대체하지 않음）`
                  : LIVE_GATE_UNAVAILABLE}
              </small>
            </div>
            <div className="v3-lv-metric">
              <span>{LIVE_GATE_APPROVED_STRATEGY_LABEL}</span>
              <b data-testid="live-approved-strategy">
                {targetAuthority.approvedStrategyKo}
              </b>
              <small>
                {LIVE_GATE_PARAMS_IDENTITY_LABEL} {targetAuthority.paramsIdentityKo}
                {targetAuthority.backtestKo !== LIVE_GATE_UNAVAILABLE
                  ? ` · Backtest ${targetAuthority.backtestKo}`
                  : ""}
              </small>
            </div>
            <div className="v3-lv-metric">
              <span>{LIVE_GATE_CURRENT_STRATEGY_LABEL}</span>
              <b data-testid="live-current-strategy">
                {targetAuthority.currentStrategyKo}
              </b>
              <small>
                실행 유형 {liveGateExecutionKindLabel(executionKind)}
                {executionSymbol ? ` · ${executionSymbol}` : ""}
                {executionParamsHash
                  ? ` · ${liveGateShortIdentity(executionParamsHash)}`
                  : ""}
              </small>
            </div>
            {targetNotes}
          </div>
        </V3Card>
      )}

      <V3Card
        className={targetsUnavailable ? "v3-lv-full" : "v3-lv-s7"}
        title="실전 진입 조건"
        meta={
          items.length
            ? `${passedGateCount} / ${items.length}`
            : "모두 통과해야 함"
        }
        interactive
      >
        <LiveReadinessCard
          tone={readiness.tone}
          labelKo={readiness.labelKo}
          detailKo={
            primaryBlock
              ? `${primaryBlock.titleKo} ${primaryBlock.nextActionKo}`
              : `통과 ${passedGateCount} / ${items.length || 0}`
          }
        />
        {loading && !data ? (
          <p className="v3-lv-note">게이트를 불러오는 중…</p>
        ) : (
          <>
            <LiveGateChecklist items={items} />
            <div className="sr-only">
              <div data-testid="live-gate-connection" />
              <div data-testid="live-gate-permissions" />
              <div data-testid="live-gate-risk" />
              <div data-testid="live-gate-emergency" />
              <div data-testid="live-gate-allowLiveTrading" />
              <div data-testid="live-gate-operator_approval" />
            </div>
          </>
        )}
        {data?.remainingBlocks?.length ? (
          <div className="v3-lv-blocker" style={{ marginTop: 12 }}>
            <strong>남은 차단 사유</strong>
            <ol>
              {data.remainingBlocks.map((reason) => {
                const mapped = liveGateFailurePresentation(reason);
                return (
                  <li key={reason}>
                    {mapped.titleKo} {mapped.reasonKo}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        {blockedWithoutApproval ? (
          <p className="v3-lv-blocked" data-testid="live-gate-blocked-notice">
            실전 거래 허용과 운영자 승인이 모두 필요합니다. 현재 실전 매매는
            차단되어 있습니다.
          </p>
        ) : null}
        {diagnosticsToolbar}
      </V3Card>

      <V3Card
        className="v3-lv-full"
        title="승인"
        meta={approvalNeedsAction ? "요청 · 검토 · 이력" : "실전 승인 전"}
        interactive
      >
        {approvalNeedsAction ? (
          <>
            <p className="v3-lv-note">
              실전매매는 명시적 승인·시작 없이는 절대 자동 시작되지 않습니다.
              이 패널의 승인 버튼은 실전 봇을 시작하지 않습니다.
            </p>
            {approvalPanel(false)}
            <div className="v3-lv-toolbar" style={{ marginTop: 12 }}>
              {approvalRequestControl}
            </div>
          </>
        ) : (
          <>
            <div
              className="v3-lv-approval-idle"
              data-testid="live-approval-idle"
            >
              <b data-testid="live-approval-status">{approval.statusKo}</b>
              <p className="v3-lv-explain">검토 대상 없음</p>
              <p className="v3-lv-explain" data-testid="live-approval-next">
                현재 승인 요청 불가
              </p>
              <p
                className="v3-lv-note"
                data-testid="live-approval-workflow-status"
              >
                {approval.workflowStatusKo}
              </p>
              <p className="v3-lv-note" data-testid="live-approval-not-live">
                {LIVE_GATE_APPROVAL_NOT_LIVE_START}
              </p>
              <p className="v3-lv-note" data-testid="live-approval-time">
                {approval.approvedAt}
              </p>
              <p className="v3-lv-note" data-testid="live-approval-by">
                {approval.approvedBy}
              </p>
            </div>
            <details
              className="v3-lv-tech"
              data-testid="live-approval-detail"
              style={{ marginTop: 12 }}
            >
              <summary>승인 상세</summary>
              <p className="v3-lv-note">
                실전매매는 명시적 승인·시작 없이는 절대 자동 시작되지 않습니다.
                이 패널의 승인 버튼은 실전 봇을 시작하지 않습니다.
              </p>
              {approvalPanel(true)}
              <div className="v3-lv-toolbar" style={{ marginTop: 12 }}>
                {approvalRequestControl}
              </div>
            </details>
          </>
        )}
      </V3Card>
      {message ? (
        <p className="v3-lv-full v3-lv-note" data-testid="live-gate-message">
          {message}
        </p>
      ) : null}
    </div>
  );
}

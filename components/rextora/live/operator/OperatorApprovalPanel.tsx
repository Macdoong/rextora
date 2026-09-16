"use client";

import { Button } from "@/components/ui/primitives";
import { useAuth } from "@/components/rextora/auth/AuthSessionProvider";
import {
  LIVE_GATE_APPROVAL_NOT_LIVE_START,
  LIVE_GATE_CURRENT_APPROVAL_TITLE,
  LIVE_GATE_HISTORY_TITLE,
  LIVE_GATE_IDENTITY_AUTHORITY_GAP,
  LIVE_GATE_UNAVAILABLE,
  liveGateHistoryRowPresentation,
  type LiveGateWorkflowStatus,
} from "@/src/lib/rextora/live/liveGateOperatorPresentation";

export type LiveApprovalHistoryRow = {
  requestId: string;
  strategyId: string;
  backtestRunId?: string | null;
  paperSessionId?: string | null;
  symbol?: string | null;
  status: LiveGateWorkflowStatus;
  requestedAt?: string | null;
  requestedBy?: string | null;
  requestReason?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewReason?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
};

export function OperatorApprovalPanel({
  statusKo,
  approvedAt,
  approvedBy,
  workflowStatusKo,
  requestActionKo,
  nextActionKo,
  canRequest,
  requestDisabledReason,
  targetStrategy,
  targetBacktestRunId,
  targetPaperSessionId,
  targetSymbol,
  blockers,
  pendingRequestId,
  history,
  identityAuthorityGap,
  requestReason,
  reviewReason,
  confirmationText,
  busy,
  hideHeadline = false,
  onRequestReasonChange,
  onReviewReasonChange,
  onConfirmationTextChange,
  onRequest,
  onApprove,
  onReject,
  onRevoke,
}: {
  statusKo: string;
  approvedAt: string;
  approvedBy: string;
  workflowStatusKo: string;
  requestActionKo: string;
  nextActionKo: string;
  canRequest: boolean;
  requestDisabledReason: string;
  targetStrategy: string | null;
  targetBacktestRunId: string | null;
  targetPaperSessionId: string | null;
  targetSymbol: string | null;
  blockers: string[];
  pendingRequestId: string | null;
  history: LiveApprovalHistoryRow[];
  identityAuthorityGap: boolean;
  requestReason: string;
  reviewReason: string;
  confirmationText: string;
  busy: boolean;
  hideHeadline?: boolean;
  onRequestReasonChange: (value: string) => void;
  onReviewReasonChange: (value: string) => void;
  onConfirmationTextChange: (value: string) => void;
  onRequest: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRevoke: () => void;
}) {
  const { can } = useAuth();
  const latest = history[0] ?? null;
  const latestApproved = latest?.status === "approved";
  const canAsk = can("live:request");
  const canReview = can("live:approve");
  const canRevokeApproval = can("live:revoke");

  return (
    <section data-testid="live-approval-panel">
      {hideHeadline ? null : (
        <>
          <h3 className="v3-lv-section-title">{LIVE_GATE_CURRENT_APPROVAL_TITLE}</h3>
          <dl className="v3-lv-status-grid">
            <div>
              <dt>현재 승인</dt>
              <dd data-testid="live-approval-status">{statusKo}</dd>
            </div>
            <div>
              <dt>요청 상태</dt>
              <dd data-testid="live-approval-workflow-status">{workflowStatusKo}</dd>
            </div>
            <div>
              <dt>승인 시각</dt>
              <dd data-testid="live-approval-time">{approvedAt}</dd>
            </div>
            <div>
              <dt>승인자</dt>
              <dd data-testid="live-approval-by">{approvedBy}</dd>
            </div>
          </dl>
          <p className="v3-lv-note" data-testid="live-approval-not-live" style={{ marginTop: 10 }}>
            {LIVE_GATE_APPROVAL_NOT_LIVE_START}
          </p>
          <p className="v3-lv-note" data-testid="live-approval-next">
            {nextActionKo}
          </p>
        </>
      )}

      <div className="v3-lv-request" data-testid="live-approval-target">
        <h4 className="v3-lv-section-title">요청 대상</h4>
        <dl className="v3-lv-status-grid">
          <div>
            <dt>전략</dt>
            <dd>{targetStrategy || LIVE_GATE_UNAVAILABLE}</dd>
          </div>
          <div>
            <dt>Backtest</dt>
            <dd>{targetBacktestRunId || LIVE_GATE_UNAVAILABLE}</dd>
          </div>
          <div>
            <dt>Paper</dt>
            <dd>{targetPaperSessionId || LIVE_GATE_UNAVAILABLE}</dd>
          </div>
          <div>
            <dt>심볼</dt>
            <dd>{targetSymbol || LIVE_GATE_UNAVAILABLE}</dd>
          </div>
        </dl>
        {blockers.length ? (
          <ul className="v3-lv-note" data-testid="live-approval-blockers">
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        <label className="v3-lv-field">
          <span>요청 메모</span>
          <textarea
            data-testid="live-approval-request-reason"
            value={requestReason}
            onChange={(event) => onRequestReasonChange(event.target.value)}
            rows={2}
          />
        </label>
        {canAsk ? (
          <Button
            tone="default"
            data-testid="live-approval-request"
            disabled={!canRequest || busy}
            loading={busy}
            onClick={onRequest}
          >
            {requestActionKo}
          </Button>
        ) : null}
        {!canRequest ? (
          <p className="v3-lv-note" data-testid="live-approval-request-gap">
            {requestDisabledReason}
          </p>
        ) : null}
      </div>

      {pendingRequestId || latestApproved ? (
        <div className="v3-lv-review" data-testid="live-approval-review">
          <h4 className="v3-lv-section-title">검토</h4>
          {identityAuthorityGap ? (
            <p className="v3-lv-note" data-testid="live-approval-identity-gap">
              {LIVE_GATE_IDENTITY_AUTHORITY_GAP}
            </p>
          ) : null}
          <label className="v3-lv-field">
            <span>검토 메모</span>
            <textarea
              data-testid="live-approval-review-reason"
              value={reviewReason}
              onChange={(event) => onReviewReasonChange(event.target.value)}
              rows={2}
            />
          </label>
          {pendingRequestId ? (
            <label className="v3-lv-field">
              <span>실전 확인 문구</span>
              <input
                data-testid="live-approval-confirmation"
                value={confirmationText}
                onChange={(event) => onConfirmationTextChange(event.target.value)}
                autoComplete="off"
              />
            </label>
          ) : null}
          <div className="v3-lv-toolbar">
            {pendingRequestId && canReview ? (
              <>
                <Button
                  tone="success"
                  data-testid="live-approval-approve"
                  disabled={busy}
                  onClick={onApprove}
                >
                  승인
                </Button>
                <Button
                  tone="danger"
                  data-testid="live-approval-reject"
                  disabled={busy}
                  onClick={onReject}
                >
                  거절
                </Button>
              </>
            ) : null}
            {latestApproved && canRevokeApproval ? (
              <Button
                tone="warning"
                data-testid="live-approval-revoke"
                disabled={busy}
                onClick={onRevoke}
              >
                철회
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <details className="v3-lv-tech" data-testid="live-approval-history" style={{ marginTop: 14 }}>
        <summary>{LIVE_GATE_HISTORY_TITLE}</summary>
        {history.length === 0 ? (
          <p className="v3-lv-note" data-testid="live-approval-history-empty">
            승인 요청 이력이 없습니다.
          </p>
        ) : (
          <ol className="v3-lv-history">
            {history.map((row) => {
              const presented = liveGateHistoryRowPresentation(row);
              return (
                <li key={row.requestId} data-testid="live-approval-history-row">
                  <div className="v3-lv-metric">
                    <span>{presented.statusKo}</span>
                    <b>{presented.strategyId}</b>
                    <small>
                      요청 {presented.requestedAt}
                      {row.reviewedAt ? ` · 검토 ${presented.reviewedAt}` : ""}
                      {` · 검토자 ${presented.reviewedBy}`}
                    </small>
                    {row.requestReason ? (
                      <small>요청 메모 {presented.requestReason}</small>
                    ) : null}
                    {row.reviewReason ? (
                      <small>검토 메모 {presented.reviewReason}</small>
                    ) : null}
                    {row.revokedAt ? (
                      <small>
                        철회 {presented.revokedAt} · {presented.revokedBy}
                        {row.revokeReason ? ` · ${presented.revokeReason}` : ""}
                      </small>
                    ) : null}
                    {presented.requestIdSecondary ? (
                      <small>{presented.requestIdSecondary}</small>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </details>
    </section>
  );
}

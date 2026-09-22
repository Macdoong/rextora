"use client";

import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import type { StrategySearchJobStatus } from "./types";
import { useAuth } from "@/components/rextora/auth/AuthSessionProvider";
import { visibleJobLifecycleActions } from "./jobActionVisibility";
import {
  isSearchCancellationPending,
  searchCancellationPendingCopy,
} from "./formatters";

export function ExecutionControls(props: {
  status: StrategySearchJobStatus;
  pending: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  /** When failed job is safely retryable. */
  retryable?: boolean;
  /** True missing job — disable pause/stop and other execution actions. */
  jobMissing?: boolean;
  /** False when no job is selected. Existing start/pause/resume/retry/cancel stay unused. */
  hasSelection?: boolean;
  /** Job-scoped results route. Used for completed "결과 보기". */
  resultsHref?: string | null;
}) {
  const { can } = useAuth();
  const { status, pending, onStart, onPause, onResume, onCancel } = props;
  const allowed = can("research:run");
  const hasSelection = props.hasSelection !== false;
  const actions = visibleJobLifecycleActions({
    status,
    hasSelection,
    jobMissing: props.jobMissing,
    retryable: props.retryable,
  });
  const showStart = allowed && actions.includes("start");
  const showPause = allowed && actions.includes("pause");
  const showResume = allowed && actions.includes("resume");
  const showRecover = allowed && actions.includes("recover");
  const showRetry = allowed && actions.includes("retry");
  const showCancel = allowed && actions.includes("cancel");
  const showResults =
    actions.includes("results") &&
    Boolean(props.resultsHref) &&
    status !== "completed";
  const cancelling =
    status === "cancel_requested" || status === "cancelling";
  const hasVisibleAction =
    showStart ||
    showPause ||
    showResume ||
    showRecover ||
    showRetry ||
    showCancel ||
    showResults;
  const terminal =
    hasSelection &&
    !props.jobMissing &&
    (status === "cancelled" || (status === "failed" && !showRetry));

  if (!hasSelection && !props.jobMissing) {
    return null;
  }

  return (
    <div
      className="ss-exec-actions"
      data-testid="ss-execution-controls"
      data-job-status={status}
      role="group"
      aria-label="탐색 제어"
    >
      {showStart ? (
        <Button
          type="button"
          className="ss-btn-primary"
          data-testid="ss-action-start"
          disabled={pending}
          onClick={onStart}
        >
          시작
        </Button>
      ) : null}
      {showPause ? (
        <Button
          type="button"
          variant="warning"
          className="ss-btn-primary"
          data-testid="ss-action-pause"
          disabled={pending}
          onClick={onPause}
        >
          일시정지
        </Button>
      ) : null}
      {showResume ? (
        <Button
          type="button"
          variant="success"
          className="ss-btn-primary"
          data-testid="ss-action-resume"
          disabled={pending}
          onClick={onResume}
        >
          재개
        </Button>
      ) : null}
      {showRecover ? (
        <Button
          type="button"
          variant="success"
          className="ss-btn-primary"
          data-testid="ss-action-resume"
          disabled={pending}
          onClick={onResume}
        >
          복구
        </Button>
      ) : null}
      {showRetry ? (
        <Button
          type="button"
          variant="success"
          className="ss-btn-primary"
          data-testid="ss-action-retry"
          disabled={pending}
          onClick={onResume}
        >
          재시도
        </Button>
      ) : null}
      {showCancel ? (
        <Button
          type="button"
          variant="danger"
          className="ss-btn-primary"
          data-testid="ss-action-cancel"
          disabled={pending || cancelling}
          onClick={onCancel}
        >
          중지
        </Button>
      ) : null}
      {showResults ? (
        <Link
          href={props.resultsHref!}
          className="v3-ss-btn-primary"
          data-testid="ss-action-results"
        >
          결과 보기
        </Link>
      ) : null}
      {!allowed ? (
        <div
          className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)]"
          data-testid="ss-controls-readonly"
        >
          조회 전용 계정은 탐색을 실행할 수 없습니다.
        </div>
      ) : null}
      {props.jobMissing ? (
        <div
          className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
          data-testid="ss-controls-missing"
        >
          탐색 작업을 찾을 수 없어 제어할 수 없습니다.
        </div>
      ) : null}
      {allowed && terminal && !hasVisibleAction ? (
        <div
          className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)]"
          data-testid="ss-controls-terminal"
        >
          종료된 탐색입니다.
        </div>
      ) : null}
      {isSearchCancellationPending(status) ? (
        <span
          className="self-center text-xs text-amber-200"
          data-testid="ss-cancelling"
        >
          {searchCancellationPendingCopy(status)}
        </span>
      ) : null}
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/primitives";
import type { StrategySearchJobStatus } from "./types";
import { useAuth } from "@/components/rextora/auth/AuthSessionProvider";

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
  /** False when no job is selected. Existing start/pause/resume/retry/cancel stay disabled. */
  hasSelection?: boolean;
}) {
  const { can } = useAuth();
  const { status, pending, onStart, onPause, onResume, onCancel } = props;
  const allowed = can("research:run");
  const hasSelection = props.hasSelection !== false;
  const selectable = allowed && hasSelection && !props.jobMissing;

  const showStart = selectable && status === "queued";
  const showPause = selectable && status === "running";
  const showResume =
    selectable && (status === "paused" || status === "interrupted");
  const showRetry =
    selectable && status === "failed" && props.retryable === true;
  const showCancel =
    selectable &&
    (status === "queued" ||
      status === "running" ||
      status === "paused" ||
      status === "interrupted" ||
      status === "pause_requested");
  const cancelling =
    status === "cancel_requested" || status === "cancelling";
  const terminal =
    hasSelection &&
    !props.jobMissing &&
    (status === "completed" ||
      status === "cancelled" ||
      (status === "failed" && !showRetry));

  const disabledReason = !allowed
    ? "조회 전용 계정은 탐색을 실행할 수 없습니다."
    : props.jobMissing
      ? "탐색 작업을 찾을 수 없어 제어할 수 없습니다."
      : !hasSelection
        ? "탐색을 선택하거나 새 탐색을 시작하세요."
        : terminal
          ? "종료된 탐색입니다."
          : "현재 상태에서는 사용할 수 없습니다.";

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="ss-execution-controls"
      role="group"
      aria-label="탐색 제어"
    >
      <Button
        type="button"
        className="ss-btn-primary"
        data-testid="ss-action-start"
        disabled={!showStart || pending}
        title={showStart ? undefined : disabledReason}
        onClick={onStart}
      >
        시작
      </Button>
      <Button
        type="button"
        variant="warning"
        className="ss-btn-primary"
        data-testid="ss-action-pause"
        disabled={!showPause || pending}
        title={showPause ? undefined : disabledReason}
        onClick={onPause}
      >
        일시정지
      </Button>
      <Button
        type="button"
        variant="success"
        className="ss-btn-primary"
        data-testid="ss-action-resume"
        disabled={!showResume || pending}
        title={showResume ? undefined : disabledReason}
        onClick={onResume}
      >
        재개
      </Button>
      <Button
        type="button"
        variant="success"
        className="ss-btn-primary"
        data-testid="ss-action-retry"
        disabled={!showRetry || pending}
        title={showRetry ? undefined : disabledReason}
        onClick={onResume}
      >
        재시도
      </Button>
      <Button
        type="button"
        variant="danger"
        className="ss-btn-primary"
        data-testid="ss-action-cancel"
        disabled={!showCancel || pending || cancelling}
        title={showCancel ? undefined : disabledReason}
        onClick={onCancel}
      >
        중지
      </Button>
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
      {allowed && terminal ? (
        <div
          className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)]"
          data-testid="ss-controls-terminal"
        >
          종료된 탐색입니다.
        </div>
      ) : null}
      {cancelling ? (
        <span
          className="self-center text-xs text-amber-200"
          data-testid="ss-cancelling"
        >
          {status === "cancelling" ? "결과 정리 중…" : "중지 요청 중…"}
        </span>
      ) : null}
    </div>
  );
}

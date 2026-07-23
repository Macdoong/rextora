"use client";

import { Button } from "@/components/ui/primitives";
import type { StrategySearchJobStatus } from "./types";

export function ExecutionControls(props: {
  status: StrategySearchJobStatus;
  pending: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const { status, pending, onStart, onPause, onResume, onCancel } = props;

  const showStart = status === "queued";
  const showPause = status === "running";
  const showResume = status === "paused";
  const showCancel =
    status === "queued" ||
    status === "running" ||
    status === "paused" ||
    status === "pause_requested";
  const cancelling = status === "cancel_requested";
  const terminal =
    status === "completed" || status === "cancelled" || status === "failed";

  if (terminal) {
    return (
      <div
        className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text-secondary)]"
        data-testid="ss-controls-terminal"
      >
        종료된 탐색입니다.
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      data-testid="ss-execution-controls"
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
          탐색 시작
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
      {cancelling ? (
        <span
          className="self-center text-xs text-amber-200"
          data-testid="ss-cancelling"
        >
          중지 요청 처리 중…
        </span>
      ) : null}
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { COMPLETED_COMPARE_SCORE_LABEL } from "./completedDisplayFormat";

const SCORE_HELP_POPOVER_WIDTH = 320;

export function CompletedScoreHelp(props: { minScoreEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"left" | "right">("right");
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const shouldOpenLeft =
      window.innerWidth - rect.right < SCORE_HELP_POPOVER_WIDTH + 16;
    setPlacement(shouldOpenLeft ? "left" : "right");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, close]);

  return (
    <span
      className="ss-completed-score-help"
      ref={rootRef}
      data-testid="ss-completed-score-help"
      data-min-score-enabled={props.minScoreEnabled ? "true" : "false"}
    >
      <button
        type="button"
        ref={triggerRef}
        className="ss-completed-score-help__btn"
        aria-label={`${COMPLETED_COMPARE_SCORE_LABEL} 설명`}
        aria-expanded={open}
        aria-controls={id}
        data-testid="ss-completed-score-help-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ss-completed-score-help__icon" aria-hidden="true">
          ?
        </span>
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label={`${COMPLETED_COMPARE_SCORE_LABEL} 안내`}
          className={
            "ss-completed-score-help__popover" +
            (placement === "left"
              ? " ss-completed-score-help__popover--left"
              : " ss-completed-score-help__popover--right")
          }
          data-testid="ss-completed-score-help-popover"
          data-popover-placement={placement}
        >
          <p>
            같은 전략 유형 안에서 후보들의 성과와 안정성을 종합해 우선순위를
            비교하는 지표입니다.
          </p>
          <p>
            1점 만점처럼 고정된 절대 점수가 아니므로, 절댓값보다 같은 전략군
            안의 다른 후보와 비교해서 봐야 합니다.
          </p>
          {props.minScoreEnabled ? (
            <p data-testid="ss-completed-score-help-min-configured">
              이번 탐색에서는 설정한 최소 후보 비교 점수 조건도 자격 통과
              기준에 포함됩니다.
            </p>
          ) : (
            <p data-testid="ss-completed-score-help-min-null">
              이번 탐색에서는 이 점수가 자격 통과 기준으로 사용되지
              않았습니다.
            </p>
          )}
        </div>
      ) : null}
    </span>
  );
}

export function CompletedCompareScoreCaption(props: {
  minScoreEnabled: boolean;
}) {
  return (
    <span className="ss-completed-compare-score-caption">
      <span className="ss-completed-type-caption">{COMPLETED_COMPARE_SCORE_LABEL}</span>
      <CompletedScoreHelp minScoreEnabled={props.minScoreEnabled} />
    </span>
  );
}

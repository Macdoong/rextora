"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatCount } from "../formatters";

export function CompletedPassRateHelp(props: {
  evaluated: number;
  passed: number;
  passRatePct: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  const close = useCallback(() => setOpen(false), []);

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

  const { evaluated, passed, passRatePct } = props;

  return (
    <span
      className="ss-completed-pass-rate-help"
      ref={rootRef}
      data-testid="ss-completed-pass-rate-help"
    >
      <button
        type="button"
        className="ss-completed-pass-rate-help__btn"
        aria-label="통과율 설명"
        aria-expanded={open}
        aria-controls={id}
        data-testid="ss-completed-pass-rate-help-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ss-completed-pass-rate-help__icon" aria-hidden="true">
          ?
        </span>
      </button>
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label="통과율 안내"
          className="ss-completed-pass-rate-help__popover"
          data-testid="ss-completed-pass-rate-help-popover"
        >
          <p>
            평가를 완료한 후보 중 설정한 검증 기준을 모두 충족한 후보의
            비율입니다.
          </p>
          <p data-testid="ss-completed-pass-rate-help-dynamic">
            {formatCount(evaluated)}개 후보 중 {formatCount(passed)}개가
            기준을 통과해 통과율은 {passRatePct.toFixed(2)}%입니다.
          </p>
          <p>
            통과율은 후보를 얼마나 엄격하게 걸러냈는지를 보여주는
            참고값입니다. 통과율이 낮다고 추천 전략의 품질이 낮다는 뜻은
            아닙니다.
          </p>
        </div>
      ) : null}
    </span>
  );
}

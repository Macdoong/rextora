"use client";

import { formatMs } from "../formatters";
import type { CompletedDashboardViewModel } from "./completedViewModel";

export function CompletedHero(props: { model: CompletedDashboardViewModel }) {
  const { model } = props;
  const elapsed =
    model.elapsedMs != null && Number.isFinite(model.elapsedMs)
      ? formatMs(model.elapsedMs)
      : null;
  const check =
    model.heroTone === "success"
      ? "✓"
      : model.heroTone === "error"
        ? "!"
        : "◦";

  return (
    <header
      className={
        "ss-completed-hero ss-completed-hero--enter ss-completed-hero--" +
        model.heroTone
      }
      data-testid="ss-completed-hero"
      data-hero-tone={model.heroTone}
    >
      <div
        className="ss-completed-hero__visual"
        aria-hidden="true"
        data-testid="ss-completed-hero-visual"
      >
        <div className="ss-completed-hero__glow" />
        <div className="ss-completed-hero__orbit ss-completed-hero__orbit--outer" />
        <div className="ss-completed-hero__orbit ss-completed-hero__orbit--inner" />
        <div className="ss-completed-hero__core" />
        <span className="ss-completed-hero__node ss-completed-hero__node--a" />
        <span className="ss-completed-hero__node ss-completed-hero__node--b" />
        <span className="ss-completed-hero__node ss-completed-hero__node--c" />
        <span
          className="ss-completed-hero__visual-check"
          data-testid="ss-completed-hero-check"
        >
          {check}
        </span>
      </div>
      <div className="ss-completed-hero__copy">
        <h2 className="ss-completed-hero__title">{model.heroTitle}</h2>
        <p
          className="ss-completed-hero__message"
          data-testid="ss-completion-hero-reason"
        >
          {model.heroMessage}
        </p>
        <p className="ss-completed-hero__market">
          {model.symbol} · {model.timeframe}
          {elapsed ? ` · ${elapsed}` : ""}
          {model.qualifiedCount > 0
            ? ` · 최종 적격 ${model.qualifiedCount}개`
            : " · 합격 후보 없음"}
        </p>
        {model.completionReasonLabel ? (
          <p
            className="ss-completed-hero__reason-label"
            data-testid="ss-stop-reason"
          >
            {model.completionReasonLabel}
          </p>
        ) : null}
      </div>
    </header>
  );
}

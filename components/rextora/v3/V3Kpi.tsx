import type { HTMLAttributes, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type V3Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "ai";

export function V3Kpi({
  label,
  value,
  helper,
  tone = "neutral",
  visual,
  className,
  ...rest
}: {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  tone?: V3Tone;
  visual?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("v3-kpi", tone !== "neutral" && `v3-kpi--${tone}`, className)}
      {...rest}
    >
      <span className="v3-kpi__label">{label}</span>
      <span className="v3-kpi__value v3-kpi-pop">{value}</span>
      {helper != null ? <span className="v3-kpi__helper">{helper}</span> : null}
      {visual}
    </div>
  );
}

import type { HTMLAttributes, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const TONE_KO = {
  neutral: "보통",
  brand: "안내",
  success: "정상",
  warning: "주의",
  danger: "위험",
  ai: "AI",
} as const;

export type V3StatusTone = keyof typeof TONE_KO;

export function V3Status({
  label,
  value,
  tone = "neutral",
  className,
  ...rest
}: {
  label?: ReactNode;
  value: ReactNode;
  tone?: V3StatusTone;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("v3-status", `v3-status--${tone}`, className)}
      {...rest}
    >
      <span className="v3-status__tone">{TONE_KO[tone]}</span>
      <div className="v3-status__copy">
        {label != null ? <span className="v3-status__label">{label}</span> : null}
        <span className="v3-status__value">{value}</span>
      </div>
    </div>
  );
}

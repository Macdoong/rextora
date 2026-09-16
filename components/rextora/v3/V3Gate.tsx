import type { HTMLAttributes, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type V3GateState = "neutral" | "brand" | "success" | "warning" | "danger";

const STATE_KO: Record<V3GateState, string> = {
  neutral: "대기",
  brand: "진행",
  success: "통과",
  warning: "대기",
  danger: "차단",
};

export function V3Gate({
  label,
  description,
  state = "neutral",
  trailing,
  className,
  ...rest
}: {
  label: ReactNode;
  description?: ReactNode;
  state?: V3GateState;
  trailing?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("v3-gate", "v3-hover", `v3-gate--${state}`, className)}
      {...rest}
    >
      <span className="v3-gate__dot" aria-hidden="true" />
      <div>
        <div className="v3-gate__label">{label}</div>
        {description != null ? (
          <span className="v3-gate__description">{description}</span>
        ) : null}
      </div>
      {trailing ?? <em className={`v3-gate__state v3-gate--${state}`}>{STATE_KO[state]}</em>}
    </div>
  );
}

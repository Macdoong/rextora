import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "default" | "success" | "danger" | "warning" | "purple" | "muted";

const toneClass: Record<Tone, string> = {
  default: "border-slate-700 bg-slate-900 text-slate-100",
  success: "border-green-500/40 bg-green-500/10 text-green-300",
  danger: "border-red-500/40 bg-red-500/10 text-red-300",
  warning: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  purple: "border-violet-500/40 bg-violet-500/10 text-violet-200",
  muted: "border-slate-600 bg-slate-800/70 text-slate-300"
};

export function Card({ title, action, children, className = "", "data-testid": dataTestId }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; "data-testid"?: string }) {
  return (
    <section className={`rextora-card rounded-xl p-4 ${className}`} data-testid={dataTestId}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="rextora-card-title font-semibold text-slate-100">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "default", "data-testid": dataTestId }: { children: ReactNode; tone?: Tone; "data-testid"?: string }) {
  return <span data-testid={dataTestId} className={`rextora-badge inline-flex rounded-full border px-2.5 py-0.5 font-semibold ${toneClass[tone]}`}>{children}</span>;
}

export function Button({
  children,
  tone = "default",
  disabled = false,
  className = "",
  ...props
}: {
  children: ReactNode;
  tone?: Tone;
  disabled?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled}
      className={`rextora-btn-text rounded-lg border px-3 py-2 font-semibold transition ${toneClass[tone]} ${
        disabled ? "cursor-not-allowed opacity-45" : "hover:brightness-125"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value, tone = "success" }: { value: number; tone?: Tone }) {
  const color = tone === "danger" ? "bg-red-500" : tone === "warning" ? "bg-orange-500" : tone === "purple" ? "bg-violet-500" : "bg-green-500";

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Metric({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div>
      <div className="rextora-helper">{label}</div>
      <div className={`rextora-body mt-1 font-semibold ${tone === "success" ? "text-green-300" : tone === "danger" ? "text-red-300" : "text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}

"use client";

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { HelpCircle, Loader2, X } from "lucide-react";

type Tone = "default" | "success" | "danger" | "warning" | "purple" | "muted" | "info";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline" | "success" | "warning";
type ButtonSize = "sm" | "md" | "lg";

const toneClass: Record<Tone, string> = {
  default: "border-slate-600/80 bg-slate-800/80 text-slate-100",
  success: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  danger: "border-red-500/35 bg-red-500/10 text-red-300",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  purple: "border-indigo-500/35 bg-indigo-500/10 text-indigo-200",
  muted: "border-slate-600/60 bg-slate-800/50 text-slate-300",
  info: "border-sky-500/35 bg-sky-500/10 text-sky-200",
};

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary:
    "border-sky-500/40 bg-sky-600 text-white hover:bg-sky-500 shadow-sm shadow-sky-900/30",
  secondary:
    "border-slate-600/80 bg-slate-800/90 text-slate-100 hover:bg-slate-700/90",
  danger:
    "border-red-500/40 bg-red-600/90 text-white hover:bg-red-500",
  ghost:
    "border-transparent bg-transparent text-slate-300 hover:bg-slate-800/80 hover:text-white",
  outline:
    "border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800/70",
  success:
    "border-emerald-500/40 bg-emerald-600/90 text-white hover:bg-emerald-500",
  warning:
    "border-amber-500/40 bg-amber-600/90 text-white hover:bg-amber-500",
};

/** Map legacy tone prop → button variant for backward compatibility */
function toneToVariant(tone: Tone): ButtonVariant {
  if (tone === "success") return "success";
  if (tone === "danger") return "danger";
  if (tone === "warning") return "warning";
  if (tone === "muted" || tone === "default") return "secondary";
  if (tone === "purple" || tone === "info") return "primary";
  return "secondary";
}

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-xs rounded-md",
  md: "px-3 py-2 text-sm rounded-lg",
  lg: "px-4 py-2.5 text-sm rounded-lg",
};

export function Card({
  title,
  description,
  icon,
  action,
  children,
  className = "",
  interactive = false,
  "data-testid": dataTestId,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  "data-testid"?: string;
}) {
  return (
    <section
      className={`rextora-card p-5 md:p-[1.35rem] ${interactive ? "rextora-card-interactive" : ""} ${className}`}
      data-testid={dataTestId}
    >
      {(title || action || icon) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2.5">
            {icon && (
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-700/80 bg-slate-900/80 text-sky-300">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title ? (
                <h2 className="rextora-card-title">{title}</h2>
              ) : null}
              {description ? (
                <p className="rextora-helper mt-1 max-w-xl">{description}</p>
              ) : null}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "default",
  icon,
  className = "",
  "data-testid": dataTestId,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <span
      data-testid={dataTestId}
      className={`rextora-badge inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${toneClass[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  "data-testid": dataTestId,
}: {
  status: string;
  "data-testid"?: string;
}) {
  const normalized = status.trim().toLowerCase();
  const map: Array<{ match: RegExp; tone: Tone; label?: string }> = [
    { match: /running|실행|live|실전|진입 가능/, tone: "success" },
    { match: /paper|모의|ready|준비|정상|connected|연결|성공|success/, tone: "success" },
    { match: /monitoring|관찰|대기|waiting|watch/, tone: "warning" },
    { match: /warning|주의|stale|지연/, tone: "warning" },
    { match: /blocked|차단|offline|오프|error|오류|실패|danger|긴급/, tone: "danger" },
    { match: /중지|stop|idle|muted/, tone: "muted" },
  ];
  const hit = map.find((m) => m.match.test(normalized) || m.match.test(status));
  return (
    <Badge tone={hit?.tone ?? "default"} data-testid={dataTestId}>
      {status}
    </Badge>
  );
}

export function Button({
  children,
  tone = "default",
  variant,
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  ...props
}: {
  children: ReactNode;
  tone?: Tone;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const resolved = variant ?? toneToVariant(tone);
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={`rextora-btn-text inline-flex items-center justify-center gap-1.5 border font-semibold transition duration-150 ${buttonVariantClass[resolved]} ${sizeClass[size]} ${
        isDisabled
          ? "cursor-not-allowed opacity-45"
          : "active:scale-[0.98]"
      } ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 rx-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ProgressBar({
  value,
  tone = "success",
  className = "",
  label,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const color =
    tone === "danger"
      ? "bg-red-500"
      : tone === "warning"
        ? "bg-amber-500"
        : tone === "purple" || tone === "info"
          ? "bg-sky-500"
          : "bg-emerald-500";
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div className={className}>
      {label && (
        <div className="rextora-helper mb-1 flex justify-between">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
      )}
      <div
        className="rextora-gauge"
        style={{ ["--gauge-pct" as string]: pct } as CSSProperties}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i className={color} />
      </div>
    </div>
  );
}

export function Metric({
  label,
  value,
  tone = "default",
  help,
  recommended,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  help?: string;
  recommended?: string;
  size?: "md" | "lg";
}) {
  const valueTone =
    tone === "success"
      ? "text-emerald-300"
      : tone === "danger"
        ? "text-red-300"
        : tone === "warning"
          ? "text-amber-200"
          : "text-slate-100";

  return (
    <div>
      <div className="rextora-label flex items-center gap-1">
        <span>{label}</span>
        {(help || recommended) && (
          <Tooltip
            content={
              <div className="space-y-1">
                {help && <p>{help}</p>}
                {recommended && (
                  <p className="text-sky-200">권장: {recommended}</p>
                )}
              </div>
            }
          >
            <span
              className="inline-grid h-4 w-4 cursor-help place-items-center text-slate-400 hover:text-slate-200"
              aria-label={`${label} 도움말`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </span>
          </Tooltip>
        )}
      </div>
      <div
        className={`mt-1.5 font-semibold tabular-nums ${valueTone} ${
          size === "lg" ? "rextora-metric-primary" : "rextora-metric-secondary"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function Tooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span tabIndex={0} aria-describedby={open ? id : undefined}>
        {children}
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-[16rem] -translate-x-1/2 rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-2 text-left text-xs leading-relaxed text-slate-200 shadow-lg"
        >
          {content}
        </span>
      )}
    </span>
  );
}

export function FieldHelp({
  help,
  recommended,
  safe,
}: {
  help?: string;
  recommended?: string;
  safe?: string;
}) {
  if (!help && !recommended && !safe) return null;
  return (
    <div className="rextora-helper mb-2 space-y-0.5">
      {help && <p>{help}</p>}
      {(recommended || safe) && (
        <p className="text-slate-400">
          {recommended && <span>권장 {recommended}</span>}
          {recommended && safe && <span> · </span>}
          {safe && <span>안전 {safe}</span>}
        </p>
      )}
    </div>
  );
}

export function Skeleton({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rextora-skeleton ${className}`} {...props} />;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="rextora-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="rextora-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rx-dialog-title"
        aria-describedby="rx-dialog-desc"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 id="rx-dialog-title" className="rextora-section-title text-slate-100">
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p id="rx-dialog-desc" className="rextora-body text-slate-300">
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            tone={tone}
            loading={loading}
            onClick={onConfirm}
            data-testid="confirm-dialog-ok"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DataTable({
  children,
  className = "",
  minWidth,
  "data-testid": dataTestId,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string | number;
  "data-testid"?: string;
}) {
  return (
    <div className={`rextora-table-wrap ${className}`}>
      <table
        className="rextora-data-table"
        style={minWidth ? { minWidth } : undefined}
        data-testid={dataTestId}
      >
        {children}
      </table>
    </div>
  );
}

export type { Tone, ButtonVariant, ButtonSize };

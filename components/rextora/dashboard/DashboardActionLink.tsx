import Link from "next/link";
import type { ReactNode } from "react";

const baseClass =
  "rextora-btn-text inline-flex items-center justify-center gap-1.5 border font-semibold transition duration-150 active:scale-[0.98]";

const variantClass = {
  primary:
    "border-sky-500/40 bg-sky-600 text-white hover:bg-sky-500 shadow-sm shadow-sky-900/30",
  secondary:
    "border-slate-600/80 bg-slate-800/90 text-slate-100 hover:bg-slate-700/90",
} as const;

const sizeClass = {
  sm: "min-h-11 px-2.5 py-1.5 text-xs rounded-md",
  md: "min-h-11 px-3 py-2 text-sm rounded-lg",
  lg: "min-h-11 px-4 py-2.5 text-base rounded-lg",
} as const;

export function DashboardActionLink({
  href,
  children,
  variant = "secondary",
  size = "md",
  className = "",
  "data-testid": dataTestId,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variantClass;
  size?: keyof typeof sizeClass;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <Link
      href={href}
      className={`${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      data-testid={dataTestId}
    >
      {children}
    </Link>
  );
}

"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/primitives";

type EmptyStateProps = {
  message?: string;
  hint?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  message = "데이터가 아직 없습니다.",
  hint,
  icon,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 px-6 py-10 text-center rx-fade-in ${className}`}
      data-testid="empty-state"
    >
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl border border-slate-700/70 bg-slate-900/80 text-slate-400">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </div>
      <p className="rextora-body font-medium text-slate-200">{message}</p>
      {hint && <p className="rextora-helper mt-2 max-w-md">{hint}</p>}
      {actionLabel && onAction && (
        <Button className="mt-4" variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

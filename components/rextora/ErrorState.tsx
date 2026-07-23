"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/primitives";

type ErrorStateProps = {
  message?: string;
  hint?: string;
  why?: string;
  fix?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  message = "정보를 불러오지 못했습니다.",
  hint = "새로고침 후 다시 확인하세요.",
  why,
  fix,
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`rounded-xl border border-red-500/30 bg-red-500/8 px-5 py-7 text-center rx-fade-in ${className}`}
      data-testid="error-state"
      role="alert"
    >
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-300">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <p className="rextora-body font-semibold text-red-100">{message}</p>
      {why && (
        <p className="rextora-helper mt-2 text-red-100/75">
          원인: {why}
        </p>
      )}
      {(hint || fix) && (
        <p className="rextora-helper mt-1.5 text-red-100/70">
          {fix ? `해결: ${fix}` : hint}
        </p>
      )}
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-4 border-red-400/40 text-red-100 hover:bg-red-500/20"
        >
          다시 시도
        </Button>
      )}
    </div>
  );
}

import { Skeleton } from "@/components/ui/primitives";

type LoadingStateProps = {
  message?: string;
  hint?: string;
  lines?: number;
  className?: string;
};

export function LoadingState({
  message = "정보를 불러오는 중입니다.",
  hint = "연결이 느리면 저장된 데이터를 먼저 표시합니다.",
  lines = 4,
  className = "",
}: LoadingStateProps) {
  return (
    <div className={`space-y-3 rx-fade-in ${className}`} data-testid="loading-state" role="status" aria-live="polite">
      <div>
        <p className="rextora-body text-slate-300">{message}</p>
        {hint && <p className="rextora-helper mt-1">{hint}</p>}
      </div>
      <div className="space-y-2.5 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
        <Skeleton className="h-4 w-1/3" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-3"
            style={{ width: `${72 + (i % 3) * 9}%` }}
          />
        ))}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    </div>
  );
}

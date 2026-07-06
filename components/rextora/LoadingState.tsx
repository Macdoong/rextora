type LoadingStateProps = {
  message?: string;
  hint?: string;
  lines?: number;
  className?: string;
};

export function LoadingState({
  message = "정보를 불러오는 중입니다.",
  hint = "Binance 연결이 느리면 모의 데이터 또는 저장된 데이터를 먼저 표시합니다.",
  lines = 4,
  className = ""
}: LoadingStateProps) {
  return (
    <div className={`space-y-3 ${className}`} data-testid="loading-state">
      <p className="rextora-body text-slate-400">{message}</p>
      {hint && <p className="rextora-helper text-slate-500">{hint}</p>}
      <div className="animate-pulse space-y-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-3 rounded bg-slate-800" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>
    </div>
  );
}

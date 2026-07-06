type EmptyStateProps = {
  message?: string;
  hint?: string;
  className?: string;
};

export function EmptyState({
  message = "데이터가 아직 없습니다.",
  hint,
  className = ""
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-lg border border-dashed border-slate-700 bg-slate-950/50 px-4 py-8 text-center ${className}`}
      data-testid="empty-state"
    >
      <p className="rextora-body text-slate-300">{message}</p>
      {hint && <p className="rextora-helper mt-2 text-slate-500">{hint}</p>}
    </div>
  );
}

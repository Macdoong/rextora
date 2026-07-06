type ErrorStateProps = {
  message?: string;
  hint?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  message = "정보를 불러오지 못했습니다.",
  hint = "새로고침 후 다시 확인하세요.",
  onRetry,
  className = ""
}: ErrorStateProps) {
  return (
    <div
      className={`rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-6 text-center ${className}`}
      data-testid="error-state"
    >
      <p className="rextora-body text-red-200">{message}</p>
      {hint && <p className="rextora-helper mt-2 text-red-100/80">{hint}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rextora-btn-text mt-3 rounded-lg border border-red-400/40 px-3 py-1.5 text-red-100 hover:bg-red-500/20"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

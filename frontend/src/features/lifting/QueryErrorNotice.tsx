export interface QueryErrorNoticeProps {
  message: string
  detail: string
  onRetry?: () => void
  className?: string
}

export function QueryErrorNotice({ message, detail, onRetry, className }: QueryErrorNoticeProps) {
  return (
    <div
      role="alert"
      className={[
        'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-raised p-3 text-xs',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0">
        <p className="font-medium">{message}</p>
        <p className="mt-0.5 text-content-muted">{detail}</p>
      </div>
      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 shrink-0 rounded-lg border border-line px-3 font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Retry
        </button>
      )}
    </div>
  )
}

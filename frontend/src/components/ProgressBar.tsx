export interface ProgressBarProps {
  value: number
  max: number | null
  label?: string
  className?: string
}

export function ProgressBar({ value, max, label, className }: ProgressBarProps) {
  if (max === null || !Number.isFinite(max) || max <= 0) {
    return null
  }

  const safeValue = Number.isFinite(value) ? value : 0
  const percent = Math.min(100, Math.max(0, (safeValue / max) * 100))

  return (
    <div className={className}>
      {label !== undefined && (
        <div className="mb-1 flex items-center justify-between text-xs text-content-muted">
          <span>{label}</span>
          <span>{Math.floor(percent)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={safeValue}
        className="h-2.5 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

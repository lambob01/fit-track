import { useEffect } from 'react'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastProps {
  message: string | null
  onDismiss: () => void
  durationMs?: number
  action?: ToastAction | null
}

export function Toast({ message, onDismiss, durationMs = 3200, action = null }: ToastProps) {
  useEffect(() => {
    if (message === null) {
      return
    }
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [message, onDismiss, durationMs])

  if (message === null) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-[calc(6rem_+_env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-2 rounded-xl border border-accent/50 bg-surface-raised py-1 pr-1 pl-4 text-sm font-medium shadow-lg"
    >
      <span className="min-w-0">{message}</span>
      {action !== null && (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

import { useEffect } from 'react'

export interface ToastProps {
  message: string | null
  onDismiss: () => void
  durationMs?: number
}

export function Toast({ message, onDismiss, durationMs = 3200 }: ToastProps) {
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
      className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-xl border border-accent/50 bg-surface-raised px-4 py-3 text-sm font-medium shadow-lg"
    >
      {message}
    </div>
  )
}

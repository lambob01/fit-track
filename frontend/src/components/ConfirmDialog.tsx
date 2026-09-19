import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  isPending?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}

const CANCEL_CLASS =
  'min-h-11 w-full rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:w-auto'

const CONFIRM_CLASS =
  'min-h-11 w-full rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50 sm:w-auto'

const DESTRUCTIVE_CLASS =
  'min-h-11 w-full rounded-lg border border-line-strong px-4 text-sm font-medium text-content transition-colors hover:bg-content/10 disabled:opacity-50 sm:w-auto'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  isPending = false,
  error = null,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  function requestClose() {
    if (!isPending) {
      onClose()
    }
  }

  return (
    <BottomSheet open={open} onClose={requestClose} title={title}>
      <div className="space-y-4 pb-2">
        {message !== undefined && <div className="text-sm text-content-muted">{message}</div>}
        {children}
        {error !== null && (
          <p role="alert" className="text-sm font-medium text-content">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={destructive ? DESTRUCTIVE_CLASS : CONFIRM_CLASS}
          >
            {isPending ? 'Working…' : confirmLabel}
          </button>
          <button type="button" onClick={requestClose} disabled={isPending} className={CANCEL_CLASS}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

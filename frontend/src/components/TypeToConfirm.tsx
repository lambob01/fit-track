import { useState } from 'react'
import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'

export interface TypeToConfirmProps {
  open: boolean
  title: string
  message?: ReactNode
  confirmWord?: string
  confirmLabel?: string
  cancelLabel?: string
  isPending?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}

const CANCEL_CLASS =
  'min-h-11 w-full rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:w-auto'

const CONFIRM_CLASS =
  'min-h-11 w-full rounded-lg border border-line-strong px-4 text-sm font-medium text-content transition-colors hover:bg-content/10 disabled:opacity-50 sm:w-auto'

interface TypeToConfirmBodyProps {
  message?: ReactNode
  confirmWord: string
  confirmLabel: string
  cancelLabel: string
  isPending: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

function TypeToConfirmBody({
  message,
  confirmWord,
  confirmLabel,
  cancelLabel,
  isPending,
  error,
  onConfirm,
  onClose,
}: TypeToConfirmBodyProps) {
  const [value, setValue] = useState('')

  function requestClose() {
    if (!isPending) {
      onClose()
    }
  }

  return (
    <div className="space-y-4 pb-2">
      {message !== undefined && <div className="text-sm text-content-muted">{message}</div>}
      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">Type {confirmWord} to continue</span>
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={confirmWord}
          className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </label>
      {error !== null && (
        <p role="alert" className="text-sm font-medium text-content">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending || value !== confirmWord}
          className={CONFIRM_CLASS}
        >
          {isPending ? 'Working…' : confirmLabel}
        </button>
        <button type="button" onClick={requestClose} disabled={isPending} className={CANCEL_CLASS}>
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}

export function TypeToConfirm({
  open,
  title,
  message,
  confirmWord = 'DELETE',
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  isPending = false,
  error = null,
  onConfirm,
  onClose,
}: TypeToConfirmProps) {
  function requestClose() {
    if (!isPending) {
      onClose()
    }
  }

  return (
    <BottomSheet open={open} onClose={requestClose} title={title}>
      <TypeToConfirmBody
        message={message}
        confirmWord={confirmWord}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        isPending={isPending}
        error={error}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </BottomSheet>
  )
}

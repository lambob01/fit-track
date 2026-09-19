import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { TypeToConfirm } from './TypeToConfirm'
import { nextDeleteStage, shouldSubmit } from './deleteStages'
import type { DeleteStage } from './deleteStages'

export interface DeleteFlowProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  typeToConfirm?: boolean
  requirePassword?: boolean
  passwordMessage?: ReactNode
  backup?: ReactNode
  isPending: boolean
  error: string | null
  onConfirm: (password: string | null) => void
  onClose: () => void
}

const INPUT_CLASS =
  'w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'

const CANCEL_CLASS =
  'min-h-11 w-full rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:w-auto'

const DESTRUCTIVE_CLASS =
  'min-h-11 w-full rounded-lg border border-line-strong px-4 text-sm font-medium text-content transition-colors hover:bg-content/10 disabled:opacity-50 sm:w-auto'

export function DeleteFlow({
  open,
  title,
  message,
  confirmLabel,
  typeToConfirm = false,
  requirePassword = false,
  passwordMessage,
  backup,
  isPending,
  error,
  onConfirm,
  onClose,
}: DeleteFlowProps) {
  const [stage, setStage] = useState<DeleteStage>('confirm')
  const [password, setPassword] = useState('')

  if (!open) {
    return null
  }

  const friction = { typeToConfirm, requirePassword }
  const confirmIsFinal = shouldSubmit('confirm', friction)
  const typeIsFinal = shouldSubmit('type', friction)

  function requestClose() {
    if (!isPending) {
      onClose()
    }
  }

  function advance() {
    if (shouldSubmit(stage, friction)) {
      onConfirm(null)
    } else {
      setStage(nextDeleteStage(stage, friction))
    }
  }

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== '') {
      onConfirm(password)
    }
  }

  if (stage === 'confirm') {
    return (
      <ConfirmDialog
        open
        title={title}
        message={message}
        confirmLabel={confirmIsFinal ? confirmLabel : 'Continue'}
        destructive
        isPending={isPending}
        error={error}
        onConfirm={advance}
        onClose={requestClose}
      >
        {backup}
      </ConfirmDialog>
    )
  }

  if (stage === 'type') {
    return (
      <TypeToConfirm
        open
        title="Type DELETE to confirm"
        message={message}
        confirmLabel={typeIsFinal ? confirmLabel : 'Continue'}
        isPending={isPending}
        error={error}
        onConfirm={advance}
        onClose={requestClose}
      />
    )
  }

  if (stage === 'password') {
    return (
      <BottomSheet open onClose={requestClose} title="Enter password">
        <form onSubmit={handlePasswordSubmit} className="space-y-4 pb-2">
          <div className="text-sm text-content-muted">
            {passwordMessage ?? 'Enter the login account password to continue.'}
          </div>
          <label className="block space-y-1">
            <span className="block text-xs text-content-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className={INPUT_CLASS}
            />
          </label>
          {error !== null && (
            <p role="alert" className="text-sm font-medium text-content">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="submit"
              disabled={isPending || password === ''}
              className={DESTRUCTIVE_CLASS}
            >
              {isPending ? 'Working…' : confirmLabel}
            </button>
            <button
              type="button"
              onClick={requestClose}
              disabled={isPending}
              className={CANCEL_CLASS}
            >
              Cancel
            </button>
          </div>
        </form>
      </BottomSheet>
    )
  }

  return null
}

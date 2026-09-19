import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, weightApi } from '../../api/client'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { weightToKg } from '../settings/settingsDraft'

const SUCCESS_MESSAGE_MS = 2500

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

export function WeightQuickEntry() {
  const { unitSystem } = useSettings()
  const queryClient = useQueryClient()
  const [weight, setWeight] = useState<number | null>(null)
  const [bodyFat, setBodyFat] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: weightApi.createEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['weight'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setWeight(null)
      setBodyFat(null)
      setNotes('')
      setDetailsOpen(false)
      setValidationError(null)
      setStatus('Weight saved.')
    },
  })

  useEffect(() => {
    if (status === null) {
      return
    }
    const timer = window.setTimeout(() => setStatus(null), SUCCESS_MESSAGE_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg'
  const weightValid = weight !== null && weight > 0
  const bodyFatValid = bodyFat === null || (bodyFat > 0 && bodyFat < 100)
  const canSave = weightValid && bodyFatValid
  const requestError = mutation.isError ? errorDetail(mutation.error) : null

  function clearMessages() {
    setValidationError(null)
    setStatus(null)
    if (mutation.isError) {
      mutation.reset()
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!weightValid) {
      setValidationError('Enter a weight greater than 0.')
      setStatus(null)
      return
    }
    if (!bodyFatValid) {
      setValidationError('Body fat must be greater than 0 and less than 100.')
      setStatus(null)
      return
    }

    const weightKg = weightToKg(weight, unitSystem)
    if (weightKg === null) {
      return
    }

    setValidationError(null)
    setStatus(null)
    mutation.mutate({
      measured_at: new Date().toISOString(),
      weight_kg: weightKg,
      body_fat_pct: bodyFat,
      notes: notes.trim() === '' ? null : notes.trim(),
    })
  }

  return (
    <section className="rounded-xl border border-line bg-surface-raised p-4">
      <h2 className="text-sm font-semibold tracking-tight">Log weight</h2>

      <form className="mt-3 space-y-3" onSubmit={handleSubmit} noValidate>
        <label className="block">
          <span className="sr-only">Weight ({unitLabel})</span>
          <span className="flex items-center justify-center gap-2">
            <span className="w-full max-w-40">
              <NumberField
                value={weight}
                onChange={(value) => {
                  setWeight(value)
                  clearMessages()
                }}
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                placeholder="0"
                className="border-0! bg-transparent! px-0! text-center! text-4xl! font-semibold! tabular-nums focus:border-0! focus:ring-0!"
              />
            </span>
            <span aria-hidden="true" className="text-lg font-medium text-content-muted">
              {unitLabel}
            </span>
          </span>
        </label>

        <button
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
          className="min-h-11 w-full rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          {detailsOpen ? 'Hide body fat / notes' : 'Add body fat / notes'}
        </button>

        {detailsOpen && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="block text-xs text-content-muted">Body fat % (optional)</span>
              <NumberField
                value={bodyFat}
                onChange={(value) => {
                  setBodyFat(value)
                  clearMessages()
                }}
                inputMode="decimal"
                placeholder="e.g. 18"
              />
              <span className="block text-xs text-content-muted">
                Greater than 0 and less than 100.
              </span>
            </label>

            <label className="block space-y-1">
              <span className="block text-xs text-content-muted">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value)
                  clearMessages()
                }}
                rows={2}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>
          </div>
        )}

        {validationError !== null && (
          <p role="alert" className="text-sm font-medium text-content">
            {validationError}
          </p>
        )}
        {requestError !== null && (
          <p role="alert" className="text-sm font-medium text-content">
            {requestError}
          </p>
        )}
        {status !== null && (
          <p role="status" className="text-sm text-content-muted">
            {status}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSave || mutation.isPending}
          className="min-h-11 w-full rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : 'Save weight'}
        </button>
      </form>
    </section>
  )
}

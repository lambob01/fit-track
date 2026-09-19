import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ApiError, plansApi } from '../../api/client'
import type { Plan, Template } from '../../api/types'
import { BottomSheet } from '../../components/BottomSheet'
import { QueryErrorNotice } from '../lifting/QueryErrorNotice'
import { slotInputsFromDraft } from './planSlots'

export interface PlanEditorProps {
  open: boolean
  plan: Plan | null
  templates: Template[]
  templatesError: boolean
  templatesDetail: string
  onRetryTemplates: () => void
  onClose: () => void
}

const DAYS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
]

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

function initialSlotIds(plan: Plan | null): Record<number, string> {
  const ids: Record<number, string> = {}
  for (const slot of plan?.slots ?? []) {
    if (slot.template_id !== null) {
      ids[slot.day_of_week] = slot.template_id
    }
  }
  return ids
}

export function PlanEditor({
  open,
  plan,
  templates,
  templatesError,
  templatesDetail,
  onRetryTemplates,
  onClose,
}: PlanEditorProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(plan?.name ?? '')
  const [slotIds, setSlotIds] = useState<Record<number, string>>(() => initialSlotIds(plan))
  const [makeActive, setMakeActive] = useState(plan === null ? true : plan.is_active)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const currentSlotNames = useMemo(() => {
    const names = new Map<number, string>()
    for (const slot of plan?.slots ?? []) {
      if (slot.template_id !== null) {
        names.set(slot.day_of_week, slot.template_name ?? 'Current template')
      }
    }
    return names
  }, [plan])

  function invalidatePlans() {
    void queryClient.invalidateQueries({ queryKey: ['plans'] })
    void queryClient.invalidateQueries({ queryKey: ['calendar'] })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const slots = slotInputsFromDraft(slotIds)
      if (plan === null) {
        return plansApi.create({ name: name.trim(), is_active: makeActive, slots })
      }
      const updated = await plansApi.update(plan.id, { name: name.trim(), slots })
      if (makeActive && !updated.is_active) {
        return plansApi.activate(updated.id)
      }
      return updated
    },
    onSuccess: () => {
      invalidatePlans()
      onClose()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (plan === null) {
        throw new Error('No plan to delete')
      }
      return plansApi.remove(plan.id)
    },
    onSuccess: () => {
      invalidatePlans()
      onClose()
    },
  })

  const title = plan === null ? 'New plan' : `Edit ${plan.name}`
  const canSave = name.trim() !== '' && !saveMutation.isPending

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSave) {
            saveMutation.mutate()
          }
        }}
      >
        <label className="block text-sm">
          <span className="font-medium">Plan name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
          />
        </label>

        {templatesError && (
          <QueryErrorNotice
            message="Could not load your templates. Assignments are read-only until this is fixed."
            detail={templatesDetail}
            onRetry={onRetryTemplates}
          />
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Weekly schedule</legend>
          {DAYS.map(({ value, label }) => {
            const selectedId = slotIds[value] ?? ''
            const selectedUnavailable =
              selectedId !== '' && !templates.some((template) => template.id === selectedId)
            return (
              <label key={value} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-content-muted">{label}</span>
                <select
                  value={selectedId}
                  disabled={templatesError}
                  onChange={(event) =>
                    setSlotIds((current) => ({ ...current, [value]: event.target.value }))
                  }
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-accent disabled:opacity-50"
                >
                  <option value="">Rest</option>
                  {selectedUnavailable && (
                    <option value={selectedId}>
                      {currentSlotNames.get(value) ?? 'Current template'} (current)
                    </option>
                  )}
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </fieldset>

        {plan !== null && plan.is_active ? (
          <p className="text-sm text-content-muted">This plan is active.</p>
        ) : (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={makeActive}
              onChange={(event) => setMakeActive(event.target.checked)}
            />
            Make this the active plan
          </label>
        )}

        {saveMutation.isError && (
          <p role="alert" className="text-sm text-red-400 light:text-red-600">
            {errorDetail(saveMutation.error)}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSave}
          className="min-h-11 w-full rounded-lg bg-accent-strong px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : plan === null ? 'Create plan' : 'Save plan'}
        </button>

        {plan !== null && (
          <div className="border-t border-line pt-3">
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                  className="min-h-11 flex-1 rounded-lg border border-red-500/60 px-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50 light:text-red-600"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="min-h-11 flex-1 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  deleteMutation.reset()
                  setConfirmingDelete(true)
                }}
                className="min-h-11 w-full rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-red-500/60 hover:text-red-400 light:hover:text-red-600"
              >
                Delete plan
              </button>
            )}
            {deleteMutation.isError && (
              <p role="alert" className="mt-2 text-sm text-red-400 light:text-red-600">
                {errorDetail(deleteMutation.error)}
              </p>
            )}
          </div>
        )}
      </form>
    </BottomSheet>
  )
}

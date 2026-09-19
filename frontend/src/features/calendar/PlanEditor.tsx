import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, plansApi } from '../../api/client'
import type { Plan, Template } from '../../api/types'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
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
  onCreateTemplate: () => void
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
  onCreateTemplate,
}: PlanEditorProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(plan?.name ?? '')
  const [slotIds, setSlotIds] = useState<Record<number, string>>(() => initialSlotIds(plan))
  const [makeActive, setMakeActive] = useState(plan === null ? true : plan.is_active)
  const [deleteOpen, setDeleteOpen] = useState(false)

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
    <>
      <BottomSheet open={open && !deleteOpen} onClose={onClose} title={title}>
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

        {!templatesError && templates.length === 0 && (
          <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
            <p className="text-sm text-content-muted">
              You have no workout templates yet. Create one now or manage them in the templates
              library.
            </p>
            <button
              type="button"
              onClick={onCreateTemplate}
              className="min-h-11 w-full rounded-lg bg-accent-strong px-3 text-sm font-semibold text-surface transition-opacity hover:opacity-90"
            >
              Create a template
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                navigate('/lifting/templates')
              }}
              className="min-h-11 w-full rounded-lg border border-accent/50 px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
            >
              Go to templates
            </button>
          </div>
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
          <p role="alert" className="text-sm font-medium text-content">
            {errorDetail(saveMutation.error)}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSave}
          className="min-h-11 w-full rounded-lg bg-accent-strong px-3 text-sm font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : plan === null ? 'Create plan' : 'Save plan'}
        </button>

        {plan !== null && (
          <div className="border-t border-line pt-3">
            <button
              type="button"
              onClick={() => {
                deleteMutation.reset()
                setDeleteOpen(true)
              }}
              className="min-h-11 w-full rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-content-muted hover:text-content"
            >
              Delete plan
            </button>
          </div>
        )}
      </form>
      </BottomSheet>

      {plan !== null && (
        <ConfirmDialog
          open={deleteOpen}
          title="Delete plan?"
          message={
            plan.is_active
              ? `Delete “${plan.name}”? It is the active plan; afterwards the calendar will show no active plan.`
              : `Delete “${plan.name}”? This cannot be undone.`
          }
          confirmLabel="Delete"
          destructive
          isPending={deleteMutation.isPending}
          error={deleteMutation.isError ? errorDetail(deleteMutation.error) : null}
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => {
            deleteMutation.reset()
            setDeleteOpen(false)
          }}
        />
      )}
    </>
  )
}

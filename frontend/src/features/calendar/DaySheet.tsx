import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError, plansApi } from '../../api/client'
import type { CalendarDay, Plan, Template } from '../../api/types'
import { BottomSheet } from '../../components/BottomSheet'
import { formatDateKey } from '../../lib/datetime'
import { slotsWithAssignment } from './planSlots'

export interface DaySheetProps {
  open: boolean
  day: CalendarDay | null
  plan: Plan | null
  templates: Template[]
  templatesError: boolean
  onClose: () => void
  onCreatePlan: () => void
  onCreateTemplate: () => void
}

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

export function DaySheet({
  open,
  day,
  plan,
  templates,
  templatesError,
  onClose,
  onCreatePlan,
  onCreateTemplate,
}: DaySheetProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const assignMutation = useMutation({
    mutationFn: (templateId: string | null) => {
      if (plan === null || day === null) {
        throw new Error('No active plan')
      }
      return plansApi.update(plan.id, {
        slots: slotsWithAssignment(plan, day.day_of_week, templateId),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plans'] })
      void queryClient.invalidateQueries({ queryKey: ['calendar'] })
      onClose()
    },
  })

  const currentTemplateId = day?.template_id ?? null
  const currentTemplateMissing =
    currentTemplateId !== null && !templates.some((template) => template.id === currentTemplateId)

  function optionClass(selected: boolean): string {
    return [
      'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
      selected
        ? 'border-accent text-accent'
        : 'border-line hover:border-accent hover:text-accent',
    ].join(' ')
  }

  return (
    <BottomSheet
      open={open && day !== null}
      onClose={onClose}
      title={day === null ? undefined : formatDateKey(day.date, 'EEEE, MMM d')}
    >
      {day !== null && plan === null && (
        <div className="space-y-3">
          <p className="text-sm text-content-muted">
            You do not have an active plan, so every day is a rest day.
          </p>
          <button
            type="button"
            onClick={onCreatePlan}
            className="min-h-11 w-full rounded-lg bg-accent-strong px-3 text-sm font-semibold text-surface transition-opacity hover:opacity-90"
          >
            Create a plan
          </button>
        </div>
      )}

      {day !== null && plan !== null && (
        <div className="space-y-2">
          <p className="text-xs text-content-muted">
            {plan.name} · Day {day.day_of_week + 1} of the week
          </p>

          {templatesError ? (
            <p role="alert" className="text-sm text-content-muted">
              Your templates could not be loaded, so this day cannot be assigned right now. Close
              this sheet and retry.
            </p>
          ) : (
            <>
              <button
                type="button"
                aria-pressed={currentTemplateId === null}
                disabled={assignMutation.isPending}
                onClick={() => assignMutation.mutate(null)}
                className={optionClass(currentTemplateId === null)}
              >
                <span>Rest day</span>
                {currentTemplateId === null && <span aria-hidden="true">✓</span>}
              </button>

              {currentTemplateMissing && (
                <button
                  type="button"
                  aria-pressed
                  disabled={assignMutation.isPending}
                  onClick={() => assignMutation.mutate(currentTemplateId)}
                  className={optionClass(true)}
                >
                  <span>{day.template_name ?? 'Current template'}</span>
                  <span aria-hidden="true">✓</span>
                </button>
              )}

              {templates.map((template) => {
                const selected = currentTemplateId === template.id
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={assignMutation.isPending}
                    onClick={() => assignMutation.mutate(template.id)}
                    className={optionClass(selected)}
                  >
                    <span className="truncate">{template.name}</span>
                    {selected && <span aria-hidden="true">✓</span>}
                  </button>
                )
              })}

              {templates.length === 0 && !currentTemplateMissing && (
                <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
                  <p className="text-sm text-content-muted">
                    You have no workout templates yet. Create one now or manage them in the
                    templates library.
                  </p>
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
            </>
          )}

          <button
            type="button"
            disabled={assignMutation.isPending}
            onClick={onCreateTemplate}
            className="min-h-11 w-full rounded-lg border border-dashed border-line px-3 text-sm font-semibold text-content-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            New template
          </button>

          {assignMutation.isError && (
            <p role="alert" className="pt-1 text-sm font-medium text-content">
              {errorDetail(assignMutation.error)}
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

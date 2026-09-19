import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, calendarApi, plansApi, templatesApi, workoutsApi } from '../../api/client'
import type { CalendarDay, Plan } from '../../api/types'
import { useSettings } from '../../context/SettingsContext'
import { addDaysToDateKey, formatDateKey, localDateKey, todayDateKey } from '../../lib/datetime'
import { QueryErrorNotice } from '../lifting/QueryErrorNotice'
import { DaySheet } from './DaySheet'
import { PlanEditor } from './PlanEditor'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

export function CalendarPage() {
  const { timezone } = useSettings()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [editor, setEditor] = useState<{ open: boolean; plan: Plan | null }>({
    open: false,
    plan: null,
  })

  const calendarQuery = useQuery({
    queryKey: ['calendar', weekStart, timezone],
    queryFn: () => calendarApi.week(weekStart ?? undefined),
  })

  const plansQuery = useQuery({
    queryKey: ['plans'],
    queryFn: plansApi.list,
  })

  const templatesQuery = useQuery({
    queryKey: ['templates', false],
    queryFn: () => templatesApi.list(false),
    staleTime: 5 * 60 * 1000,
  })

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data])
  const activePlan = useMemo(() => plans.find((plan) => plan.is_active) ?? null, [plans])
  const effectivePlanId = useMemo(() => {
    if (selectedPlanId !== '' && plans.some((plan) => plan.id === selectedPlanId)) {
      return selectedPlanId
    }
    return activePlan?.id ?? plans[0]?.id ?? ''
  }, [selectedPlanId, plans, activePlan])
  const effectivePlan = plans.find((plan) => plan.id === effectivePlanId) ?? null

  const activateMutation = useMutation({
    mutationFn: plansApi.activate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plans'] })
      void queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
  })

  const startMutation = useMutation({
    mutationFn: (templateId: string) => workoutsApi.startFromTemplate(templateId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['calendar'] })
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      navigate(`/lifting/workouts/${result.workout.id}`, { state: { planned: result.planned } })
    },
  })

  const calendar = calendarQuery.data
  const startKey = calendar === undefined ? null : localDateKey(calendar.week_start, timezone)
  const endKey = startKey === null ? null : addDaysToDateKey(startKey, 6)
  const today = todayDateKey(timezone)

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">Calendar</h1>

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous week"
            disabled={startKey === null}
            onClick={() => {
              if (startKey !== null) {
                setWeekStart(addDaysToDateKey(startKey, -7))
              }
            }}
            className="min-h-11 min-w-11 rounded-lg border border-line text-lg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            ←
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-medium">
              {startKey === null || endKey === null
                ? 'Loading week…'
                : `${formatDateKey(startKey, 'MMM d')} – ${formatDateKey(endKey, 'MMM d, yyyy')}`}
            </p>
            {calendar !== undefined &&
              (calendar.plan === null ? (
                <p className="text-xs text-content-muted">No active plan</p>
              ) : (
                <p className="text-xs text-content-muted">
                  {calendar.adherence.completed_days}/{calendar.adherence.planned_days} planned
                  workouts completed
                </p>
              ))}
          </div>
          <button
            type="button"
            aria-label="Next week"
            disabled={startKey === null}
            onClick={() => {
              if (startKey !== null) {
                setWeekStart(addDaysToDateKey(startKey, 7))
              }
            }}
            className="min-h-11 min-w-11 rounded-lg border border-line text-lg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            →
          </button>
        </div>
        <button
          type="button"
          onClick={() => setWeekStart(null)}
          className="mt-2 min-h-11 w-full rounded-lg border border-line text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Today
        </button>
      </section>

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Plan</h2>
          <button
            type="button"
            onClick={() => setEditor({ open: true, plan: null })}
            className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            New plan
          </button>
        </div>

        {plansQuery.isPending ? (
          <p className="mt-2 text-sm text-content-muted">Loading plans…</p>
        ) : plansQuery.isError ? (
          <QueryErrorNotice
            className="mt-2"
            message="Could not load your plans."
            detail={errorDetail(plansQuery.error)}
            onRetry={() => void plansQuery.refetch()}
          />
        ) : plans.length === 0 ? (
          <p className="mt-2 text-sm text-content-muted">
            No plans yet. Create one to schedule workouts on the calendar.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label="Plan"
                value={effectivePlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-accent"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                    {plan.is_active ? ' (active)' : ''}
                  </option>
                ))}
              </select>
              {effectivePlan !== null && !effectivePlan.is_active && (
                <button
                  type="button"
                  disabled={activateMutation.isPending}
                  onClick={() => activateMutation.mutate(effectivePlan.id)}
                  className="min-h-11 rounded-lg border border-accent/50 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                >
                  {activateMutation.isPending ? 'Activating…' : 'Activate'}
                </button>
              )}
              {effectivePlan !== null && (
                <button
                  type="button"
                  onClick={() => setEditor({ open: true, plan: effectivePlan })}
                  className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  Edit
                </button>
              )}
            </div>
            {effectivePlan !== null && !effectivePlan.is_active && (
              <p className="mt-1 text-xs text-content-muted">
                Only the active plan is shown below.
              </p>
            )}
          </>
        )}

        {activateMutation.isError && (
          <p role="alert" className="mt-2 text-sm font-medium text-content">
            {errorDetail(activateMutation.error)}
          </p>
        )}
      </section>

      {startMutation.isError && (
        <QueryErrorNotice
          message="Could not start the workout."
          detail={errorDetail(startMutation.error)}
        />
      )}

      {templatesQuery.isError && (
        <QueryErrorNotice
          message="Could not load your templates; day assignment is unavailable."
          detail={errorDetail(templatesQuery.error)}
          onRetry={() => void templatesQuery.refetch()}
        />
      )}

      {calendarQuery.isPending ? (
        <p className="text-sm text-content-muted">Loading calendar…</p>
      ) : calendarQuery.isError ? (
        <QueryErrorNotice
          message="Could not load the calendar."
          detail={errorDetail(calendarQuery.error)}
          onRetry={() => void calendarQuery.refetch()}
        />
      ) : (
        <ul className="space-y-2">
          {calendarQuery.data.days.map((day) => {
            const isToday = day.date === today
            const templateId = day.template_id
            return (
              <li
                key={day.date}
                className={[
                  'flex items-stretch overflow-hidden rounded-xl border bg-surface-raised',
                  isToday ? 'border-accent' : 'border-line',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className="flex min-h-14 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                >
                  <span className="w-12 shrink-0">
                    <span
                      className={[
                        'block text-xs',
                        isToday ? 'font-semibold text-accent' : 'text-content-muted',
                      ].join(' ')}
                    >
                      {isToday ? 'Today' : formatDateKey(day.date, 'EEE')}
                    </span>
                    <span className="block text-lg font-semibold tabular-nums">
                      {formatDateKey(day.date, 'd')}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {day.template_name ?? 'Rest'}
                    </span>
                    {day.completed && (
                      <span className="block text-xs text-content-muted">
                        ✓ Done
                        {day.workout_ids.length > 1 ? ` (${day.workout_ids.length})` : ''}
                      </span>
                    )}
                  </span>
                </button>
                {templateId !== null && (
                  <div className="flex shrink-0 items-center border-l border-line px-2">
                    <button
                      type="button"
                      disabled={startMutation.isPending && startMutation.variables === templateId}
                      onClick={() => startMutation.mutate(templateId)}
                      className="min-h-11 rounded-lg border border-accent/50 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                    >
                      {startMutation.isPending && startMutation.variables === templateId
                        ? 'Starting…'
                        : 'Start'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <DaySheet
        open={selectedDay !== null}
        day={selectedDay}
        plan={activePlan}
        templates={templatesQuery.data ?? []}
        templatesError={templatesQuery.isError}
        onClose={() => setSelectedDay(null)}
        onCreatePlan={() => {
          setSelectedDay(null)
          setEditor({ open: true, plan: null })
        }}
      />

      {editor.open && (
        <PlanEditor
          key={editor.plan?.id ?? 'new'}
          open
          plan={editor.plan}
          templates={templatesQuery.data ?? []}
          templatesError={templatesQuery.isError}
          templatesDetail={templatesQuery.isError ? errorDetail(templatesQuery.error) : ''}
          onRetryTemplates={() => void templatesQuery.refetch()}
          onClose={() => setEditor({ open: false, plan: null })}
        />
      )}
    </div>
  )
}

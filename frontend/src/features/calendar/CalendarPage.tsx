import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, calendarApi, plansApi, templatesApi, workoutsApi } from '../../api/client'
import type { CalendarDay, Plan } from '../../api/types'
import { useSettings } from '../../context/SettingsContext'
import {
  buildListDays,
  listWorkoutQuery,
  periodRange,
  shiftPeriod,
  sumAdherence,
  type CalendarMode,
  type CalendarPeriod,
} from '../../lib/calendarRange'
import { formatDateKey, mondayOfDateKey, todayDateKey } from '../../lib/datetime'
import { QueryErrorNotice } from '../lifting/QueryErrorNotice'
import { CalendarList } from './CalendarList'
import { DaySheet } from './DaySheet'
import { MonthGrid } from './MonthGrid'
import { PlanEditor } from './PlanEditor'
import { TemplateQuickCreate } from './TemplateQuickCreate'

const MODE_OPTIONS: { value: CalendarMode; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'list', label: 'List' },
]

type QuickCreateState = { kind: 'day'; plan: Plan; dayOfWeek: number } | { kind: 'editor' }

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
  const { timezone, unitSystem } = useSettings()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<CalendarMode>('week')
  const [anchor, setAnchor] = useState<string | null>(null)
  const [listPeriod, setListPeriod] = useState<CalendarPeriod>('week')
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [editor, setEditor] = useState<{ open: boolean; plan: Plan | null }>({
    open: false,
    plan: null,
  })
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null)

  const today = todayDateKey(timezone)
  const anchorKey = anchor ?? today
  const activePeriod: CalendarPeriod =
    mode === 'month' ? 'month' : mode === 'week' ? 'week' : listPeriod
  const range = periodRange(activePeriod, anchorKey)

  const weekQuery = useQuery({
    queryKey: ['calendar', 'week', anchor, timezone],
    queryFn: () => calendarApi.week(anchor === null ? undefined : mondayOfDateKey(anchor)),
    enabled: mode === 'week',
  })

  const rangeQuery = useQuery({
    queryKey: ['calendar', 'range', range.from, range.to, timezone],
    queryFn: () => calendarApi.range(range.from, range.to),
    enabled: mode !== 'week',
  })

  const workoutQuery = listWorkoutQuery(activePeriod, anchorKey, timezone)
  const listQuery = useQuery({
    queryKey: ['workouts', 'calendar-list', workoutQuery.from, workoutQuery.to],
    queryFn: () => workoutsApi.listRange(workoutQuery),
    enabled: mode === 'list',
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

  const calendarQuery = mode === 'week' ? weekQuery : rangeQuery
  const calendar = calendarQuery.data

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data])
  const activePlan = useMemo(() => plans.find((plan) => plan.is_active) ?? null, [plans])
  const effectivePlanId = useMemo(() => {
    if (selectedPlanId !== '' && plans.some((plan) => plan.id === selectedPlanId)) {
      return selectedPlanId
    }
    return activePlan?.id ?? plans[0]?.id ?? ''
  }, [selectedPlanId, plans, activePlan])
  const effectivePlan = plans.find((plan) => plan.id === effectivePlanId) ?? null

  const daysByDate = useMemo(() => {
    const map = new Map<string, CalendarDay>()
    for (const day of calendar?.days ?? []) {
      map.set(day.date, day)
    }
    return map
  }, [calendar])

  const listRows = useMemo(() => {
    if (mode !== 'list' || calendar === undefined || listQuery.data === undefined) {
      return []
    }
    return buildListDays(
      calendar.days,
      listQuery.data,
      { from: workoutQuery.from, to: workoutQuery.to },
      timezone,
      today,
    )
  }, [mode, calendar, listQuery.data, workoutQuery.from, workoutQuery.to, timezone, today])

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

  function selectMode(next: CalendarMode) {
    if (next === 'list' && mode !== 'list') {
      setListPeriod(mode)
    }
    setMode(next)
  }

  function stepPeriod(delta: number) {
    const period: CalendarPeriod = mode === 'list' ? listPeriod : mode
    setAnchor(shiftPeriod(period, anchorKey, delta))
  }

  const periodLabel =
    activePeriod === 'month'
      ? formatDateKey(range.from, 'MMMM yyyy')
      : `${formatDateKey(range.from, 'MMM d')} – ${formatDateKey(range.to, 'MMM d, yyyy')}`
  const adherence =
    calendar === undefined
      ? null
      : mode === 'week'
        ? calendar.adherence
        : sumAdherence(calendar.weeks)

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">Calendar</h1>

      <section className="rounded-xl border border-line bg-surface-raised p-2">
        <div role="group" aria-label="Calendar view" className="grid grid-cols-3 gap-1">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => selectMode(option.value)}
              className={[
                'min-h-11 rounded-lg border text-sm font-medium transition-colors',
                mode === option.value
                  ? 'border-accent bg-accent text-surface'
                  : 'border-line bg-surface text-content-muted hover:border-content-muted hover:text-content',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous period"
            onClick={() => stepPeriod(-1)}
            className="min-h-11 min-w-11 rounded-lg border border-line text-lg transition-colors hover:border-accent hover:text-accent"
          >
            ←
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-medium">{periodLabel}</p>
            {adherence !== null &&
              (calendar?.plan === null ? (
                <p className="text-xs text-content-muted">No active plan</p>
              ) : (
                <p className="text-xs text-content-muted">
                  {adherence.completed_days}/{adherence.planned_days} planned workouts completed
                </p>
              ))}
          </div>
          <button
            type="button"
            aria-label="Next period"
            onClick={() => stepPeriod(1)}
            className="min-h-11 min-w-11 rounded-lg border border-line text-lg transition-colors hover:border-accent hover:text-accent"
          >
            →
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAnchor(null)}
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

      {mode === 'week' &&
        (weekQuery.isPending ? (
          <p className="text-sm text-content-muted">Loading calendar…</p>
        ) : weekQuery.isError ? (
          <QueryErrorNotice
            message="Could not load the calendar."
            detail={errorDetail(weekQuery.error)}
            onRetry={() => void weekQuery.refetch()}
          />
        ) : (
          <ul className="space-y-2">
            {weekQuery.data.days.map((day) => {
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
        ))}

      {mode === 'month' &&
        (rangeQuery.isPending ? (
          <p className="text-sm text-content-muted">Loading month…</p>
        ) : rangeQuery.isError ? (
          <QueryErrorNotice
            message="Could not load the calendar."
            detail={errorDetail(rangeQuery.error)}
            onRetry={() => void rangeQuery.refetch()}
          />
        ) : (
          <MonthGrid
            monthDateKey={range.from}
            days={rangeQuery.data.days}
            today={today}
            onSelectDay={setSelectedDay}
          />
        ))}

      {mode === 'list' &&
        (rangeQuery.isPending || listQuery.isPending ? (
          <p className="text-sm text-content-muted">Loading list…</p>
        ) : rangeQuery.isError ? (
          <QueryErrorNotice
            message="Could not load the calendar."
            detail={errorDetail(rangeQuery.error)}
            onRetry={() => void rangeQuery.refetch()}
          />
        ) : listQuery.isError ? (
          <QueryErrorNotice
            message="Could not load the workouts."
            detail={errorDetail(listQuery.error)}
            onRetry={() => void listQuery.refetch()}
          />
        ) : (
          <CalendarList
            rows={listRows}
            unitSystem={unitSystem}
            today={today}
            onSelectDay={(date) => setSelectedDay(daysByDate.get(date) ?? null)}
          />
        ))}

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
        onCreateTemplate={() => {
          if (selectedDay === null || activePlan === null) {
            return
          }
          setQuickCreate({
            kind: 'day',
            plan: activePlan,
            dayOfWeek: selectedDay.day_of_week,
          })
          setSelectedDay(null)
        }}
      />

      {editor.open && (
        <PlanEditor
          key={editor.plan?.id ?? 'new'}
          open={quickCreate === null}
          plan={editor.plan}
          templates={templatesQuery.data ?? []}
          templatesError={templatesQuery.isError}
          templatesDetail={templatesQuery.isError ? errorDetail(templatesQuery.error) : ''}
          onRetryTemplates={() => void templatesQuery.refetch()}
          onClose={() => setEditor({ open: false, plan: null })}
          onCreateTemplate={() => setQuickCreate({ kind: 'editor' })}
        />
      )}

      {quickCreate !== null && (
        <TemplateQuickCreate
          open
          assignment={
            quickCreate.kind === 'day'
              ? { plan: quickCreate.plan, dayOfWeek: quickCreate.dayOfWeek }
              : null
          }
          onClose={() => setQuickCreate(null)}
        />
      )}
    </div>
  )
}

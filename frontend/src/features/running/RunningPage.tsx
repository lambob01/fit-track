import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, cardioApi } from '../../api/client'
import type { CardioActivity, CardioActivityInput } from '../../api/types'
import { DateRangePicker } from '../../components/DateRangePicker'
import { ProgressBar } from '../../components/ProgressBar'
import { useSettings } from '../../context/SettingsContext'
import { getPresetRange } from '../../lib/dateRange'
import type { DateRange } from '../../lib/dateRange'
import { formatLocal } from '../../lib/datetime'
import { formatDuration } from '../../lib/duration'
import { formatDistance, formatPace } from '../../lib/units'
import { CARDIO_TYPE_LABELS, CardioForm } from './CardioForm'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

export function RunningPage() {
  const { unitSystem, timezone } = useSettings()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [range, setRange] = useState<DateRange>(() => getPresetRange('30d', timezone))
  const [formOpen, setFormOpen] = useState(() => searchParams.get('add') === '1')
  const [editing, setEditing] = useState<CardioActivity | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const activitiesQuery = useQuery({
    queryKey: ['cardio', 'activities'],
    queryFn: () => cardioApi.list({ limit: 100 }),
  })

  const summaryQuery = useQuery({
    queryKey: ['cardio', 'summary', range.from, range.to],
    queryFn: () => cardioApi.summary({ from: range.from, to: range.to }),
  })

  const weekQuery = useQuery({
    queryKey: ['cardio', 'week'],
    queryFn: () => cardioApi.week(),
  })

  function invalidateCardioData() {
    void queryClient.invalidateQueries({ queryKey: ['cardio'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const createMutation = useMutation({
    mutationFn: cardioApi.create,
    onSuccess: () => {
      invalidateCardioData()
      setEditing(null)
      setFormOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CardioActivityInput }) =>
      cardioApi.update(id, patch),
    onSuccess: () => {
      invalidateCardioData()
      setEditing(null)
      setFormOpen(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: cardioApi.remove,
    onSuccess: () => {
      invalidateCardioData()
      setPendingDeleteId(null)
    },
  })

  const formVisible = formOpen || editing !== null
  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.isError
    ? errorDetail(createMutation.error)
    : updateMutation.isError
      ? errorDetail(updateMutation.error)
      : null

  useEffect(() => {
    if (formVisible) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [formVisible, editing])

  function resetSaveMutations() {
    createMutation.reset()
    updateMutation.reset()
  }

  function openAddForm() {
    resetSaveMutations()
    setEditing(null)
    setFormOpen(true)
  }

  function openEditForm(activity: CardioActivity) {
    resetSaveMutations()
    setEditing(activity)
    setFormOpen(true)
  }

  function closeForm() {
    resetSaveMutations()
    setEditing(null)
    setFormOpen(false)
  }

  function handleSubmit(input: CardioActivityInput) {
    if (editing !== null) {
      updateMutation.mutate({ id: editing.id, patch: input })
    } else {
      createMutation.mutate(input)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Running</h1>
        {!formVisible && (
          <button
            type="button"
            onClick={openAddForm}
            className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Add activity
          </button>
        )}
      </div>

      {formVisible && (
        <div ref={formRef}>
          <CardioForm
            key={editing?.id ?? 'new'}
            activity={editing}
            isSaving={isSaving}
            error={saveError}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="text-sm font-semibold tracking-tight">Summary</h2>
        <DateRangePicker
          className="mt-2"
          value={range}
          onChange={setRange}
          defaultPreset="30d"
        />

        {summaryQuery.isPending ? (
          <p className="mt-3 text-sm text-content-muted">Loading summary…</p>
        ) : summaryQuery.isError ? (
          <div role="alert" className="mt-3 text-sm">
            <p className="font-medium">Could not load the summary.</p>
            <p className="mt-1 text-content-muted">{errorDetail(summaryQuery.error)}</p>
            <button
              type="button"
              onClick={() => void summaryQuery.refetch()}
              className="mt-3 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Retry
            </button>
          </div>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Distance"
              value={formatDistance(summaryQuery.data.total_distance_m, unitSystem)}
            />
            <Stat label="Time" value={formatDuration(summaryQuery.data.total_duration_s)} />
            <Stat
              label="Avg pace"
              value={
                summaryQuery.data.avg_pace_s_per_km === null
                  ? '—'
                  : formatPace(summaryQuery.data.avg_pace_s_per_km, unitSystem)
              }
            />
            <Stat label="Activities" value={String(summaryQuery.data.activity_count)} />
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">This week</h2>
          {weekQuery.isSuccess && (
            <span className="text-xs text-content-muted">
              {formatLocal(weekQuery.data.week_start, timezone, 'MMM d')} –{' '}
              {formatLocal(weekQuery.data.week_end, timezone, 'MMM d')}
            </span>
          )}
        </div>

        {weekQuery.isPending ? (
          <p className="mt-2 text-sm text-content-muted">Loading this week…</p>
        ) : weekQuery.isError ? (
          <div role="alert" className="mt-2 text-sm">
            <p className="text-content-muted">{errorDetail(weekQuery.error)}</p>
            <button
              type="button"
              onClick={() => void weekQuery.refetch()}
              className="mt-2 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {formatDistance(weekQuery.data.total_distance_m, unitSystem)}
            </p>
            <p className="mt-1 text-sm text-content-muted">
              {weekQuery.data.activity_count === 1
                ? '1 activity'
                : `${weekQuery.data.activity_count} activities`}
              {weekQuery.data.total_duration_s > 0 &&
                ` · ${formatDuration(weekQuery.data.total_duration_s)}`}
              {weekQuery.data.avg_pace_s_per_km !== null &&
                ` · ${formatPace(weekQuery.data.avg_pace_s_per_km, unitSystem)} avg`}
            </p>
            {weekQuery.data.weekly_goal_m !== null && (
              <ProgressBar
                className="mt-3"
                label={`Weekly goal · ${formatDistance(weekQuery.data.weekly_goal_m, unitSystem)}`}
                value={weekQuery.data.total_distance_m}
                max={weekQuery.data.weekly_goal_m}
              />
            )}
          </>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface-raised p-4">
        <h2 className="text-sm font-semibold tracking-tight">Activities</h2>

        {activitiesQuery.isPending ? (
          <p className="mt-3 text-sm text-content-muted">Loading activities…</p>
        ) : activitiesQuery.isError ? (
          <div role="alert" className="mt-3 text-sm">
            <p className="font-medium">Could not load your activities.</p>
            <p className="mt-1 text-content-muted">{errorDetail(activitiesQuery.error)}</p>
            <button
              type="button"
              onClick={() => void activitiesQuery.refetch()}
              className="mt-3 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Retry
            </button>
          </div>
        ) : activitiesQuery.data.length === 0 ? (
          <p className="mt-3 text-sm text-content-muted">No activities logged yet.</p>
        ) : (
          <ul className="mt-1">
            {activitiesQuery.data.map((activity) => (
              <li
                key={activity.id}
                className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {CARDIO_TYPE_LABELS[activity.type]}
                    {activity.route_name !== null && activity.route_name !== '' && (
                      <span className="font-normal text-content-muted">
                        {' '}
                        · {activity.route_name}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm tabular-nums">
                    {activity.distance_m !== null &&
                      `${formatDistance(activity.distance_m, unitSystem)} · `}
                    {formatDuration(activity.duration_s)}
                    {activity.pace_s_per_km !== null &&
                      ` · ${formatPace(activity.pace_s_per_km, unitSystem)}`}
                  </p>
                  <p className="mt-0.5 text-xs text-content-muted">
                    {formatLocal(activity.performed_at, timezone, 'MMM d, yyyy · h:mm a')}
                    {activity.avg_hr !== null && ` · ${activity.avg_hr} bpm`}
                  </p>
                  {activity.notes !== null && activity.notes !== '' && (
                    <p className="mt-1 text-sm break-words">{activity.notes}</p>
                  )}
                </div>

                {pendingDeleteId === activity.id ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(activity.id)}
                      className="min-h-11 rounded-lg border border-red-500/60 px-3 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50 light:text-red-600"
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditForm(activity)}
                      className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteMutation.reset()
                        setPendingDeleteId(activity.id)
                      }}
                      className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-red-500/60 hover:text-red-400 light:hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {deleteMutation.isError && (
          <p role="alert" className="mt-3 text-sm text-red-400 light:text-red-600">
            {errorDetail(deleteMutation.error)}
          </p>
        )}
      </section>
    </div>
  )
}

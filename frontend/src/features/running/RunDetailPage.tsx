import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, cardioApi, shoesApi } from '../../api/client'
import type { CardioActivityInput } from '../../api/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useSettings } from '../../context/SettingsContext'
import { formatLocal } from '../../lib/datetime'
import { formatDuration } from '../../lib/duration'
import { formatDistance, formatPace } from '../../lib/units'
import { QueryErrorNotice } from '../lifting/QueryErrorNotice'
import { CARDIO_TYPE_LABELS, CardioForm } from './CardioForm'
import { SplitTable } from './SplitTable'
import { ZonesBar } from './ZonesBar'

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

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { unitSystem, timezone } = useSettings()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const activityQuery = useQuery({
    queryKey: ['cardio', 'activity', id],
    queryFn: () => cardioApi.get(id!),
    enabled: id !== undefined,
  })

  const splitsQuery = useQuery({
    queryKey: ['cardio', 'splits', id],
    queryFn: () => cardioApi.splits(id!),
    enabled: id !== undefined,
  })

  const zonesQuery = useQuery({
    queryKey: ['cardio', 'zones', id],
    queryFn: () => cardioApi.zones(id!),
    enabled: id !== undefined,
  })

  const shoesQuery = useQuery({
    queryKey: ['shoes'],
    queryFn: () => shoesApi.list(),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id: activityId, patch }: { id: string; patch: CardioActivityInput }) =>
      cardioApi.update(activityId, patch),
    onSuccess: () => {
      invalidateTrainingData()
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: cardioApi.remove,
    onSuccess: () => {
      invalidateTrainingData()
      navigate('/running', { replace: true })
    },
  })

  function invalidateTrainingData() {
    void queryClient.invalidateQueries({ queryKey: ['cardio'] })
    void queryClient.invalidateQueries({ queryKey: ['shoes'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  if (id === undefined) {
    return null
  }

  const activity = activityQuery.data

  if (activityQuery.isPending) {
    return <p className="text-sm text-content-muted">Loading run…</p>
  }

  if (activityQuery.isError || activity === undefined) {
    return (
      <div className="space-y-4">
        <Link
          to="/running"
          className="text-sm font-medium text-content-muted transition-colors hover:text-content"
        >
          ← Running
        </Link>
        <QueryErrorNotice
          message="Could not load this run."
          detail={errorDetail(activityQuery.error)}
          onRetry={() => void activityQuery.refetch()}
        />
      </div>
    )
  }

  const shoeName =
    activity.shoe_id === null
      ? null
      : ((shoesQuery.data ?? []).find((shoe) => shoe.id === activity.shoe_id)?.name ?? null)

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/running"
          className="text-sm font-medium text-content-muted transition-colors hover:text-content"
        >
          ← Running
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">
              {CARDIO_TYPE_LABELS[activity.type]}
              {activity.route_name !== null && activity.route_name !== '' && (
                <span className="font-normal text-content-muted"> · {activity.route_name}</span>
              )}
            </h1>
            <p className="mt-0.5 text-xs text-content-muted">
              {formatLocal(activity.performed_at, timezone, 'MMM d, yyyy · h:mm a')}
              {shoeName !== null && ` · ${shoeName}`}
            </p>
          </div>

          {!editing && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  updateMutation.reset()
                  setEditing(true)
                }}
                className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteMutation.reset()
                  setConfirmingDelete(true)
                }}
                className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-red-500/60 hover:text-red-400 light:hover:text-red-600"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {editing ? (
        splitsQuery.isSuccess ? (
          <CardioForm
            activity={activity}
            shoes={shoesQuery.data ?? []}
            initialSplits={splitsQuery.data.source === 'stored' ? splitsQuery.data.splits : []}
            isSaving={updateMutation.isPending}
            error={updateMutation.isError ? errorDetail(updateMutation.error) : null}
            onSubmit={(input) => updateMutation.mutate({ id: activity.id, patch: input })}
            onCancel={() => {
              updateMutation.reset()
              setEditing(false)
            }}
          />
        ) : (
          <div className="space-y-2">
            {splitsQuery.isError ? (
              <QueryErrorNotice
                message="Could not load splits for editing."
                detail={errorDetail(splitsQuery.error)}
                onRetry={() => void splitsQuery.refetch()}
              />
            ) : (
              <p className="rounded-xl border border-line bg-surface-raised p-4 text-sm text-content-muted">
                Loading splits…
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                updateMutation.reset()
                setEditing(false)
              }}
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
          </div>
        )
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Distance"
              value={
                activity.distance_m === null
                  ? '—'
                  : formatDistance(activity.distance_m, unitSystem)
              }
            />
            <Stat label="Time" value={formatDuration(activity.duration_s)} />
            <Stat
              label="Avg pace"
              value={
                activity.pace_s_per_km === null
                  ? '—'
                  : formatPace(activity.pace_s_per_km, unitSystem)
              }
            />
            <Stat
              label="Avg HR"
              value={activity.avg_hr === null ? '—' : `${activity.avg_hr} bpm`}
            />
          </dl>

          {activity.notes !== null && activity.notes !== '' && (
            <section className="rounded-xl border border-line bg-surface-raised p-4">
              <h2 className="text-sm font-semibold tracking-tight">Notes</h2>
              <p className="mt-2 text-sm break-words whitespace-pre-wrap">{activity.notes}</p>
            </section>
          )}

          {splitsQuery.isPending ? (
            <p className="rounded-xl border border-line bg-surface-raised p-4 text-sm text-content-muted">
              Loading splits…
            </p>
          ) : splitsQuery.isError ? (
            <QueryErrorNotice
              message="Could not load splits."
              detail={errorDetail(splitsQuery.error)}
              onRetry={() => void splitsQuery.refetch()}
            />
          ) : (
            <SplitTable
              splits={splitsQuery.data.splits}
              source={splitsQuery.data.source}
              unitSystem={unitSystem}
            />
          )}

          {zonesQuery.isError ? (
            <QueryErrorNotice
              message="Could not load heart rate zones."
              detail={errorDetail(zonesQuery.error)}
              onRetry={() => void zonesQuery.refetch()}
            />
          ) : zonesQuery.isSuccess ? (
            <ZonesBar zones={zonesQuery.data} avgHr={activity.avg_hr} />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete activity"
        message="Delete this activity? This cannot be undone."
        confirmLabel="Delete"
        destructive
        isPending={deleteMutation.isPending}
        error={deleteMutation.isError ? errorDetail(deleteMutation.error) : null}
        onConfirm={() => deleteMutation.mutate(activity.id)}
        onClose={() => {
          deleteMutation.reset()
          setConfirmingDelete(false)
        }}
      />
    </div>
  )
}

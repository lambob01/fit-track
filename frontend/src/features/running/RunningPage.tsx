import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, cardioApi, shoesApi } from '../../api/client'
import type {
  CardioActivity,
  CardioActivityInput,
  CardioPrValue,
  CardioPrs,
  Shoe,
  ShoeInput,
  UnitSystem,
} from '../../api/types'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DateRangePicker } from '../../components/DateRangePicker'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { getPresetRange } from '../../lib/dateRange'
import type { DateRange } from '../../lib/dateRange'
import { formatDateKey, formatLocal } from '../../lib/datetime'
import { formatDuration } from '../../lib/duration'
import {
  distanceForDisplay,
  distanceToMeters,
  formatDistance,
  formatPace,
} from '../../lib/units'
import { QueryErrorNotice } from '../lifting/QueryErrorNotice'
import { CARDIO_TYPE_LABELS, CardioForm } from './CardioForm'
import { PrCard } from './PrCard'
import { StreakHeatmap } from './StreakHeatmap'
import { WeeklySummary } from './WeeklySummary'

const SHOE_REPLACEMENT_WARNING_M = 800_000

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

interface PrCardData {
  label: string
  value: string | null
  performedAt: string | null
  activityId: string | null
}

function buildPrCards(prs: CardioPrs, unitSystem: UnitSystem): PrCardData[] {
  function fromTime(label: string, pr: CardioPrValue | null): PrCardData {
    return {
      label,
      value: pr === null ? null : formatDuration(pr.value),
      performedAt: pr?.performed_at ?? null,
      activityId: pr?.cardio_activity_id ?? null,
    }
  }

  function fromDistance(label: string, pr: CardioPrValue | null): PrCardData {
    return {
      label,
      value: pr === null ? null : formatDistance(pr.value, unitSystem),
      performedAt: pr?.performed_at ?? null,
      activityId: pr?.cardio_activity_id ?? null,
    }
  }

  return [
    fromTime('Fastest 1k', prs.fastest_1k),
    fromTime('Fastest 5k', prs.fastest_5k),
    fromTime('Fastest 10k', prs.fastest_10k),
    fromDistance('Longest distance', prs.longest_distance),
    fromTime('Longest duration', prs.longest_duration),
  ]
}

interface ShoeFormProps {
  shoe: Shoe | null
  unitSystem: UnitSystem
  isSaving: boolean
  error: string | null
  onSubmit: (input: ShoeInput) => void
  onCancel: () => void
}

function ShoeForm({ shoe, unitSystem, isSaving, error, onSubmit, onCancel }: ShoeFormProps) {
  const [name, setName] = useState(shoe?.name ?? '')
  const [purchasedAt, setPurchasedAt] = useState(shoe?.purchased_at ?? '')
  const [initialDistance, setInitialDistance] = useState<number | null>(() =>
    shoe === null || shoe.initial_distance_m === 0
      ? null
      : distanceForDisplay(shoe.initial_distance_m, unitSystem),
  )
  const [retiredAt, setRetiredAt] = useState(shoe?.retired_at ?? '')
  const [notes, setNotes] = useState(shoe?.notes ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)

  const distanceUnit = unitSystem === 'imperial' ? 'mi' : 'km'
  const displayError = validationError ?? error

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (name.trim() === '') {
      setValidationError('Name is required.')
      return
    }

    if (initialDistance !== null && !(initialDistance >= 0)) {
      setValidationError('Initial distance cannot be negative.')
      return
    }

    setValidationError(null)
    onSubmit({
      name: name.trim(),
      purchased_at: purchasedAt === '' ? null : purchasedAt,
      initial_distance_m:
        initialDistance === null
          ? 0
          : Number(distanceToMeters(initialDistance, unitSystem).toFixed(1)),
      retired_at: retiredAt === '' ? null : retiredAt,
      notes: notes.trim() === '' ? null : notes.trim(),
    })
  }

  return (
    <form className="space-y-3 pb-2" onSubmit={handleSubmit}>
      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">Name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Pegasus 41"
          className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </label>

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">Purchased (optional)</span>
        <input
          type="date"
          value={purchasedAt}
          onChange={(event) => setPurchasedAt(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </label>

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">
          Starting distance ({distanceUnit}, optional)
        </span>
        <NumberField
          value={initialDistance}
          onChange={setInitialDistance}
          inputMode="decimal"
          placeholder="e.g. 120"
        />
      </label>

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">Retired (optional)</span>
        <input
          type="date"
          value={retiredAt}
          onChange={(event) => setRetiredAt(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </label>

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </label>

      {displayError !== null && (
        <p role="alert" className="text-sm text-red-400 light:text-red-600">
          {displayError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSaving}
          className="min-h-11 flex-1 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : shoe === null ? 'Add shoe' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Cancel
        </button>
      </div>
    </form>
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
  const [shoeFormOpen, setShoeFormOpen] = useState(false)
  const [editingShoe, setEditingShoe] = useState<Shoe | null>(null)
  const [deletingShoe, setDeletingShoe] = useState<Shoe | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const activitiesQuery = useQuery({
    queryKey: ['cardio', 'activities'],
    queryFn: () => cardioApi.list({ limit: 100 }),
  })

  const summaryQuery = useQuery({
    queryKey: ['cardio', 'summary', range.from, range.to],
    queryFn: () => cardioApi.summary({ from: range.from, to: range.to }),
  })

  const prsQuery = useQuery({
    queryKey: ['cardio', 'prs'],
    queryFn: () => cardioApi.prs(),
  })

  const streaksQuery = useQuery({
    queryKey: ['cardio', 'streaks'],
    queryFn: () => cardioApi.streaks(),
  })

  const shoesQuery = useQuery({
    queryKey: ['shoes'],
    queryFn: () => shoesApi.list(),
  })

  const editingSplitsQuery = useQuery({
    queryKey: ['cardio', 'splits', editing?.id],
    queryFn: () => cardioApi.splits(editing!.id),
    enabled: editing !== null,
  })

  function invalidateTrainingData() {
    void queryClient.invalidateQueries({ queryKey: ['cardio'] })
    void queryClient.invalidateQueries({ queryKey: ['shoes'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const createMutation = useMutation({
    mutationFn: cardioApi.create,
    onSuccess: () => {
      invalidateTrainingData()
      setEditing(null)
      setFormOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CardioActivityInput }) =>
      cardioApi.update(id, patch),
    onSuccess: () => {
      invalidateTrainingData()
      setEditing(null)
      setFormOpen(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: cardioApi.remove,
    onSuccess: () => {
      invalidateTrainingData()
      setPendingDeleteId(null)
    },
  })

  const createShoeMutation = useMutation({
    mutationFn: shoesApi.create,
    onSuccess: () => {
      invalidateTrainingData()
      closeShoeForm()
    },
  })

  const updateShoeMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ShoeInput }) => shoesApi.update(id, patch),
    onSuccess: () => {
      invalidateTrainingData()
      closeShoeForm()
    },
  })

  const deleteShoeMutation = useMutation({
    mutationFn: shoesApi.remove,
    onSuccess: () => {
      invalidateTrainingData()
      setDeletingShoe(null)
    },
  })

  const formVisible = formOpen || editing !== null
  const isSaving = createMutation.isPending || updateMutation.isPending
  const saveError = createMutation.isError
    ? errorDetail(createMutation.error)
    : updateMutation.isError
      ? errorDetail(updateMutation.error)
      : null

  const isSavingShoe = createShoeMutation.isPending || updateShoeMutation.isPending
  const shoeSaveError = createShoeMutation.isError
    ? errorDetail(createShoeMutation.error)
    : updateShoeMutation.isError
      ? errorDetail(updateShoeMutation.error)
      : null

  const prCards = prsQuery.data === undefined ? [] : buildPrCards(prsQuery.data, unitSystem)

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

  function openAddShoe() {
    createShoeMutation.reset()
    updateShoeMutation.reset()
    setEditingShoe(null)
    setShoeFormOpen(true)
  }

  function openEditShoe(shoe: Shoe) {
    createShoeMutation.reset()
    updateShoeMutation.reset()
    setEditingShoe(shoe)
    setShoeFormOpen(true)
  }

  function closeShoeForm() {
    createShoeMutation.reset()
    updateShoeMutation.reset()
    setEditingShoe(null)
    setShoeFormOpen(false)
  }

  function handleShoeSubmit(input: ShoeInput) {
    if (editingShoe !== null) {
      updateShoeMutation.mutate({ id: editingShoe.id, patch: input })
    } else {
      createShoeMutation.mutate(input)
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
          {editing !== null && !editingSplitsQuery.isSuccess ? (
            editingSplitsQuery.isError ? (
              <QueryErrorNotice
                message="Could not load the run's splits."
                detail={errorDetail(editingSplitsQuery.error)}
                onRetry={() => void editingSplitsQuery.refetch()}
              />
            ) : (
              <p className="rounded-xl border border-line bg-surface-raised p-4 text-sm text-content-muted">
                Loading splits…
              </p>
            )
          ) : (
            <CardioForm
              key={editing?.id ?? 'new'}
              activity={editing}
              shoes={shoesQuery.data ?? []}
              initialSplits={
                editingSplitsQuery.data?.source === 'stored' ? editingSplitsQuery.data.splits : []
              }
              isSaving={isSaving}
              error={saveError}
              onSubmit={handleSubmit}
              onCancel={closeForm}
            />
          )}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">Personal records</h2>
          <span className="text-xs text-content-muted">All time</span>
        </div>

        {prsQuery.isPending ? (
          <p className="text-sm text-content-muted">Loading records…</p>
        ) : prsQuery.isError ? (
          <QueryErrorNotice
            message="Could not load running records."
            detail={errorDetail(prsQuery.error)}
            onRetry={() => void prsQuery.refetch()}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {prCards.map((card) => (
                <PrCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  performedAt={card.performedAt}
                  activityId={card.activityId}
                />
              ))}
            </div>
            <p className="text-xs text-content-muted">
              Fastest 1k/5k/10k use recorded splits; longest distance and duration consider every
              activity.
            </p>
          </>
        )}
      </section>

      <WeeklySummary />

      {streaksQuery.isPending ? (
        <p className="rounded-xl border border-line bg-surface-raised p-4 text-sm text-content-muted">
          Loading consistency…
        </p>
      ) : streaksQuery.isError ? (
        <QueryErrorNotice
          message="Could not load your streak."
          detail={errorDetail(streaksQuery.error)}
          onRetry={() => void streaksQuery.refetch()}
        />
      ) : (
        <StreakHeatmap streaks={streaksQuery.data} />
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
          <h2 className="text-sm font-semibold tracking-tight">Shoes</h2>
          <button
            type="button"
            onClick={openAddShoe}
            className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Add shoe
          </button>
        </div>

        {shoesQuery.isPending ? (
          <p className="mt-2 text-sm text-content-muted">Loading shoes…</p>
        ) : shoesQuery.isError ? (
          <div role="alert" className="mt-2 text-sm">
            <p className="font-medium">Could not load your shoes.</p>
            <p className="mt-1 text-content-muted">{errorDetail(shoesQuery.error)}</p>
            <button
              type="button"
              onClick={() => void shoesQuery.refetch()}
              className="mt-2 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Retry
            </button>
          </div>
        ) : shoesQuery.data.length === 0 ? (
          <p className="mt-2 text-sm text-content-muted">No shoes yet.</p>
        ) : (
          <ul className="mt-2">
            {shoesQuery.data.map((shoe) => (
              <li
                key={shoe.id}
                className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {shoe.name}
                    {shoe.retired_at !== null && (
                      <span className="font-normal text-content-muted"> · Retired</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm tabular-nums">
                    {formatDistance(shoe.mileage_m, unitSystem)}
                  </p>
                  {shoe.mileage_m > SHOE_REPLACEMENT_WARNING_M && (
                    <p className="mt-0.5 text-xs font-medium">
                      ! Over 800 km — consider replacing
                    </p>
                  )}
                  {shoe.purchased_at !== null && (
                    <p className="mt-0.5 text-xs text-content-muted">
                      Purchased {formatDateKey(shoe.purchased_at, 'MMM d, yyyy')}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditShoe(shoe)}
                    className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteShoeMutation.reset()
                      setDeletingShoe(shoe)
                    }}
                    className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:border-red-500/60 hover:text-red-400 light:hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
                <Link to={`/running/${activity.id}`} className="group min-w-0">
                  <p className="font-medium group-hover:text-accent">
                    {CARDIO_TYPE_LABELS[activity.type]}
                    {activity.route_name !== null && activity.route_name !== '' && (
                      <span className="font-normal text-content-muted">
                        {' '}
                        · {activity.route_name}
                      </span>
                    )}
                    <span aria-hidden="true" className="ml-1 text-content-muted">
                      ›
                    </span>
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
                </Link>

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

      <BottomSheet
        open={shoeFormOpen}
        onClose={closeShoeForm}
        title={editingShoe === null ? 'Add shoe' : 'Edit shoe'}
      >
        <ShoeForm
          key={editingShoe?.id ?? 'new'}
          shoe={editingShoe}
          unitSystem={unitSystem}
          isSaving={isSavingShoe}
          error={shoeSaveError}
          onSubmit={handleShoeSubmit}
          onCancel={closeShoeForm}
        />
      </BottomSheet>

      <ConfirmDialog
        open={deletingShoe !== null}
        title="Delete shoe"
        message={
          deletingShoe === null
            ? undefined
            : `Delete “${deletingShoe.name}”? Activities that used it keep their distance.`
        }
        confirmLabel="Delete"
        destructive
        isPending={deleteShoeMutation.isPending}
        error={deleteShoeMutation.isError ? errorDetail(deleteShoeMutation.error) : null}
        onConfirm={() => {
          if (deletingShoe !== null) {
            deleteShoeMutation.mutate(deletingShoe.id)
          }
        }}
        onClose={() => {
          deleteShoeMutation.reset()
          setDeletingShoe(null)
        }}
      />
    </div>
  )
}

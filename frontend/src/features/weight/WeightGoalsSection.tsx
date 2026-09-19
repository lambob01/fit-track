import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, weightApi } from '../../api/client'
import type { MonthlyGoalMode, Settings } from '../../api/types'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { todayDateKey } from '../../lib/datetime'
import { requiredRatePerWeek } from '../../lib/goals'
import { formatWeight, formatWeightRate } from '../../lib/units'
import {
  buildGoalPatch,
  goalDraftFromSettings,
  validateGoalDraft,
  weightForDisplay,
  weightToKg,
} from '../settings/settingsDraft'
import type { GoalDraft } from '../settings/settingsDraft'

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

function goalSummary(settings: Settings): string {
  const unit = settings.unit_system === 'imperial' ? 'lb' : 'kg'
  const weightText = (kg: number | null): string | null => {
    const value = weightForDisplay(kg, settings.unit_system)
    return value === null ? null : `${value.toFixed(1)} ${unit}`
  }

  const parts: string[] = []

  const finalWeight = weightText(settings.goal_weight_kg)
  if (finalWeight !== null) {
    parts.push(`${finalWeight} target`)
  }
  if (settings.goal_rate_kg_per_week !== null) {
    parts.push(formatWeightRate(settings.goal_rate_kg_per_week, settings.unit_system))
  }
  if (settings.goal_monthly_mode === 'target') {
    const monthlyTarget = weightText(settings.goal_monthly_target_kg)
    if (monthlyTarget !== null) {
      parts.push(`${monthlyTarget} monthly target`)
    }
  } else if (settings.goal_monthly_mode === 'rate' && settings.goal_monthly_rate_kg !== null) {
    parts.push(formatWeightRate(settings.goal_monthly_rate_kg, settings.unit_system, 'month'))
  }
  if (settings.goal_weight_target_kg !== null && settings.goal_weight_target_date !== null) {
    const datedTarget = weightText(settings.goal_weight_target_kg)
    if (datedTarget !== null) {
      parts.push(`${datedTarget} by ${settings.goal_weight_target_date}`)
    }
  }

  return parts.length === 0 ? 'No goals set' : parts.join(' · ')
}

function WeightGoalsCard({ settings }: { settings: Settings }) {
  const { updateSettings, timezone } = useSettings()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState<GoalDraft>(() => goalDraftFromSettings(settings))
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const panelId = useId()

  const entriesQuery = useQuery({
    queryKey: ['weight', 'entries'],
    queryFn: weightApi.listEntries,
  })
  const latestWeightKg = entriesQuery.data?.[0]?.weight_kg ?? null

  const unitLabel = settings.unit_system === 'imperial' ? 'lb' : 'kg'
  const patch = buildGoalPatch(settings, draft)
  const hasChanges = Object.keys(patch).length > 0

  const targetWeightKg = weightToKg(draft.goalTargetWeight, settings.unit_system)
  const targetWeightLabel =
    targetWeightKg === null ? null : formatWeight(targetWeightKg, settings.unit_system)
  const hasDatedTarget = targetWeightKg !== null && draft.goalTargetDate !== null
  const requiredRate = hasDatedTarget
    ? requiredRatePerWeek(
        latestWeightKg,
        targetWeightKg,
        draft.goalTargetDate,
        todayDateKey(timezone),
      )
    : null

  function updateDraft(change: Partial<GoalDraft>) {
    setDraft((current) => ({ ...current, ...change }))
    setStatus(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationError = validateGoalDraft(draft)
    if (validationError !== null) {
      setFieldError(validationError)
      setRequestError(null)
      setStatus(null)
      return
    }
    if (!hasChanges) {
      setFieldError(null)
      setRequestError(null)
      setStatus('No changes to save.')
      return
    }

    setFieldError(null)
    setRequestError(null)
    setStatus(null)
    setIsSaving(true)

    try {
      const saved = await updateSettings(patch)
      void queryClient.invalidateQueries({ queryKey: ['weight'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setDraft(goalDraftFromSettings(saved))
      setStatus('Goals saved.')
    } catch (error) {
      setRequestError(errorDetail(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface-raised">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((open) => !open)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold tracking-tight">Weight goals</span>
          <span className="mt-0.5 block truncate text-xs text-content-muted">
            {goalSummary(settings)}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-content-muted">
          {expanded ? '−' : '+'}
        </span>
      </button>

      {expanded && (
        <form
          id={panelId}
          className="space-y-4 border-t border-line px-4 py-4"
          onSubmit={handleSubmit}
          noValidate
        >
          <p className="text-xs text-content-muted">
            All weight goals are optional; clearing a field removes it.
          </p>

          <label className="block space-y-1">
            <span className="block text-xs text-content-muted">
              Final goal weight ({unitLabel}, optional)
            </span>
            <NumberField
              value={draft.goalWeight}
              onChange={(value) => updateDraft({ goalWeight: value, goalWeightTouched: true })}
              inputMode="decimal"
              placeholder={settings.unit_system === 'imperial' ? 'e.g. 175' : 'e.g. 80'}
            />
          </label>

          <label className="block space-y-1">
            <span className="block text-xs text-content-muted">
              Weekly rate ({unitLabel}/week, optional)
            </span>
            <NumberField
              value={draft.goalRatePerWeek}
              onChange={(value) => updateDraft({ goalRatePerWeek: value, goalRateTouched: true })}
              inputMode="decimal"
              allowNegative
              placeholder={settings.unit_system === 'imperial' ? 'e.g. -1' : 'e.g. -0.5'}
            />
            <span className="block text-xs text-content-muted">
              Negative to lose, positive to gain; must be non-zero.
            </span>
          </label>

          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="block text-xs text-content-muted">Monthly goal</span>
              <select
                value={draft.goalMonthlyMode ?? ''}
                onChange={(event) =>
                  updateDraft({
                    goalMonthlyMode:
                      event.target.value === '' ? null : (event.target.value as MonthlyGoalMode),
                  })
                }
                className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="">None</option>
                <option value="target">Target weight</option>
                <option value="rate">Rate of change</option>
              </select>
            </label>

            {draft.goalMonthlyMode === 'target' && (
              <label className="block space-y-1">
                <span className="block text-xs text-content-muted">
                  Monthly target weight ({unitLabel})
                </span>
                <NumberField
                  value={draft.goalMonthlyTarget}
                  onChange={(value) =>
                    updateDraft({ goalMonthlyTarget: value, goalMonthlyTargetTouched: true })
                  }
                  inputMode="decimal"
                  placeholder={settings.unit_system === 'imperial' ? 'e.g. 170' : 'e.g. 77'}
                />
              </label>
            )}

            {draft.goalMonthlyMode === 'rate' && (
              <label className="block space-y-1">
                <span className="block text-xs text-content-muted">
                  Monthly rate ({unitLabel}/month)
                </span>
                <NumberField
                  value={draft.goalMonthlyRate}
                  onChange={(value) =>
                    updateDraft({ goalMonthlyRate: value, goalMonthlyRateTouched: true })
                  }
                  inputMode="decimal"
                  allowNegative
                  placeholder={settings.unit_system === 'imperial' ? 'e.g. -4' : 'e.g. -2'}
                />
                <span className="block text-xs text-content-muted">Must be non-zero.</span>
              </label>
            )}
          </div>

          <div className="space-y-2">
            <span className="block text-xs text-content-muted">Dated target (optional)</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="block text-xs text-content-muted">
                  Target weight ({unitLabel})
                </span>
                <NumberField
                  value={draft.goalTargetWeight}
                  onChange={(value) =>
                    updateDraft({ goalTargetWeight: value, goalTargetWeightTouched: true })
                  }
                  inputMode="decimal"
                  placeholder={settings.unit_system === 'imperial' ? 'e.g. 165' : 'e.g. 75'}
                />
              </label>
              <label className="block space-y-1">
                <span className="block text-xs text-content-muted">Target date</span>
                <input
                  type="date"
                  value={draft.goalTargetDate ?? ''}
                  onChange={(event) =>
                    updateDraft({
                      goalTargetDate: event.target.value === '' ? null : event.target.value,
                      goalTargetDateTouched: true,
                    })
                  }
                  className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>
            </div>
            <span className="block text-xs text-content-muted">
              Set both fields together to build a required weekly rate.
            </span>
            {hasDatedTarget && (
              <span className="block text-xs text-content-muted">
                {requiredRate === 'expired'
                  ? 'Target date has passed.'
                  : latestWeightKg === null || requiredRate === null
                    ? 'Add a weight entry to see the required rate.'
                    : `To hit ${targetWeightLabel} by ${draft.goalTargetDate} you need ${formatWeightRate(requiredRate, settings.unit_system)}`}
              </span>
            )}
          </div>

          {fieldError !== null && (
            <p role="alert" className="text-sm font-medium text-content">
              {fieldError}
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
            disabled={isSaving || !hasChanges}
            className="min-h-11 w-full rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save goals'}
          </button>
        </form>
      )}
    </section>
  )
}

export function WeightGoalsSection() {
  const { settings } = useSettings()

  if (settings === null) {
    return null
  }

  return <WeightGoalsCard key={settings.id} settings={settings} />
}

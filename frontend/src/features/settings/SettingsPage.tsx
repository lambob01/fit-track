import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, weightApi } from '../../api/client'
import type { MonthlyGoalMode, Settings, UnitSystem } from '../../api/types'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { BMI_CATEGORY_LABELS, BMI_DISCLAIMER, bmiCategory, calculateBmi } from '../../lib/bmi'
import { todayDateKey } from '../../lib/datetime'
import { requiredRatePerWeek } from '../../lib/goals'
import { formatWeight, formatWeightRate } from '../../lib/units'
import { ProfileManager } from '../profiles/ProfileManager'
import { DataPage } from './DataPage'
import {
  buildSettingsPatch,
  convertDraftUnits,
  detectBrowserTimezone,
  draftFromSettings,
  heightToCm,
  weightToKg,
} from './settingsDraft'
import type { SettingsDraft } from './settingsDraft'

type Tab = 'settings' | 'data'

const TIMEZONE_OPTIONS: string[] = (() => {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone')
    }
  } catch {
    return []
  }
  return []
})()

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong.'
}

function validateDraft(draft: SettingsDraft): string | null {
  if (draft.timezone.trim() === '') {
    return 'Timezone is required.'
  }
  if (draft.goalWeight !== null && !(draft.goalWeight > 0)) {
    return 'Goal weight must be greater than 0.'
  }
  if (draft.goalRatePerWeek === 0) {
    return 'Weekly rate must not be 0.'
  }
  if (
    draft.goalMonthlyMode === 'target' &&
    draft.goalMonthlyTarget !== null &&
    !(draft.goalMonthlyTarget > 0)
  ) {
    return 'Monthly target weight must be greater than 0.'
  }
  if (draft.goalMonthlyMode === 'rate' && draft.goalMonthlyRate === 0) {
    return 'Monthly rate must not be 0.'
  }
  if ((draft.goalTargetWeight !== null) !== (draft.goalTargetDate !== null)) {
    return 'Enter both a target weight and target date, or clear both.'
  }
  if (draft.goalTargetWeight !== null && !(draft.goalTargetWeight > 0)) {
    return 'Target weight must be greater than 0.'
  }
  if (draft.height !== null && !(draft.height > 0)) {
    return 'Height must be greater than 0.'
  }
  if (draft.weeklyRunGoal !== null && !(draft.weeklyRunGoal > 0)) {
    return 'Weekly run goal must be greater than 0.'
  }
  if (draft.maxHr !== null && !(draft.maxHr >= 100 && draft.maxHr <= 250)) {
    return 'Max heart rate must be between 100 and 250 bpm.'
  }
  return null
}

function TabButton({
  id,
  panelId,
  label,
  active,
  onSelect,
}: {
  id: string
  panelId: string
  label: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={panelId}
      onClick={onSelect}
      className={[
        'min-h-11 flex-1 rounded-lg px-3 text-sm font-medium transition-colors',
        active ? 'bg-accent-strong text-surface' : 'text-content-muted hover:text-content',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function SettingsForm({ settings }: { settings: Settings }) {
  const { updateSettings, timezone } = useSettings()
  const [draft, setDraft] = useState<SettingsDraft>(() =>
    draftFromSettings(settings, detectBrowserTimezone()),
  )
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const entriesQuery = useQuery({
    queryKey: ['weight', 'entries'],
    queryFn: weightApi.listEntries,
  })
  const latestWeightKg = entriesQuery.data?.[0]?.weight_kg ?? null

  const patch = buildSettingsPatch(settings, draft)
  const hasChanges = Object.keys(patch).length > 0
  const unitLabel = draft.unitSystem === 'imperial' ? 'lb' : 'kg'
  const distanceLabel = draft.unitSystem === 'imperial' ? 'mi' : 'km'
  const heightLabel = draft.unitSystem === 'imperial' ? 'in' : 'cm'

  const targetWeightKg = weightToKg(draft.goalTargetWeight, draft.unitSystem)
  const targetWeightLabel =
    targetWeightKg === null ? null : formatWeight(targetWeightKg, draft.unitSystem)
  const hasDatedTarget = targetWeightKg !== null && draft.goalTargetDate !== null
  const requiredRate = hasDatedTarget
    ? requiredRatePerWeek(
        latestWeightKg,
        targetWeightKg,
        draft.goalTargetDate,
        todayDateKey(timezone),
      )
    : null

  const draftHeightCm = heightToCm(draft.height, draft.unitSystem)
  const bmiValue =
    draftHeightCm === null || latestWeightKg === null
      ? null
      : calculateBmi(latestWeightKg, draftHeightCm)

  function updateDraft(change: Partial<SettingsDraft>) {
    setDraft((current) => ({ ...current, ...change }))
    setStatus(null)
  }

  function handleUnitSystemChange(unitSystem: UnitSystem) {
    setDraft((current) => convertDraftUnits(current, unitSystem))
    setStatus(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationError = validateDraft(draft)
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
      setDraft(draftFromSettings(saved))
      setStatus('Settings saved.')
    } catch (error) {
      setRequestError(errorDetail(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-line bg-surface-raised p-4"
      onSubmit={handleSubmit}
      noValidate
    >
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Preferences</h2>
        <p className="mt-1 text-sm text-content-muted">
          Units and timezone are used across every view. Clearing a goal field removes it.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">Unit system</span>
        <select
          value={draft.unitSystem}
          onChange={(event) => handleUnitSystemChange(event.target.value as UnitSystem)}
          className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="metric">Metric (kg, km)</option>
          <option value="imperial">Imperial (lb, mi)</option>
        </select>
      </label>

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">Timezone</span>
        <input
          type="text"
          list="settings-timezone-options"
          value={draft.timezone}
          onChange={(event) => updateDraft({ timezone: event.target.value })}
          placeholder="e.g. America/New_York"
          className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <datalist id="settings-timezone-options">
          {TIMEZONE_OPTIONS.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <span className="block text-xs text-content-muted">
          Dates are shown in this timezone; values are stored in UTC.
        </span>
      </label>

      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-semibold tracking-tight">Goals</h3>
        <p className="mt-1 text-xs text-content-muted">
          All weight goals are optional; clearing a field removes it.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">
          Final goal weight ({unitLabel}, optional)
        </span>
        <NumberField
          value={draft.goalWeight}
          onChange={(value) => updateDraft({ goalWeight: value, goalWeightTouched: true })}
          inputMode="decimal"
          placeholder={draft.unitSystem === 'imperial' ? 'e.g. 175' : 'e.g. 80'}
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
          placeholder={draft.unitSystem === 'imperial' ? 'e.g. -1' : 'e.g. -0.5'}
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
              placeholder={draft.unitSystem === 'imperial' ? 'e.g. 170' : 'e.g. 77'}
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
              placeholder={draft.unitSystem === 'imperial' ? 'e.g. -4' : 'e.g. -2'}
            />
            <span className="block text-xs text-content-muted">Must be non-zero.</span>
          </label>
        )}
      </div>

      <div className="space-y-2">
        <span className="block text-xs text-content-muted">Dated target (optional)</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="block text-xs text-content-muted">Target weight ({unitLabel})</span>
            <NumberField
              value={draft.goalTargetWeight}
              onChange={(value) =>
                updateDraft({ goalTargetWeight: value, goalTargetWeightTouched: true })
              }
              inputMode="decimal"
              placeholder={draft.unitSystem === 'imperial' ? 'e.g. 165' : 'e.g. 75'}
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
                : `To hit ${targetWeightLabel} by ${draft.goalTargetDate} you need ${formatWeightRate(requiredRate, draft.unitSystem)}`}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <label className="block space-y-1">
          <span className="block text-xs text-content-muted">
            Height ({heightLabel}, optional)
          </span>
          <NumberField
            value={draft.height}
            onChange={(value) => updateDraft({ height: value, heightTouched: true })}
            inputMode="decimal"
            placeholder={draft.unitSystem === 'imperial' ? 'e.g. 70' : 'e.g. 178'}
          />
        </label>
        {bmiValue !== null && (
          <p className="text-sm text-content-muted">
            Current BMI {bmiValue.toFixed(1)} · {BMI_CATEGORY_LABELS[bmiCategory(bmiValue)]}
          </p>
        )}
        <p className="text-xs text-content-muted">{BMI_DISCLAIMER}</p>
      </div>

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">
          Weekly run goal ({distanceLabel}, optional)
        </span>
        <NumberField
          value={draft.weeklyRunGoal}
          onChange={(value) => updateDraft({ weeklyRunGoal: value, weeklyRunGoalTouched: true })}
          inputMode="decimal"
          placeholder={draft.unitSystem === 'imperial' ? 'e.g. 12' : 'e.g. 20'}
        />
      </label>

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">
          Max heart rate (bpm, optional)
        </span>
        <NumberField
          value={draft.maxHr}
          onChange={(value) => updateDraft({ maxHr: value, maxHrTouched: true })}
          inputMode="numeric"
          placeholder="e.g. 190"
        />
        <span className="block text-xs text-content-muted">Between 100 and 250 bpm.</span>
      </label>

      {fieldError !== null && (
        <p role="alert" className="text-sm text-red-400 light:text-red-600">
          {fieldError}
        </p>
      )}
      {requestError !== null && (
        <p role="alert" className="text-sm text-red-400 light:text-red-600">
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
        {isSaving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}

export function SettingsPage() {
  const { settings, isLoading, refreshSettings } = useSettings()
  const [tab, setTab] = useState<Tab>('settings')
  const [loadError, setLoadError] = useState<string | null>(null)

  function handleRetry() {
    setLoadError(null)
    void refreshSettings().catch((error: unknown) => setLoadError(errorDetail(error)))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 rounded-xl border border-line bg-surface-raised p-1"
      >
        <TabButton
          id="settings-tab-settings"
          panelId="settings-panel-settings"
          label="Settings"
          active={tab === 'settings'}
          onSelect={() => setTab('settings')}
        />
        <TabButton
          id="settings-tab-data"
          panelId="settings-panel-data"
          label="Data"
          active={tab === 'data'}
          onSelect={() => setTab('data')}
        />
      </div>

      <div
        role="tabpanel"
        id="settings-panel-settings"
        aria-labelledby="settings-tab-settings"
        hidden={tab !== 'settings'}
        className="space-y-4"
      >
        {isLoading ? (
          <p className="text-sm text-content-muted">Loading settings…</p>
        ) : settings === null ? (
          <section
            role="alert"
            className="rounded-xl border border-line bg-surface-raised p-4 text-sm"
          >
            <p className="font-medium">Could not load your settings.</p>
            {loadError !== null && <p className="mt-1 text-content-muted">{loadError}</p>}
            <button
              type="button"
              onClick={handleRetry}
              className="mt-3 min-h-11 rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Retry
            </button>
          </section>
        ) : (
          <SettingsForm key={settings.id} settings={settings} />
        )}
        <ProfileManager />
      </div>

      <div
        role="tabpanel"
        id="settings-panel-data"
        aria-labelledby="settings-tab-data"
        hidden={tab !== 'data'}
      >
        <DataPage />
      </div>
    </div>
  )
}

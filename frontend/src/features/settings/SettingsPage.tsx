import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { Settings, UnitSystem } from '../../api/types'
import { NumberField } from '../../components/NumberField'
import { useSettings } from '../../context/SettingsContext'
import { DataPage } from './DataPage'
import {
  buildSettingsPatch,
  convertDraftUnits,
  detectBrowserTimezone,
  draftFromSettings,
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
  const { updateSettings } = useSettings()
  const [draft, setDraft] = useState<SettingsDraft>(() =>
    draftFromSettings(settings, detectBrowserTimezone()),
  )
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const patch = buildSettingsPatch(settings, draft)
  const hasChanges = Object.keys(patch).length > 0
  const unitLabel = draft.unitSystem === 'imperial' ? 'lb' : 'kg'
  const distanceLabel = draft.unitSystem === 'imperial' ? 'mi' : 'km'

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

      <label className="block space-y-1">
        <span className="block text-xs text-content-muted">
          Goal weight ({unitLabel}, optional)
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
          <SettingsForm settings={settings} />
        )}
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

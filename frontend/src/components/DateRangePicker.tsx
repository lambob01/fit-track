import { useState } from 'react'
import { fromZonedTime } from 'date-fns-tz'
import { useSettings } from '../context/SettingsContext'
import { getPresetRange, inferPreset, RANGE_PRESET_KEYS } from '../lib/dateRange'
import type { DateRange, DateRangePreset, RangePresetKey } from '../lib/dateRange'
import { localDateKey, toUtcIso } from '../lib/datetime'

const PRESET_LABELS: Record<DateRangePreset, string> = {
  '7d': '7D',
  '30d': '30D',
  '90d': '90D',
  '1y': '1Y',
  all: 'All',
  custom: 'Custom',
}

const PRESET_OPTIONS: DateRangePreset[] = [...RANGE_PRESET_KEYS, 'custom']

export interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  defaultPreset?: DateRangePreset
  className?: string
}

export function DateRangePicker({
  value,
  onChange,
  defaultPreset,
  className,
}: DateRangePickerProps) {
  const { timezone } = useSettings()
  const [activePreset, setActivePreset] = useState<DateRangePreset>(
    () => defaultPreset ?? inferPreset(value, timezone),
  )

  function selectPreset(preset: RangePresetKey) {
    setActivePreset(preset)
    onChange(getPresetRange(preset, timezone))
  }

  function handlePresetClick(preset: DateRangePreset) {
    if (preset === 'custom') {
      setActivePreset('custom')
      return
    }

    selectPreset(preset)
  }

  function handleFromChange(next: string) {
    if (next === '') {
      return
    }

    onChange({ ...value, from: toUtcIso(fromZonedTime(`${next}T00:00:00`, timezone)) })
  }

  function handleToChange(next: string) {
    if (next === '') {
      return
    }

    onChange({ ...value, to: toUtcIso(fromZonedTime(`${next}T23:59:59.999`, timezone)) })
  }

  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      <div role="group" aria-label="Date range" className="flex flex-wrap gap-1.5">
        {PRESET_OPTIONS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={activePreset === preset}
            onClick={() => handlePresetClick(preset)}
            className={[
              'min-h-10 rounded-full border px-3 text-xs font-medium transition-colors',
              activePreset === preset
                ? 'border-accent bg-accent text-surface'
                : 'border-line bg-surface text-content-muted hover:border-content-muted hover:text-content',
            ].join(' ')}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>

      {activePreset === 'custom' && (
        <div className="flex gap-2">
          <label className="flex-1 space-y-1">
            <span className="block text-xs text-content-muted">From</span>
            <input
              type="date"
              value={localDateKey(value.from, timezone)}
              max={localDateKey(value.to, timezone)}
              onChange={(event) => handleFromChange(event.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-content focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex-1 space-y-1">
            <span className="block text-xs text-content-muted">To</span>
            <input
              type="date"
              value={localDateKey(value.to, timezone)}
              min={localDateKey(value.from, timezone)}
              onChange={(event) => handleToChange(event.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-content focus:border-accent focus:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  )
}

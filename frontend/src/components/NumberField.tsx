import { useState } from 'react'
import type { ChangeEvent, FocusEvent, InputHTMLAttributes } from 'react'
import { parseDecimalInput, sanitizeDecimalInput } from '../lib/parseNumber'
import { nextStepperValue } from '../lib/stepper'

export interface NumberFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'defaultValue' | 'inputMode' | 'onChange' | 'onBlur'
  > {
  value: number | null
  onChange: (value: number | null) => void
  inputMode?: 'decimal' | 'numeric'
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  step?: number
  stepperLabel?: string
  allowNegative?: boolean
}

interface EditingState {
  text: string
  externalValue: number | null
}

function displayValue(value: number | null): string {
  return value === null ? '' : String(value)
}

function normalizeText(raw: string): string {
  const trimmed = raw.trim()

  if (trimmed === '' || parseDecimalInput(trimmed) === null) {
    return trimmed
  }

  let normalized = trimmed.replace(',', '.').replace(/^\+/, '')
  normalized = normalized.replace(/^(-?)0+(?=\d)/, '$1')
  normalized = normalized.replace(/\.$/, '')

  return normalized.startsWith('.') ? `0${normalized}` : normalized
}

const STEP_BUTTON_CLASS =
  'min-h-11 min-w-11 shrink-0 rounded-lg border border-line bg-surface text-xl font-semibold text-content transition-colors hover:border-accent hover:text-accent disabled:opacity-40'

export function NumberField({
  value,
  onChange,
  inputMode = 'decimal',
  onBlur,
  className,
  step,
  stepperLabel,
  allowNegative = false,
  disabled,
  ...rest
}: NumberFieldProps) {
  const [editing, setEditing] = useState<EditingState>(() => ({
    text: displayValue(value),
    externalValue: value,
  }))

  if (editing.externalValue !== value) {
    setEditing({
      text: parseDecimalInput(editing.text) === value ? editing.text : displayValue(value),
      externalValue: value,
    })
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    const sign = allowNegative && raw.trimStart().startsWith('-') ? '-' : ''
    const text = sign + sanitizeDecimalInput(raw)
    setEditing((current) => ({ ...current, text }))
    onChange(parseDecimalInput(text))
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setEditing((current) => ({ ...current, text: normalizeText(current.text) }))
    onBlur?.(event)
  }

  const control = (
    <input
      {...rest}
      type="text"
      inputMode={inputMode}
      value={editing.text}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      className={[
        'w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )

  if (step === undefined) {
    return control
  }

  return (
    <div className="flex items-stretch gap-1">
      <button
        type="button"
        aria-label={`Decrease ${stepperLabel ?? 'value'}`}
        onClick={() => onChange(nextStepperValue(value, -step))}
        disabled={disabled === true || value === null}
        className={STEP_BUTTON_CLASS}
      >
        −
      </button>
      <div className="min-w-0 flex-1">{control}</div>
      <button
        type="button"
        aria-label={`Increase ${stepperLabel ?? 'value'}`}
        onClick={() => onChange(nextStepperValue(value, step))}
        disabled={disabled === true}
        className={STEP_BUTTON_CLASS}
      >
        +
      </button>
    </div>
  )
}

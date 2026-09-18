import { useState } from 'react'
import type { ChangeEvent, FocusEvent, InputHTMLAttributes } from 'react'
import { parseDecimalInput } from '../lib/parseNumber'

export interface NumberFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'defaultValue' | 'inputMode' | 'onChange' | 'onBlur'
  > {
  value: number | null
  onChange: (value: number | null) => void
  inputMode?: 'decimal' | 'numeric'
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
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

export function NumberField({
  value,
  onChange,
  inputMode = 'decimal',
  onBlur,
  className,
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
    setEditing((current) => ({ ...current, text: event.target.value }))
    onChange(parseDecimalInput(event.target.value))
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setEditing((current) => ({ ...current, text: normalizeText(current.text) }))
    onBlur?.(event)
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode={inputMode}
      value={editing.text}
      onChange={handleChange}
      onBlur={handleBlur}
      className={[
        'w-full rounded-lg border border-line bg-surface px-3 py-3 text-base text-content placeholder:text-content-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )
}

export function sanitizeDecimalInput(raw: string): string {
  let sanitized = ''
  let hasSeparator = false

  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      sanitized += char
    } else if ((char === '.' || char === ',') && !hasSeparator) {
      sanitized += '.'
      hasSeparator = true
    }
  }

  return sanitized
}

export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return null
  }

  const normalized = trimmed.replace(',', '.').replace(/^\+/, '')
  const value = Number(normalized)

  return Number.isFinite(value) ? value : null
}

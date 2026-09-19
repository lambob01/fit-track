import { describe, expect, it } from 'vitest'
import { parseDecimalInput, sanitizeDecimalInput } from './parseNumber'

describe('parseDecimalInput', () => {
  it('parses plain and padded numbers', () => {
    expect(parseDecimalInput('08')).toBe(8)
    expect(parseDecimalInput('82.5')).toBe(82.5)
  })

  it('accepts comma decimal separators', () => {
    expect(parseDecimalInput('82,5')).toBe(82.5)
  })

  it('returns null for empty input', () => {
    expect(parseDecimalInput('')).toBeNull()
    expect(parseDecimalInput('  ')).toBeNull()
  })

  it('returns null for garbage', () => {
    expect(parseDecimalInput('abc')).toBeNull()
  })
})

describe('sanitizeDecimalInput', () => {
  it('keeps digits and drops letters and spaces', () => {
    expect(sanitizeDecimalInput('82.5')).toBe('82.5')
    expect(sanitizeDecimalInput('8a2 .5')).toBe('82.5')
    expect(sanitizeDecimalInput(' 12 kg ')).toBe('12')
  })

  it('normalizes a comma separator to a dot', () => {
    expect(sanitizeDecimalInput('82,5')).toBe('82.5')
    expect(sanitizeDecimalInput('0,25')).toBe('0.25')
  })

  it('keeps at most one separator and drops extras', () => {
    expect(sanitizeDecimalInput('1.2.3')).toBe('1.23')
    expect(sanitizeDecimalInput('1,2,3')).toBe('1.23')
    expect(sanitizeDecimalInput('1,2.3')).toBe('1.23')
  })

  it('drops signs', () => {
    expect(sanitizeDecimalInput('-5')).toBe('5')
    expect(sanitizeDecimalInput('+5')).toBe('5')
    expect(sanitizeDecimalInput('-0.5')).toBe('0.5')
  })

  it('returns an empty string when nothing numeric remains', () => {
    expect(sanitizeDecimalInput('')).toBe('')
    expect(sanitizeDecimalInput('abc')).toBe('')
    expect(sanitizeDecimalInput('kg')).toBe('')
  })

  it('keeps partial decimal forms while typing', () => {
    expect(sanitizeDecimalInput('.')).toBe('.')
    expect(sanitizeDecimalInput('.5')).toBe('.5')
    expect(sanitizeDecimalInput('0.')).toBe('0.')
  })
})

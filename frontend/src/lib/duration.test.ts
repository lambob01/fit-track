import { describe, expect, it } from 'vitest'
import { formatDuration, parseDurationInput } from './duration'

describe('parseDurationInput', () => {
  it.each([
    ['25', 1500],
    ['25.5', 1530],
    ['25,5', 1530],
    ['25:30', 1530],
    ['0:45', 45],
    ['00:45', 45],
    ['1:02:33', 3753],
  ])('parses %s as %i seconds', (input, expected) => {
    expect(parseDurationInput(input)).toBe(expected)
  })

  it.each(['', '  ', 'abc', '-5', '0', '0:00', '25:60', '1:60:00', '1:2:3:4', '1,2,3'])(
    'rejects %s',
    (input) => {
      expect(parseDurationInput(input)).toBeNull()
    },
  )
})

describe('formatDuration', () => {
  it.each([
    [45, '0:45'],
    [1500, '25:00'],
    [1530, '25:30'],
    [3753, '1:02:33'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

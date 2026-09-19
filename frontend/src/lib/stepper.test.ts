import { describe, expect, it } from 'vitest'
import { nextStepperValue } from './stepper'

describe('nextStepperValue', () => {
  it('increments from an empty value to one step', () => {
    expect(nextStepperValue(null, 2.5)).toBe(2.5)
    expect(nextStepperValue(null, 5)).toBe(5)
    expect(nextStepperValue(null, 1)).toBe(1)
  })

  it('does not decrement an empty value', () => {
    expect(nextStepperValue(null, -2.5)).toBeNull()
  })

  it('decrements to empty at or below zero', () => {
    expect(nextStepperValue(2.5, -2.5)).toBeNull()
    expect(nextStepperValue(1, -5)).toBeNull()
  })

  it('applies metric and imperial weight steps', () => {
    expect(nextStepperValue(80, 2.5)).toBe(82.5)
    expect(nextStepperValue(82.5, -2.5)).toBe(80)
    expect(nextStepperValue(175, 5)).toBe(180)
    expect(nextStepperValue(180, -5)).toBe(175)
  })

  it('steps reps by whole numbers', () => {
    expect(nextStepperValue(8, 1)).toBe(9)
    expect(nextStepperValue(9, -1)).toBe(8)
  })

  it('rounds floating point drift to three decimals', () => {
    expect(nextStepperValue(0.1, 0.2)).toBe(0.3)
    expect(nextStepperValue(1.1, 1.2)).toBe(2.3)
  })
})

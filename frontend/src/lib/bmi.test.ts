import { describe, expect, it } from 'vitest'
import { BMI_DISCLAIMER, bmiCategory, calculateBmi } from './bmi'

describe('calculateBmi', () => {
  it('divides weight by height in meters squared', () => {
    expect(calculateBmi(80, 180)).toBeCloseTo(24.691, 3)
    expect(calculateBmi(60, 150)).toBeCloseTo(26.667, 3)
  })
})

describe('bmiCategory', () => {
  it('classifies just below 18.5 as underweight', () => {
    expect(bmiCategory(18.49)).toBe('underweight')
  })

  it('treats 18.5 as the start of normal', () => {
    expect(bmiCategory(18.5)).toBe('normal')
  })

  it('classifies 24.9 as normal', () => {
    expect(bmiCategory(24.9)).toBe('normal')
  })

  it('treats 25 as overweight', () => {
    expect(bmiCategory(25)).toBe('overweight')
  })

  it('classifies 29.9 as overweight', () => {
    expect(bmiCategory(29.9)).toBe('overweight')
  })

  it('treats 30 as obese', () => {
    expect(bmiCategory(30)).toBe('obese')
  })
})

describe('BMI_DISCLAIMER', () => {
  it('is the exact required warning text', () => {
    expect(BMI_DISCLAIMER).toBe(
      'BMI is a population-level metric and may not reflect individual body composition.',
    )
  })
})

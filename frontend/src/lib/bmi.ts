export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese'

export const BMI_DISCLAIMER =
  'BMI is a population-level metric and may not reflect individual body composition.'

export const BMI_CATEGORY_LABELS: Record<BmiCategory, string> = {
  underweight: 'Underweight',
  normal: 'Normal',
  overweight: 'Overweight',
  obese: 'Obese',
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100
  return weightKg / heightM ** 2
}

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) {
    return 'underweight'
  }
  if (bmi < 25) {
    return 'normal'
  }
  if (bmi < 30) {
    return 'overweight'
  }
  return 'obese'
}

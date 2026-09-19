export const STEP_DECIMALS = 3

export function roundStep(value: number): number {
  return Number(value.toFixed(STEP_DECIMALS))
}

export function nextStepperValue(value: number | null, delta: number): number | null {
  if (value === null) {
    return delta > 0 ? roundStep(delta) : null
  }

  const next = roundStep(value + delta)
  return next > 0 ? next : null
}

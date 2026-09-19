import { describe, expect, it } from 'vitest'
import type { Plan } from '../../api/types'
import {
  assignmentSlots,
  buildTemplateInput,
  nextQuickCreateStep,
  quickTemplateError,
  type QuickTemplateDraft,
} from './quickTemplate'

function draft(partial: Partial<QuickTemplateDraft> = {}): QuickTemplateDraft {
  return {
    name: 'Push Day',
    rows: [
      { exerciseId: 'exercise-a', targetSets: 3, targetReps: 8, targetWeight: 60 },
      { exerciseId: 'exercise-b', targetSets: null, targetReps: null, targetWeight: null },
    ],
    ...partial,
  }
}

function slot(day_of_week: number, template_id: string | null): Plan['slots'][number] {
  return { id: `slot-${day_of_week}`, day_of_week, template_id, template_name: null }
}

describe('buildTemplateInput', () => {
  it('trims the name and keeps row order with zero-based positions', () => {
    const input = buildTemplateInput(draft({ name: '  Push Day  ' }), 'metric')

    expect(input.name).toBe('Push Day')
    expect(input.exercises.map((exercise) => exercise.exercise_id)).toEqual([
      'exercise-a',
      'exercise-b',
    ])
    expect(input.exercises.map((exercise) => exercise.position)).toEqual([0, 1])
  })

  it('passes positive targets through and maps blank targets to null', () => {
    const input = buildTemplateInput(draft(), 'metric')

    expect(input.exercises[0]).toEqual({
      exercise_id: 'exercise-a',
      position: 0,
      target_sets: 3,
      target_reps: 8,
      target_weight_kg: 60,
    })
    expect(input.exercises[1]).toEqual({
      exercise_id: 'exercise-b',
      position: 1,
      target_sets: null,
      target_reps: null,
      target_weight_kg: null,
    })
  })

  it('converts weight targets from display units to kg in imperial', () => {
    const input = buildTemplateInput(
      draft({
        rows: [
          { exerciseId: 'exercise-a', targetSets: 5, targetReps: 5, targetWeight: 225 },
        ],
      }),
      'imperial',
    )

    expect(input.exercises[0].target_weight_kg).toBeCloseTo(102.058, 3)
  })

  it('sends an empty exercise list before rows are added', () => {
    expect(buildTemplateInput(draft({ rows: [] }), 'metric').exercises).toEqual([])
  })
})

describe('quickTemplateError', () => {
  it('accepts a complete draft', () => {
    expect(quickTemplateError(draft())).toBeNull()
  })

  it('rejects a blank or whitespace-only name', () => {
    expect(quickTemplateError(draft({ name: '' }))).toBe('Template name is required.')
    expect(quickTemplateError(draft({ name: '   ' }))).toBe('Template name is required.')
  })

  it('requires at least one exercise', () => {
    expect(quickTemplateError(draft({ rows: [] }))).toBe('Add at least one exercise.')
  })

  it('rejects non-positive or fractional sets and reps', () => {
    const row = { exerciseId: 'exercise-a', targetSets: null, targetReps: null, targetWeight: null }
    expect(quickTemplateError(draft({ rows: [{ ...row, targetSets: 0 }] }))).toBe(
      'Sets must be a whole number greater than zero.',
    )
    expect(quickTemplateError(draft({ rows: [{ ...row, targetSets: 2.5 }] }))).toBe(
      'Sets must be a whole number greater than zero.',
    )
    expect(quickTemplateError(draft({ rows: [{ ...row, targetReps: -1 }] }))).toBe(
      'Reps must be a whole number greater than zero.',
    )
  })

  it('rejects non-positive weight targets', () => {
    const row = { exerciseId: 'exercise-a', targetSets: null, targetReps: null, targetWeight: 0 }
    expect(quickTemplateError(draft({ rows: [row] }))).toBe(
      'Weight must be greater than zero.',
    )
  })

  it('allows null targets on every row', () => {
    expect(quickTemplateError(draft())).toBeNull()
  })
})

describe('assignmentSlots', () => {
  it('builds the complete seven-day slots array for an empty plan', () => {
    const slots = assignmentSlots({ slots: [] }, 2, 'template-a')

    expect(slots).toEqual([
      { day_of_week: 0, template_id: null },
      { day_of_week: 1, template_id: null },
      { day_of_week: 2, template_id: 'template-a' },
      { day_of_week: 3, template_id: null },
      { day_of_week: 4, template_id: null },
      { day_of_week: 5, template_id: null },
      { day_of_week: 6, template_id: null },
    ])
  })

  it('preserves every other day and replaces the tapped day', () => {
    const slots = assignmentSlots(
      { slots: [slot(0, 'keep-monday'), slot(4, 'replace-friday')] },
      4,
      'template-a',
    )

    expect(slots).toHaveLength(7)
    expect(slots[0]).toEqual({ day_of_week: 0, template_id: 'keep-monday' })
    expect(slots[4]).toEqual({ day_of_week: 4, template_id: 'template-a' })
    expect(slots.filter((entry) => entry.template_id !== null)).toHaveLength(2)
  })
})

describe('nextQuickCreateStep', () => {
  it('creates when no template exists yet', () => {
    expect(nextQuickCreateStep(null)).toEqual({ kind: 'create' })
  })

  it('assigns only when creation already succeeded, so retries never re-create', () => {
    expect(nextQuickCreateStep('template-a')).toEqual({
      kind: 'assign',
      templateId: 'template-a',
    })
  })
})

import type {
  Plan,
  PlanSlotInput,
  TemplateExerciseInput,
  TemplateInput,
  UnitSystem,
} from '../../api/types'
import { displayToKg } from '../lifting/liftingUnits'

export const WEEK_LENGTH = 7

export interface QuickTemplateRow {
  exerciseId: string
  targetSets: number | null
  targetReps: number | null
  targetWeight: number | null
}

export interface QuickTemplateDraft {
  name: string
  rows: QuickTemplateRow[]
}

export interface TemplateAssignmentTarget {
  plan: Plan
  dayOfWeek: number
}

export type QuickCreateStep =
  | { kind: 'create' }
  | { kind: 'assign'; templateId: string }

function positiveInteger(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value > 0)
}

function positiveNumber(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value > 0)
}

export function quickTemplateError(draft: QuickTemplateDraft): string | null {
  if (draft.name.trim() === '') {
    return 'Template name is required.'
  }
  if (draft.rows.length === 0) {
    return 'Add at least one exercise.'
  }
  for (const row of draft.rows) {
    if (!positiveInteger(row.targetSets)) {
      return 'Sets must be a whole number greater than zero.'
    }
    if (!positiveInteger(row.targetReps)) {
      return 'Reps must be a whole number greater than zero.'
    }
    if (!positiveNumber(row.targetWeight)) {
      return 'Weight must be greater than zero.'
    }
  }
  return null
}

export function buildTemplateInput(
  draft: QuickTemplateDraft,
  unitSystem: UnitSystem,
): TemplateInput {
  const exercises: TemplateExerciseInput[] = draft.rows.map((row, index) => ({
    exercise_id: row.exerciseId,
    position: index,
    target_sets: row.targetSets !== null && row.targetSets > 0 ? Math.round(row.targetSets) : null,
    target_reps: row.targetReps !== null && row.targetReps > 0 ? Math.round(row.targetReps) : null,
    target_weight_kg:
      row.targetWeight !== null && row.targetWeight > 0
        ? displayToKg(row.targetWeight, unitSystem)
        : null,
  }))

  return {
    name: draft.name.trim(),
    notes: null,
    exercises,
  }
}

export function assignmentSlots(
  plan: Pick<Plan, 'slots'>,
  dayOfWeek: number,
  templateId: string,
): PlanSlotInput[] {
  const byDay = new Map(plan.slots.map((slot) => [slot.day_of_week, slot.template_id]))

  return Array.from({ length: WEEK_LENGTH }, (_, day) => ({
    day_of_week: day,
    template_id: day === dayOfWeek ? templateId : (byDay.get(day) ?? null),
  }))
}

export function nextQuickCreateStep(createdTemplateId: string | null): QuickCreateStep {
  return createdTemplateId === null
    ? { kind: 'create' }
    : { kind: 'assign', templateId: createdTemplateId }
}

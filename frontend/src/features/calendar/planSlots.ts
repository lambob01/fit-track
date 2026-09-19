import type { Plan, PlanSlotInput } from '../../api/types'

export function slotInputsFromDraft(slotIds: Record<number, string>): PlanSlotInput[] {
  return Object.entries(slotIds)
    .map(([day, templateId]) => ({
      day_of_week: Number(day),
      template_id: templateId === '' ? null : templateId,
    }))
    .sort((a, b) => a.day_of_week - b.day_of_week)
}

export function slotsWithAssignment(
  plan: Pick<Plan, 'slots'>,
  dayOfWeek: number,
  templateId: string | null,
): PlanSlotInput[] {
  const byDay = new Map(plan.slots.map((slot) => [slot.day_of_week, slot.template_id]))
  byDay.set(dayOfWeek, templateId)
  return Array.from(byDay, ([day_of_week, template_id]) => ({ day_of_week, template_id })).sort(
    (a, b) => a.day_of_week - b.day_of_week,
  )
}

import type { Plan, PlanSlotInput } from '../../api/types'

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export function weekdayName(dayOfWeek: number): string {
  return WEEKDAY_NAMES[dayOfWeek] ?? `Day ${dayOfWeek + 1}`
}

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

export function slotsWithSwap(
  plan: Pick<Plan, 'slots'>,
  fromDay: number,
  toDay: number,
): PlanSlotInput[] {
  const byDay = new Map<number, string | null>()
  for (let day = 0; day < 7; day += 1) {
    byDay.set(day, null)
  }
  for (const slot of plan.slots) {
    if (slot.day_of_week >= 0 && slot.day_of_week < 7) {
      byDay.set(slot.day_of_week, slot.template_id)
    }
  }

  const fromTemplate = byDay.get(fromDay) ?? null
  const toTemplate = byDay.get(toDay) ?? null
  byDay.set(fromDay, toTemplate)
  byDay.set(toDay, fromTemplate)

  return Array.from(byDay, ([day_of_week, template_id]) => ({ day_of_week, template_id })).sort(
    (a, b) => a.day_of_week - b.day_of_week,
  )
}

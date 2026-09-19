import { describe, expect, it } from 'vitest'
import type { Plan } from '../../api/types'
import { slotInputsFromDraft, slotsWithAssignment } from './planSlots'

function slot(day_of_week: number, template_id: string | null): Plan['slots'][number] {
  return { id: `slot-${day_of_week}`, day_of_week, template_id, template_name: null }
}

describe('slotsWithAssignment', () => {
  it('assigns a template to an empty plan day', () => {
    const plan: Pick<Plan, 'slots'> = { slots: [] }

    expect(slotsWithAssignment(plan, 2, 'template-a')).toEqual([
      { day_of_week: 2, template_id: 'template-a' },
    ])
  })

  it('replaces the template for an existing day and keeps the others', () => {
    const plan: Pick<Plan, 'slots'> = { slots: [slot(0, 'old'), slot(4, 'keep')] }

    expect(slotsWithAssignment(plan, 0, 'new')).toEqual([
      { day_of_week: 0, template_id: 'new' },
      { day_of_week: 4, template_id: 'keep' },
    ])
  })

  it('clears a day by assigning null', () => {
    const plan: Pick<Plan, 'slots'> = { slots: [slot(1, 'template-a')] }

    expect(slotsWithAssignment(plan, 1, null)).toEqual([{ day_of_week: 1, template_id: null }])
  })

  it('returns slots ordered by day of week', () => {
    const plan: Pick<Plan, 'slots'> = { slots: [slot(5, 'a'), slot(1, 'b')] }

    expect(slotsWithAssignment(plan, 3, 'c')).toEqual([
      { day_of_week: 1, template_id: 'b' },
      { day_of_week: 3, template_id: 'c' },
      { day_of_week: 5, template_id: 'a' },
    ])
  })
})

describe('slotInputsFromDraft', () => {
  it('maps the empty Rest selection to null', () => {
    expect(slotInputsFromDraft({ 1: '' })).toEqual([{ day_of_week: 1, template_id: null }])
  })

  it('keeps assigned template ids and orders by day of week', () => {
    expect(slotInputsFromDraft({ 4: 'template-b', 0: 'template-a' })).toEqual([
      { day_of_week: 0, template_id: 'template-a' },
      { day_of_week: 4, template_id: 'template-b' },
    ])
  })

  it('omits unset days rather than sending stale values', () => {
    expect(slotInputsFromDraft({})).toEqual([])
  })
})

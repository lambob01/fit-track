import { describe, expect, it } from 'vitest'
import type { Plan } from '../../api/types'
import { slotInputsFromDraft, slotsWithAssignment, slotsWithSwap, weekdayName } from './planSlots'

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

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

describe('slotsWithSwap', () => {
  it('moves a template onto a Rest day and leaves Rest behind', () => {
    const plan: Pick<Plan, 'slots'> = { slots: [slot(0, 'push')] }

    const result = slotsWithSwap(plan, 0, 2)

    expect(result).toHaveLength(7)
    expect(result.map((entry) => entry.day_of_week)).toEqual(ALL_DAYS)
    expect(result[0]).toEqual({ day_of_week: 0, template_id: null })
    expect(result[2]).toEqual({ day_of_week: 2, template_id: 'push' })
    expect(result.filter((entry) => entry.template_id !== null)).toEqual([
      { day_of_week: 2, template_id: 'push' },
    ])
  })

  it('exchanges the templates of two planned days and preserves the rest', () => {
    const plan: Pick<Plan, 'slots'> = {
      slots: [slot(0, 'push'), slot(3, 'pull'), slot(5, 'legs')],
    }

    const result = slotsWithSwap(plan, 0, 3)

    expect(result).toHaveLength(7)
    expect(result[0]).toEqual({ day_of_week: 0, template_id: 'pull' })
    expect(result[3]).toEqual({ day_of_week: 3, template_id: 'push' })
    expect(result[5]).toEqual({ day_of_week: 5, template_id: 'legs' })
    expect(result.filter((entry) => entry.template_id !== null)).toHaveLength(3)
  })

  it('keeps every day unchanged when swapping a day with itself', () => {
    const plan: Pick<Plan, 'slots'> = {
      slots: [slot(1, 'a'), slot(4, 'b')],
    }

    expect(slotsWithSwap(plan, 4, 4)).toEqual([
      { day_of_week: 0, template_id: null },
      { day_of_week: 1, template_id: 'a' },
      { day_of_week: 2, template_id: null },
      { day_of_week: 3, template_id: null },
      { day_of_week: 4, template_id: 'b' },
      { day_of_week: 5, template_id: null },
      { day_of_week: 6, template_id: null },
    ])
  })

  it('treats a target with no slot row as Rest and creates its entry', () => {
    const plan: Pick<Plan, 'slots'> = { slots: [slot(6, 'sunday')] }

    const result = slotsWithSwap(plan, 2, 6)

    expect(result).toHaveLength(7)
    expect(result[6]).toEqual({ day_of_week: 6, template_id: null })
    expect(result[2]).toEqual({ day_of_week: 2, template_id: 'sunday' })
  })

  it('normalizes absent days to explicit Rest entries for the full replace', () => {
    const plan: Pick<Plan, 'slots'> = { slots: [slot(2, 'push')] }

    const result = slotsWithSwap(plan, 2, 3)

    expect(result.map((entry) => entry.day_of_week)).toEqual(ALL_DAYS)
    expect(result.filter((entry) => entry.template_id !== null)).toEqual([
      { day_of_week: 3, template_id: 'push' },
    ])
  })
})

describe('weekdayName', () => {
  it('names Monday-based plan days', () => {
    expect(weekdayName(0)).toBe('Monday')
    expect(weekdayName(2)).toBe('Wednesday')
    expect(weekdayName(6)).toBe('Sunday')
  })

  it('falls back for out-of-range days', () => {
    expect(weekdayName(9)).toBe('Day 10')
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

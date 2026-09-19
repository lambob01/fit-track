import { describe, expect, it } from 'vitest'
import type { DataEntity } from '../../api/types'
import { DANGER_ZONE_CATEGORIES, formatDeletedCounts } from './dangerZoneLogic'

const DELETABLE_ENTITIES: DataEntity[] = [
  'weight_entries',
  'measurements',
  'workouts',
  'cardio_activities',
  'sets',
  'plans',
]

describe('DANGER_ZONE_CATEGORIES', () => {
  it('covers every deletable entity exactly once', () => {
    const entities = DANGER_ZONE_CATEGORIES.map((category) => category.entity)
    expect(new Set(entities).size).toBe(entities.length)
    expect(new Set(entities)).toEqual(new Set(DELETABLE_ENTITIES))
  })

  it('labels and describes every category', () => {
    for (const category of DANGER_ZONE_CATEGORIES) {
      expect(category.label.trim()).not.toBe('')
      expect(category.description.trim()).not.toBe('')
    }
  })
})

describe('formatDeletedCounts', () => {
  it('reports nothing when the response is empty', () => {
    expect(formatDeletedCounts({})).toBe('Nothing was deleted.')
  })

  it('ignores zero counts', () => {
    expect(formatDeletedCounts({ weight_entries: 0, workouts: 0 })).toBe(
      'Nothing was deleted.',
    )
  })

  it('uses the singular label for one row', () => {
    expect(formatDeletedCounts({ weight_entries: 1 })).toBe('Deleted 1 weight entry.')
  })

  it('uses the plural label for several rows', () => {
    expect(formatDeletedCounts({ cardio_activities: 12 })).toBe(
      'Deleted 12 cardio activities.',
    )
  })

  it('joins two categories with and', () => {
    expect(formatDeletedCounts({ weight_entries: 3, cardio_activities: 1 })).toBe(
      'Deleted 3 weight entries and 1 cardio activity.',
    )
  })

  it('joins three or more categories with commas and and', () => {
    expect(formatDeletedCounts({ workouts: 2, sets: 5, plans: 1 })).toBe(
      'Deleted 2 workouts, 5 sets and 1 weekly plan.',
    )
  })

  it('falls back to the raw key for unknown entities', () => {
    expect(formatDeletedCounts({ mystery_rows: 2 })).toBe('Deleted 2 mystery_rows.')
  })
})

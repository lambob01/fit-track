import type { DataEntity } from '../../api/types'

export interface EntityLabel {
  singular: string
  plural: string
}

export const ENTITY_LABELS: Record<DataEntity, EntityLabel> = {
  weight_entries: { singular: 'weight entry', plural: 'weight entries' },
  measurements: { singular: 'body measurement', plural: 'body measurements' },
  workouts: { singular: 'workout', plural: 'workouts' },
  cardio_activities: { singular: 'cardio activity', plural: 'cardio activities' },
  sets: { singular: 'set', plural: 'sets' },
  plans: { singular: 'weekly plan', plural: 'weekly plans' },
}

export interface DangerZoneCategory {
  entity: DataEntity
  label: string
  description: string
}

export const DANGER_ZONE_CATEGORIES: DangerZoneCategory[] = [
  {
    entity: 'workouts',
    label: 'Workouts',
    description: 'Every workout with its exercises and sets.',
  },
  {
    entity: 'cardio_activities',
    label: 'Cardio activities',
    description: 'Every cardio activity with its splits.',
  },
  {
    entity: 'weight_entries',
    label: 'Weight entries',
    description: 'Every weight entry for this profile.',
  },
  {
    entity: 'sets',
    label: 'Sets',
    description: 'Every set, keeping the workouts themselves.',
  },
  {
    entity: 'plans',
    label: 'Weekly plans',
    description: 'Every weekly plan and its schedule slots.',
  },
  {
    entity: 'measurements',
    label: 'Body measurements',
    description: 'Every body measurement for this profile.',
  },
]

export function formatDeletedCounts(deleted: Record<string, number>): string {
  const parts = Object.entries(deleted)
    .filter(([, count]) => count > 0)
    .map(([entity, count]) => {
      const label = ENTITY_LABELS[entity as DataEntity]
      const noun =
        label === undefined ? entity : count === 1 ? label.singular : label.plural
      return `${count} ${noun}`
    })

  if (parts.length === 0) {
    return 'Nothing was deleted.'
  }
  if (parts.length === 1) {
    return `Deleted ${parts[0]}.`
  }
  return `Deleted ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`
}

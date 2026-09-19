import type {
  CalendarWeek,
  CardioActivity,
  CardioActivityInput,
  CardioComparison,
  CardioPrs,
  CardioSplits,
  CardioStreaks,
  CardioSummary,
  CardioType,
  CardioWeek,
  CardioZones,
  Dashboard,
  DataEntity,
  DeletedCounts,
  DemoSeedCounts,
  Exercise,
  ExerciseInput,
  ExercisePatch,
  ExerciseProgress,
  ExercisePrs,
  ExerciseResolveResult,
  ExportEntity,
  ImportCounts,
  LastPerformance,
  LoginRequest,
  Plan,
  PlanInput,
  PlanPatch,
  Profile,
  ReorderSetsInput,
  SetInput,
  SetPatch,
  Settings,
  SettingsPatch,
  Shoe,
  ShoeInput,
  ShoePatch,
  StartFromTemplateResult,
  Template,
  TemplateInput,
  TemplatePatch,
  User,
  WeightBucket,
  WeightEntry,
  WeightEntryInput,
  WeightSeries,
  Workout,
  WorkoutExercise,
  WorkoutExerciseInput,
  WorkoutInput,
  WorkoutPatch,
  WorkoutSet,
  WorkoutSummary,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function validationMessages(detail: unknown[]): string[] {
  return detail.flatMap((item) => {
    if (typeof item === 'string') {
      return [item]
    }
    if (typeof item !== 'object' || item === null) {
      return []
    }
    const message = (item as { msg?: unknown }).msg
    if (typeof message !== 'string') {
      return []
    }
    const location = (item as { loc?: unknown }).loc
    const path = Array.isArray(location) ? location.join('.') : ''
    return [path === '' ? message : `${path}: ${message}`]
  })
}

async function readErrorDetail(response: Response): Promise<string> {
  const fallback = response.statusText || `Request failed with status ${response.status}`

  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string') {
        return detail
      }
      if (Array.isArray(detail)) {
        const messages = validationMessages(detail)
        if (messages.length > 0) {
          return messages.join('; ')
        }
      }
    }
  } catch {
    return fallback
  }

  return fallback
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init })

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  if (text === '') {
    return undefined as T
  }

  return JSON.parse(text) as T
}

export async function apiText(path: string, init: RequestInit = {}): Promise<string> {
  const response = await fetch(path, { credentials: 'include', ...init })

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response))
  }

  return response.text()
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  if (body === undefined) {
    return { method }
  }

  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const authApi = {
  me: () => api<User>('/api/auth/me'),
  login: (credentials: LoginRequest) =>
    api<void>('/api/auth/login', jsonRequest('POST', credentials)),
  logout: () => api<void>('/api/auth/logout', jsonRequest('POST')),
}

export const settingsApi = {
  get: () => api<Settings>('/api/settings'),
  update: (patch: SettingsPatch) => api<Settings>('/api/settings', jsonRequest('PATCH', patch)),
}

export const dashboardApi = {
  get: () => api<Dashboard>('/api/dashboard'),
}

export const dataApi = {
  exportJson: () => api<unknown>('/api/export/json'),
  exportCsv: (entity: ExportEntity) => apiText(`/api/export/${entity}.csv`),
  importJson: (body: string) =>
    api<ImportCounts>('/api/import/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
  seedDemo: () => api<DemoSeedCounts>('/api/data/demo', jsonRequest('POST')),
  deleteEntity: (entity: DataEntity, range?: { from: string; to: string }) => {
    const suffix =
      range === undefined
        ? ''
        : `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    return api<DeletedCounts>(`/api/data/${entity}${suffix}`, { method: 'DELETE' })
  },
  deleteAll: (password: string) =>
    api<DeletedCounts>('/api/data/all', jsonRequest('DELETE', { password })),
}

export const profilesApi = {
  list: () => api<Profile[]>('/api/profiles'),
  create: (name: string) => api<Profile>('/api/profiles', jsonRequest('POST', { name })),
  switch: (id: string) => api<void>(`/api/profiles/${id}/switch`, jsonRequest('POST')),
  remove: (id: string, password: string) =>
    api<void>(`/api/profiles/${id}`, jsonRequest('DELETE', { password })),
}

export interface ExerciseListParams {
  q?: string
  category?: string
  muscle_group?: string
  include_archived?: boolean
  limit?: number
}

export interface ExerciseProgressParams {
  from: string
  to: string
  reps?: number
}

export const exercisesApi = {
  list: (params: ExerciseListParams = {}) => {
    const query = new URLSearchParams()
    if (params.q !== undefined) query.set('q', params.q)
    if (params.category !== undefined) query.set('category', params.category)
    if (params.muscle_group !== undefined) query.set('muscle_group', params.muscle_group)
    if (params.include_archived !== undefined)
      query.set('include_archived', String(params.include_archived))
    if (params.limit !== undefined) query.set('limit', String(params.limit))
    const queryString = query.toString()
    const suffix = queryString === '' ? '' : `?${queryString}`
    return api<Exercise[]>(`/api/exercises${suffix}`)
  },
  create: (input: ExerciseInput) => api<Exercise>('/api/exercises', jsonRequest('POST', input)),
  resolve: (name: string) =>
    api<ExerciseResolveResult>('/api/exercises/resolve', jsonRequest('POST', { name })),
  update: (id: string, patch: ExercisePatch) =>
    api<Exercise>(`/api/exercises/${id}`, jsonRequest('PATCH', patch)),
  progress: (id: string, params: ExerciseProgressParams) => {
    const query = new URLSearchParams({ from: params.from, to: params.to })
    if (params.reps !== undefined) {
      query.set('reps', String(params.reps))
    }
    return api<ExerciseProgress>(`/api/exercises/${id}/progress?${query.toString()}`)
  },
  prs: (id: string) => api<ExercisePrs>(`/api/exercises/${id}/prs`),
  lastPerformance: (id: string) =>
    api<LastPerformance | null>(`/api/exercises/${id}/last-performance`),
}

export const workoutsApi = {
  list: (limit = 50) => api<WorkoutSummary[]>(`/api/workouts?limit=${limit}`),
  get: (id: string) => api<Workout>(`/api/workouts/${id}`),
  save: (input: WorkoutInput) => api<Workout>('/api/workouts', jsonRequest('POST', input)),
  patch: (id: string, patch: WorkoutPatch) =>
    api<Workout>(`/api/workouts/${id}`, jsonRequest('PATCH', patch)),
  remove: (id: string) => api<void>(`/api/workouts/${id}`, { method: 'DELETE' }),
  addExercise: (workoutId: string, input: WorkoutExerciseInput) =>
    api<WorkoutExercise>(`/api/workouts/${workoutId}/exercises`, jsonRequest('POST', input)),
  removeExercise: (workoutExerciseId: string) =>
    api<void>(`/api/workout-exercises/${workoutExerciseId}`, { method: 'DELETE' }),
  addSet: (workoutExerciseId: string, input: SetInput) =>
    api<WorkoutSet>(`/api/workout-exercises/${workoutExerciseId}/sets`, jsonRequest('POST', input)),
  patchSet: (setId: string, patch: SetPatch) =>
    api<WorkoutSet>(`/api/sets/${setId}`, jsonRequest('PATCH', patch)),
  removeSet: (setId: string) => api<void>(`/api/sets/${setId}`, { method: 'DELETE' }),
  reorderSets: (workoutExerciseId: string, setIds: string[]) => {
    const input: ReorderSetsInput = { set_ids: setIds }
    return api<WorkoutSet[]>(
      `/api/workout-exercises/${workoutExerciseId}/reorder-sets`,
      jsonRequest('POST', input),
    )
  },
  startFromTemplate: (templateId: string) =>
    api<StartFromTemplateResult>(
      `/api/workouts/from-template/${templateId}`,
      jsonRequest('POST'),
    ),
}

export const templatesApi = {
  list: (includeArchived = false) =>
    api<Template[]>(`/api/templates${includeArchived ? '?include_archived=true' : ''}`),
  get: (id: string) => api<Template>(`/api/templates/${id}`),
  create: (input: TemplateInput) => api<Template>('/api/templates', jsonRequest('POST', input)),
  update: (id: string, patch: TemplatePatch) =>
    api<Template>(`/api/templates/${id}`, jsonRequest('PATCH', patch)),
  remove: (id: string) => api<void>(`/api/templates/${id}`, { method: 'DELETE' }),
}

export const plansApi = {
  list: () => api<Plan[]>('/api/plans'),
  create: (input: PlanInput) => api<Plan>('/api/plans', jsonRequest('POST', input)),
  update: (id: string, patch: PlanPatch) =>
    api<Plan>(`/api/plans/${id}`, jsonRequest('PATCH', patch)),
  remove: (id: string) => api<void>(`/api/plans/${id}`, { method: 'DELETE' }),
  activate: (id: string) => api<Plan>(`/api/plans/${id}/activate`, jsonRequest('POST')),
}

export const calendarApi = {
  week: (weekStart?: string) => {
    const suffix = weekStart === undefined ? '' : `?week_start=${weekStart}`
    return api<CalendarWeek>(`/api/calendar${suffix}`)
  },
}

export interface WeightSeriesParams {
  from: string
  to: string
  bucket: WeightBucket
}

export interface CardioListParams {
  type?: CardioType
  limit?: number
}

export interface CardioSummaryParams {
  from: string
  to: string
  type?: CardioType
}

export const cardioApi = {
  list: (params: CardioListParams = {}) => {
    const query = new URLSearchParams()
    if (params.type !== undefined) query.set('type', params.type)
    if (params.limit !== undefined) query.set('limit', String(params.limit))
    const queryString = query.toString()
    const suffix = queryString === '' ? '' : `?${queryString}`
    return api<CardioActivity[]>(`/api/cardio${suffix}`)
  },
  summary: (params: CardioSummaryParams) => {
    const query = new URLSearchParams({ from: params.from, to: params.to })
    if (params.type !== undefined) query.set('type', params.type)
    return api<CardioSummary>(`/api/cardio/summary?${query.toString()}`)
  },
  week: (weekStart?: string) => {
    const suffix = weekStart === undefined ? '' : `?week_start=${weekStart}`
    return api<CardioWeek>(`/api/cardio/week${suffix}`)
  },
  get: (id: string) => api<CardioActivity>(`/api/cardio/${id}`),
  create: (input: CardioActivityInput) =>
    api<CardioActivity>('/api/cardio', jsonRequest('POST', input)),
  update: (id: string, patch: CardioActivityInput) =>
    api<CardioActivity>(`/api/cardio/${id}`, jsonRequest('PATCH', patch)),
  remove: (id: string) => api<void>(`/api/cardio/${id}`, { method: 'DELETE' }),
  splits: (id: string) => api<CardioSplits>(`/api/cardio/splits/${id}`),
  prs: () => api<CardioPrs>('/api/cardio/prs'),
  streaks: () => api<CardioStreaks>('/api/cardio/streaks'),
  comparison: (type: CardioType = 'run') =>
    api<CardioComparison>(`/api/cardio/comparison?type=${type}`),
  zones: (id: string) => api<CardioZones | null>(`/api/cardio/${id}/zones`),
}

export const shoesApi = {
  list: () => api<Shoe[]>('/api/shoes'),
  create: (input: ShoeInput) => api<Shoe>('/api/shoes', jsonRequest('POST', input)),
  update: (id: string, patch: ShoePatch) =>
    api<Shoe>(`/api/shoes/${id}`, jsonRequest('PATCH', patch)),
  remove: (id: string) => api<void>(`/api/shoes/${id}`, { method: 'DELETE' }),
}

export const weightApi = {
  listEntries: () => api<WeightEntry[]>('/api/weight/entries'),
  createEntry: (entry: WeightEntryInput) =>
    api<WeightEntry>('/api/weight/entries', jsonRequest('POST', entry)),
  updateEntry: (id: string, patch: WeightEntryInput) =>
    api<WeightEntry>(`/api/weight/entries/${id}`, jsonRequest('PATCH', patch)),
  deleteEntry: (id: string) =>
    api<void>(`/api/weight/entries/${id}`, { method: 'DELETE' }),
  series: ({ from, to, bucket }: WeightSeriesParams) => {
    const query = new URLSearchParams({ from, to, bucket })
    return api<WeightSeries>(`/api/weight/series?${query.toString()}`)
  },
}

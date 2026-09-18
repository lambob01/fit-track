import type {
  Dashboard,
  Exercise,
  ExerciseInput,
  ExercisePatch,
  ExerciseProgress,
  ExercisePrs,
  ExerciseResolveResult,
  LastPerformance,
  LoginRequest,
  SetInput,
  SetPatch,
  Settings,
  SettingsPatch,
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

async function readErrorDetail(response: Response): Promise<string> {
  const fallback = response.statusText || `Request failed with status ${response.status}`

  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string') {
        return detail
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

export interface WeightSeriesParams {
  from: string
  to: string
  bucket: WeightBucket
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

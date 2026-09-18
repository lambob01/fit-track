import type {
  Dashboard,
  LoginRequest,
  Settings,
  SettingsPatch,
  User,
  WeightBucket,
  WeightEntry,
  WeightEntryInput,
  WeightSeries,
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

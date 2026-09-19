import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, apiText, exercisesApi } from './client'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('error details', () => {
  it('surfaces string details from HTTPException responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Unknown entity' }, 404)))

    await expect(api('/api/export/nope.csv')).rejects.toMatchObject({
      status: 404,
      detail: 'Unknown entity',
    })
  })

  it('surfaces FastAPI validation lists as readable messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            detail: [
              {
                loc: ['body', 'timezone'],
                msg: 'Value error, Unknown timezone: Mars/Olympus',
                type: 'value_error',
              },
              { loc: ['body', 'max_hr'], msg: 'Input should be less than or equal to 250' },
            ],
          },
          422,
        ),
      ),
    )

    const error = await api('/api/settings').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).detail).toBe(
      'body.timezone: Value error, Unknown timezone: Mars/Olympus; body.max_hr: Input should be less than or equal to 250',
    )
  })

  it('falls back to the status text for non-JSON error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('gateway error', { status: 502 })),
    )

    await expect(apiText('/api/export/sets.csv')).rejects.toMatchObject({ status: 502 })
  })
})

describe('exercise progress query params', () => {
  it('omits reps when the metric does not need it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)

    await exercisesApi.progress('e1', { from: 'a', to: 'b' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/exercises/e1/progress?from=a&to=b')
  })

  it('passes reps only when supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 200))
    vi.stubGlobal('fetch', fetchMock)

    await exercisesApi.progress('e1', { from: 'a', to: 'b', reps: 5 })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/exercises/e1/progress?from=a&to=b&reps=5')
  })
})

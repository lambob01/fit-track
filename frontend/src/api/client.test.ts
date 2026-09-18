import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, apiText } from './client'

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

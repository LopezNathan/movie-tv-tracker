import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, apiWithRetry, ApiRequestError, json } from '../src/lib/api';

describe('API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retries transient write failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const onRetry = vi.fn();

    await expect(
      apiWithRetry('/api/imports/run/batches', json('POST', { items: [] }), {
        baseDelayMs: 0,
        onRetry,
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permanent client error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiWithRetry('/api/imports/run/batches', json('POST', { items: [] }), {
        baseDelayMs: 0,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('includes the HTTP status when a platform response has no JSON error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 524 })));

    await expect(api('/api/imports/run/batches', json('POST'))).rejects.toEqual(
      expect.objectContaining<ApiRequestError>({
        message: 'Request failed (HTTP 524).',
        status: 524,
      }),
    );
  });
});

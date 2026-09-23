// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureEpisode, ensureMedia } from '../worker/lib/media-service';
import { createTestDatabase, seedMedia } from './d1';

let harness: Awaited<ReturnType<typeof createTestDatabase>>;

beforeEach(async () => {
  harness = await createTestDatabase();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await harness.dispose();
});

function mockTmdb() {
  const fetchMock = vi.fn(async (input: string | URL | Request) =>
    Response.json(
      String(input).includes('/season/')
        ? {
            episodes: [1, 2, 3, 4].map((number) => ({
              id: 500 + number,
              name: `Episode ${number}`,
              episode_number: number,
              season_number: 1,
              air_date: '2025-03-13',
            })),
          }
        : { id: 249042, name: 'Adolescence', status: 'Ended', number_of_seasons: 1 },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function episodeCount() {
  return harness.database
    .prepare("SELECT count(*) count FROM media WHERE kind = 'episode'")
    .first<number>('count');
}

describe('show metadata freshness', () => {
  it.each(['Ended', 'Canceled', 'Returning Series'])(
    'refreshes %s shows after one day',
    async (status) => {
      const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
      await seedMedia(harness.database, {
        id: 'show',
        kind: 'show',
        tmdbId: 249042,
        title: 'Old title',
        status,
        metadataUpdatedAt: old,
        episodesUpdatedAt: old,
      });
      const fetchMock = mockTmdb();
      expect((await ensureMedia(harness.env, 'show', 249042)).title).toBe('Adolescence');
      expect(await episodeCount()).toBe(4);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it('completes a fresh guide after importing just one episode and preserves its identity', async () => {
    const fetchMock = mockTmdb();
    const imported = await ensureEpisode(harness.env, 249042, 1, 4);
    expect(await episodeCount()).toBe(1);

    await ensureMedia(harness.env, 'show', 249042);
    expect(await episodeCount()).toBe(4);
    const saved = await ensureEpisode(harness.env, 249042, 1, 4);
    expect(saved?.id).toBe(imported?.id);

    fetchMock.mockClear();
    await ensureMedia(harness.env, 'show', 249042);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a failed forced episode refresh even when show metadata is fresh', async () => {
    const fetchMock = mockTmdb();
    await ensureMedia(harness.env, 'show', 249042);
    fetchMock.mockImplementationOnce(async () =>
      Response.json({ id: 249042, name: 'Adolescence', status: 'Ended', number_of_seasons: 1 }),
    );
    fetchMock.mockImplementationOnce(async () => new Response('unavailable', { status: 503 }));
    await expect(ensureMedia(harness.env, 'show', 249042, { force: true })).rejects.toThrow();
    expect(
      await harness.database
        .prepare("SELECT episodes_updated_at FROM media WHERE kind = 'show'")
        .first('episodes_updated_at'),
    ).toBeNull();

    fetchMock.mockClear();
    await ensureMedia(harness.env, 'show', 249042);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await episodeCount()).toBe(4);
  });

  it('caches a successful empty guide for an upcoming show', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: 249042,
        name: 'Upcoming show',
        number_of_seasons: 0,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await ensureMedia(harness.env, 'show', 249042);
    await ensureMedia(harness.env, 'show', 249042);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await episodeCount()).toBe(0);
  });
});

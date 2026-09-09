// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../worker';
import { ensureMedia } from '../worker/lib/media-service';
import type { Bindings } from '../worker/env';
import { createTestDatabase, seedMedia } from './d1';

let harness: Awaited<ReturnType<typeof createTestDatabase>>;

function request(path: string, init?: RequestInit, env: Bindings = harness.env) {
  return app.request(`http://scene.test${path}`, init, env);
}

function body(method: string, value: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
}

beforeEach(async () => {
  harness = await createTestDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await harness.dispose();
});

describe('tracker API with local D1', () => {
  it('rejects production requests without a validated Access token', async () => {
    const response = await request('/api/health', undefined, {
      ...harness.env,
      ENVIRONMENT: 'production',
      DEV_USER_EMAIL: 'must-not-be-used@example.test',
    });
    expect(response.status).toBe(401);
  });

  it('preserves rewatches, supports undo, and validates ratings', async () => {
    await request('/api/health');
    await seedMedia(harness.database, { id: 'movie-1', kind: 'movie', tmdbId: 1, title: 'Film' });
    const first = await request(
      '/api/watch-events',
      body('POST', { mediaId: 'movie-1', watchedAt: '2026-01-01T00:00:00.000Z' }),
    );
    const second = await request(
      '/api/watch-events',
      body('POST', { mediaId: 'movie-1', watchedAt: '2026-02-01T00:00:00.000Z' }),
    );
    expect([first.status, second.status]).toEqual([201, 201]);
    const history = await (await request('/api/history')).json<{ items: Array<{ id: string }> }>();
    expect(history.items).toHaveLength(2);

    expect(
      (await request(`/api/watch-events/${history.items[0].id}`, { method: 'DELETE' })).status,
    ).toBe(204);
    expect((await (await request('/api/history')).json<{ items: unknown[] }>()).items).toHaveLength(
      1,
    );

    expect((await request('/api/ratings/movie-1', body('PUT', { rating: 8 }))).status).toBe(200);
    expect((await request('/api/ratings/movie-1', body('PUT', { rating: 11 }))).status).toBe(400);
    const savedRating = await harness.database
      .prepare('SELECT rating FROM ratings WHERE media_id = ?')
      .bind('movie-1')
      .first<{ rating: number }>();
    expect(savedRating?.rating).toBe(8);

    expect((await request('/api/watchlist/movie-1', body('PUT', {}))).status).toBe(200);
    const watchlist = await (
      await request('/api/library?filter=watchlist')
    ).json<{ items: unknown[] }>();
    expect(watchlist.items).toHaveLength(1);
    expect((await request('/api/watchlist/movie-1', { method: 'DELETE' })).status).toBe(204);
    const emptyWatchlist = await (
      await request('/api/library?filter=watchlist')
    ).json<{ items: unknown[] }>();
    expect(emptyWatchlist.items).toHaveLength(0);
  });

  it('bulk marks only aired, not-yet-watched episodes', async () => {
    await request('/api/health');
    await seedMedia(harness.database, { id: 'show-1', kind: 'show', tmdbId: 10, title: 'Show' });
    await seedMedia(harness.database, {
      id: 'ep-1',
      kind: 'episode',
      tmdbId: 11,
      title: 'One',
      seriesId: 'show-1',
      seasonNumber: 1,
      episodeNumber: 1,
      airDate: '2020-01-01',
    });
    await seedMedia(harness.database, {
      id: 'ep-2',
      kind: 'episode',
      tmdbId: 12,
      title: 'Two',
      seriesId: 'show-1',
      seasonNumber: 1,
      episodeNumber: 2,
      airDate: '2020-01-02',
    });
    await seedMedia(harness.database, {
      id: 'ep-3',
      kind: 'episode',
      tmdbId: 13,
      title: 'Future',
      seriesId: 'show-1',
      seasonNumber: 1,
      episodeNumber: 3,
      airDate: '2999-01-01',
    });
    await request('/api/watch-events', body('POST', { mediaId: 'ep-1' }));
    const result = await (
      await request('/api/bulk-watch', body('POST', { showId: 'show-1', seasonNumber: 1 }))
    ).json<{ created: number }>();
    expect(result.created).toBe(1);
    const events = await harness.database.prepare('SELECT media_id FROM watch_events').all();
    expect(events.results.map((row) => row.media_id).sort()).toEqual(['ep-1', 'ep-2']);
  });

  it('persists per-user Up Next visibility without removing progress', async () => {
    await request('/api/health');
    await seedMedia(harness.database, {
      id: 'show-1',
      kind: 'show',
      tmdbId: 10,
      title: 'Show',
      status: 'Ended',
    });
    await seedMedia(harness.database, {
      id: 'ep-1',
      kind: 'episode',
      tmdbId: 11,
      title: 'One',
      seriesId: 'show-1',
      seasonNumber: 1,
      episodeNumber: 1,
      airDate: '2020-01-01',
    });
    await seedMedia(harness.database, {
      id: 'ep-2',
      kind: 'episode',
      tmdbId: 12,
      title: 'Two',
      seriesId: 'show-1',
      seasonNumber: 1,
      episodeNumber: 2,
      airDate: '2020-01-02',
    });
    await request('/api/watch-events', body('POST', { mediaId: 'ep-1' }));

    const visible = await (
      await request('/api/dashboard')
    ).json<{ upNext: Array<{ show: { id: string } }> }>();
    expect(visible.upNext.map(({ show }) => show.id)).toContain('show-1');

    expect((await request('/api/up-next/show-1', body('PUT', { hidden: true }))).status).toBe(200);
    const hidden = await (
      await request('/api/dashboard')
    ).json<{ upNext: Array<{ show: { id: string } }> }>();
    expect(hidden.upNext.map(({ show }) => show.id)).not.toContain('show-1');

    const detail = await (
      await request('/api/media/show/10')
    ).json<{ hiddenFromUpNext: boolean; progress: { watched: number } }>();
    expect(detail).toMatchObject({ hiddenFromUpNext: true, progress: { watched: 1 } });

    await request('/api/up-next/show-1', body('PUT', { hidden: false }));
    const restored = await (
      await request('/api/dashboard')
    ).json<{ upNext: Array<{ show: { id: string } }> }>();
    expect(restored.upNext.map(({ show }) => show.id)).toContain('show-1');
  });

  it('opens a long-running show without exceeding D1 query limits', async () => {
    await request('/api/health');
    await seedMedia(harness.database, {
      id: 'show-1',
      kind: 'show',
      tmdbId: 10,
      title: 'Long-running show',
      status: 'Ended',
    });
    for (let episodeNumber = 1; episodeNumber <= 110; episodeNumber += 1) {
      await seedMedia(harness.database, {
        id: `ep-${episodeNumber}`,
        kind: 'episode',
        tmdbId: 100 + episodeNumber,
        title: `Episode ${episodeNumber}`,
        seriesId: 'show-1',
        seasonNumber: 1,
        episodeNumber,
        airDate: '2020-01-01',
      });
    }

    const response = await request('/api/media/show/10');
    expect(response.status).toBe(200);
    expect((await response.json<{ episodes: unknown[] }>()).episodes).toHaveLength(110);
  });

  it('deduplicates the same imported watch event', async () => {
    await request('/api/health');
    await seedMedia(harness.database, { id: 'movie-1', kind: 'movie', tmdbId: 1, title: 'Film' });
    const run = await (
      await request(
        '/api/imports',
        body('POST', { source: 'trakt', filename: 'export.zip', totalItems: 1 }),
      )
    ).json<{ run: { id: string } }>();
    const item = {
      action: 'watch',
      kind: 'movie',
      title: 'Film',
      tmdbId: 1,
      watchedAt: '2026-01-01T00:00:00.000Z',
      sourceEventId: 'trakt-history-1',
      fingerprint: 'watch|movie|1|2026-01-01',
    };
    const first = await (
      await request(`/api/imports/${run.run.id}/batches`, body('POST', { items: [item] }))
    ).json<{ imported: number; skipped: number }>();
    const duplicate = await (
      await request(`/api/imports/${run.run.id}/batches`, body('POST', { items: [item] }))
    ).json<{ imported: number; skipped: number }>();
    expect(first).toMatchObject({ imported: 1, skipped: 0 });
    expect(duplicate).toMatchObject({ imported: 0, skipped: 1 });
    const count = await harness.database
      .prepare('SELECT count(*) count FROM watch_events')
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it('refreshes stale continuing shows and discovers new episodes', async () => {
    await seedMedia(harness.database, {
      id: 'show-1',
      kind: 'show',
      tmdbId: 50,
      title: 'Old title',
      status: 'Returning Series',
      metadataUpdatedAt: '2020-01-01T00:00:00.000Z',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        return new Response(
          JSON.stringify(
            url.includes('/season/1')
              ? {
                  episodes: [
                    {
                      id: 501,
                      name: 'New episode',
                      air_date: '2026-01-01',
                      episode_number: 1,
                      season_number: 1,
                    },
                  ],
                }
              : {
                  id: 50,
                  media_type: 'tv',
                  name: 'Fresh title',
                  status: 'Returning Series',
                  number_of_seasons: 1,
                  external_ids: {},
                },
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    const refreshed = await ensureMedia(harness.env, 'show', 50);
    expect(refreshed.title).toBe('Fresh title');
    const episode = await harness.database
      .prepare("SELECT title FROM media WHERE kind = 'episode'")
      .first<{ title: string }>();
    expect(episode?.title).toBe('New episode');
  });
});

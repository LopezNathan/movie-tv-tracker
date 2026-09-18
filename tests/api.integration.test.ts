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
  it('creates a user once without mutating it on a matching subsequent request', async () => {
    await harness.database
      .prepare(
        `CREATE TABLE user_mutations (
          operation TEXT NOT NULL
        )`,
      )
      .run();
    await harness.database
      .prepare(
        `CREATE TRIGGER users_insert_audit AFTER INSERT ON users
         BEGIN INSERT INTO user_mutations (operation) VALUES ('insert'); END`,
      )
      .run();
    await harness.database
      .prepare(
        `CREATE TRIGGER users_update_audit AFTER UPDATE ON users
         BEGIN INSERT INTO user_mutations (operation) VALUES ('update'); END`,
      )
      .run();

    expect((await request('/api/me')).status).toBe(200);
    expect((await request('/api/me')).status).toBe(200);

    const users = await harness.database.prepare('SELECT id, email FROM users').all();
    const mutations = await harness.database
      .prepare('SELECT operation FROM user_mutations ORDER BY rowid')
      .all();
    expect(users.results).toEqual([{ id: 'dev:owner@example.test', email: 'owner@example.test' }]);
    expect(mutations.results).toEqual([{ operation: 'insert' }]);
  });

  it('updates an existing user when the authenticated email changes for the same subject', async () => {
    await harness.database
      .prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)')
      .bind('tailnet:single-user', 'old@example.test', '2026-01-01T00:00:00.000Z')
      .run();

    const response = await request('/api/me', undefined, {
      ...harness.env,
      ENVIRONMENT: 'production',
      AUTH_MODE: 'tailnet-single-user',
      APP_USER_EMAIL: 'New@Example.test',
      DEV_USER_EMAIL: undefined,
    });

    expect(response.status).toBe(200);
    const user = await harness.database
      .prepare('SELECT email, created_at AS createdAt FROM users WHERE id = ?')
      .bind('tailnet:single-user')
      .first();
    expect(user).toEqual({ email: 'new@example.test', createdAt: '2026-01-01T00:00:00.000Z' });
  });

  it('handles concurrent first requests without duplicate or inconsistent users', async () => {
    const responses = await Promise.all([request('/api/me'), request('/api/me')]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    const users = await harness.database.prepare('SELECT id, email FROM users').all();
    expect(users.results).toEqual([{ id: 'dev:owner@example.test', email: 'owner@example.test' }]);
  });

  it('rejects production requests without a validated Access token', async () => {
    const response = await request('/api/me', undefined, {
      ...harness.env,
      ENVIRONMENT: 'production',
      DEV_USER_EMAIL: 'must-not-be-used@example.test',
    });
    expect(response.status).toBe(401);
  });

  it('rejects an invalid Access token', async () => {
    const response = await request(
      '/api/me',
      { headers: { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' } },
      {
        ...harness.env,
        ENVIRONMENT: 'production',
        DEV_USER_EMAIL: undefined,
        CF_ACCESS_TEAM_DOMAIN: 'scene.cloudflareaccess.com',
        CF_ACCESS_AUD: 'scene-audience',
      },
    );
    expect(response.status).toBe(401);
  });

  it('returns 503 when Access validation is not configured', async () => {
    const response = await request(
      '/api/me',
      {
        headers: { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' },
      },
      {
        ...harness.env,
        ENVIRONMENT: 'production',
        DEV_USER_EMAIL: undefined,
      },
    );
    expect(response.status).toBe(503);
  });

  it('accepts the configured single user when protected by a tailnet', async () => {
    const response = await request('/api/me', undefined, {
      ...harness.env,
      ENVIRONMENT: 'production',
      AUTH_MODE: 'tailnet-single-user',
      APP_USER_EMAIL: 'Owner@Example.test',
      DEV_USER_EMAIL: undefined,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: 'tailnet:single-user', email: 'owner@example.test' },
    });
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

  it('pages a distinct watched library by each title’s latest watch event', async () => {
    await request('/api/me');
    const movieOne = '00000000-0000-4000-8000-000000000001';
    const showOne = '00000000-0000-4000-8000-000000000002';
    const movieTwo = '00000000-0000-4000-8000-000000000003';
    await seedMedia(harness.database, { id: movieOne, kind: 'movie', tmdbId: 1, title: 'First' });
    await seedMedia(harness.database, { id: showOne, kind: 'show', tmdbId: 2, title: 'Second' });
    await seedMedia(harness.database, { id: movieTwo, kind: 'movie', tmdbId: 3, title: 'Third' });
    const userId = 'dev:owner@example.test';
    const events = [
      ['event-1', movieOne, '2026-01-01T00:00:00.000Z'],
      ['event-2', movieOne, '2026-01-04T00:00:00.000Z'],
      ['event-3', showOne, '2026-01-03T00:00:00.000Z'],
      ['event-4', movieTwo, '2026-01-02T00:00:00.000Z'],
    ];
    for (const [id, mediaId, watchedAt] of events) {
      await harness.database
        .prepare(
          `INSERT INTO watch_events (id, user_id, media_id, watched_at, source, created_at)
           VALUES (?, ?, ?, ?, 'manual', ?)`,
        )
        .bind(id, userId, mediaId, watchedAt, watchedAt)
        .run();
    }

    const first = await (
      await request('/api/library?filter=watched&limit=2')
    ).json<{
      items: Array<{ item: { id: string }; watchedAt: string }>;
      total: number;
      nextCursor: { watchedAt: string; itemId: string } | null;
    }>();
    expect(first.total).toBe(3);
    expect(first.items.map(({ item, watchedAt }) => ({ id: item.id, watchedAt }))).toEqual([
      { id: movieOne, watchedAt: '2026-01-04T00:00:00.000Z' },
      { id: showOne, watchedAt: '2026-01-03T00:00:00.000Z' },
    ]);
    expect(first.nextCursor).toEqual({ watchedAt: '2026-01-03T00:00:00.000Z', itemId: showOne });

    const second = await (
      await request(
        `/api/library?filter=watched&limit=2&before=${encodeURIComponent(first.nextCursor!.watchedAt)}&beforeId=${first.nextCursor!.itemId}`,
      )
    ).json<{
      items: Array<{ item: { id: string }; watchedAt: string }>;
      nextCursor: unknown;
    }>();
    expect(second.items.map(({ item, watchedAt }) => ({ id: item.id, watchedAt }))).toEqual([
      { id: movieTwo, watchedAt: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(second.nextCursor).toBeNull();

    const movies = await (
      await request('/api/library?filter=watched&kind=movie&limit=2')
    ).json<{ items: Array<{ item: { id: string } }>; total: number }>();
    expect(movies.total).toBe(2);
    expect(movies.items.map(({ item }) => item.id)).toEqual([movieOne, movieTwo]);
  });

  it('lists hidden shows in the library by when they were hidden', async () => {
    await request('/api/me');
    const olderShow = '00000000-0000-4000-8000-000000000011';
    const newerShow = '00000000-0000-4000-8000-000000000012';
    await seedMedia(harness.database, { id: olderShow, kind: 'show', tmdbId: 11, title: 'Older' });
    await seedMedia(harness.database, { id: newerShow, kind: 'show', tmdbId: 12, title: 'Newer' });
    await harness.database
      .prepare(
        `INSERT INTO up_next_exclusions (id, user_id, show_id, hidden_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
      )
      .bind(
        '00000000-0000-4000-8000-000000000021',
        'dev:owner@example.test',
        olderShow,
        '2026-01-01T00:00:00.000Z',
        '00000000-0000-4000-8000-000000000022',
        'dev:owner@example.test',
        newerShow,
        '2026-02-01T00:00:00.000Z',
      )
      .run();

    const library = await (
      await request('/api/library?filter=hidden')
    ).json<{ items: Array<{ item: { id: string }; hiddenAt: string }>; total: number }>();

    expect(library.total).toBe(2);
    expect(library.items).toEqual([
      { item: expect.objectContaining({ id: newerShow }), hiddenAt: '2026-02-01T00:00:00.000Z' },
      { item: expect.objectContaining({ id: olderShow }), hiddenAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('reports distinct watched shows in dashboard stats', async () => {
    await request('/api/health');
    await seedMedia(harness.database, {
      id: 'show-1',
      kind: 'show',
      tmdbId: 10,
      title: 'Show one',
    });
    await seedMedia(harness.database, {
      id: 'show-2',
      kind: 'show',
      tmdbId: 20,
      title: 'Show two',
    });
    await seedMedia(harness.database, {
      id: 'episode-1',
      kind: 'episode',
      tmdbId: 11,
      title: 'Episode one',
      seriesId: 'show-1',
    });
    await seedMedia(harness.database, {
      id: 'episode-2',
      kind: 'episode',
      tmdbId: 12,
      title: 'Episode two',
      seriesId: 'show-1',
    });
    await seedMedia(harness.database, {
      id: 'episode-3',
      kind: 'episode',
      tmdbId: 21,
      title: 'Episode three',
      seriesId: 'show-2',
    });

    await request('/api/watch-events', body('POST', { mediaId: 'episode-1' }));
    await request('/api/watch-events', body('POST', { mediaId: 'episode-2' }));
    await request('/api/watch-events', body('POST', { mediaId: 'episode-3' }));

    const dashboard = await (
      await request('/api/dashboard')
    ).json<{
      stats: { watchedShows: number; watchedEpisodes: number };
    }>();
    expect(dashboard.stats).toMatchObject({ watchedShows: 2, watchedEpisodes: 3 });
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

  it('deduplicates a retried import batch without double-counting progress', async () => {
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
      await request(
        `/api/imports/${run.run.id}/batches`,
        body('POST', { items: [item], batchId: `${run.run.id}:0` }),
      )
    ).json<{ imported: number; skipped: number; duplicate?: boolean }>();
    const duplicate = await (
      await request(
        `/api/imports/${run.run.id}/batches`,
        body('POST', { items: [item], batchId: `${run.run.id}:0` }),
      )
    ).json<{ imported: number; skipped: number; duplicate?: boolean }>();
    expect(first).toMatchObject({ imported: 1, skipped: 0 });
    expect(duplicate).toMatchObject({ imported: 1, skipped: 0, duplicate: true });
    const count = await harness.database
      .prepare('SELECT count(*) count FROM watch_events')
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
    const progress = await harness.database
      .prepare('SELECT processed_items processedItems FROM import_runs WHERE id = ?')
      .bind(run.run.id)
      .first<{ processedItems: number }>();
    expect(progress?.processedItems).toBe(1);
  });

  it('hydrates only the requested episode while importing history', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const payload = url.includes('/season/1')
        ? {
            episodes: [1, 2, 3].map((episodeNumber) => ({
              id: 500 + episodeNumber,
              name: `Episode ${episodeNumber}`,
              air_date: '2026-01-01',
              episode_number: episodeNumber,
              season_number: 1,
            })),
          }
        : {
            id: 50,
            media_type: 'tv',
            name: 'Large show',
            status: 'Ended',
            number_of_seasons: 30,
            external_ids: {},
          };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const run = await (
      await request(
        '/api/imports',
        body('POST', { source: 'trakt', filename: 'export.zip', totalItems: 1 }),
      )
    ).json<{ run: { id: string } }>();
    const item = {
      action: 'watch',
      kind: 'episode',
      title: 'Episode 2',
      showTitle: 'Large show',
      showTmdbId: 50,
      seasonNumber: 1,
      episodeNumber: 2,
      watchedAt: '2026-01-01T00:00:00.000Z',
      sourceEventId: 'trakt-history-episode-2',
      fingerprint: 'watch|episode|50|1|2|2026-01-01',
    };

    const response = await request(
      `/api/imports/${run.run.id}/batches`,
      body('POST', { items: [item], batchId: `${run.run.id}:0` }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ imported: 1, issues: 0 });
    const episodes = await harness.database
      .prepare(
        "SELECT tmdb_id tmdbId, episode_number episodeNumber FROM media WHERE kind = 'episode'",
      )
      .all();
    expect(episodes.results).toEqual([{ tmdbId: 502, episodeNumber: 2 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
                  poster_path: '/season-one.jpg',
                  episodes: [
                    {
                      id: 501,
                      name: 'New episode',
                      air_date: '2026-01-01',
                      episode_number: 1,
                      season_number: 1,
                      still_path: '/episode-still.jpg',
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
      .prepare("SELECT title, poster_path posterPath FROM media WHERE kind = 'episode'")
      .first<{ title: string; posterPath: string | null }>();
    expect(episode?.title).toBe('New episode');
    expect(episode?.posterPath).toBe('/season-one.jpg');
  });

  it('uses season artwork for an existing episode in the watched library', async () => {
    await request('/api/health');
    await seedMedia(harness.database, {
      id: 'show-1',
      kind: 'show',
      tmdbId: 50,
      title: 'Show',
      posterPath: '/show-poster.jpg',
    });
    await seedMedia(harness.database, {
      id: 'episode-1',
      kind: 'episode',
      tmdbId: 501,
      title: 'Episode',
      posterPath: '/legacy-episode-still.jpg',
      seriesId: 'show-1',
      seasonNumber: 1,
      episodeNumber: 1,
    });
    await request('/api/watch-events', body('POST', { mediaId: 'episode-1' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ poster_path: '/season-one.jpg', episodes: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    const library = await (
      await request('/api/library?filter=watched')
    ).json<{ items: Array<{ item: { posterPath: string | null } }> }>();

    expect(library.items[0]?.item.posterPath).toBe('/season-one.jpg');
  });
});

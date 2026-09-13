import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type {
  DashboardResponse,
  MediaDetailResponse,
  MediaRecord,
  WatchEventRecord,
} from '../shared/types';
import {
  importIssues,
  importRuns,
  listEntries,
  media,
  ratings,
  upNextExclusions,
  watchEvents,
} from './db/schema';
import type { AppEnv } from './env';
import { requireUser } from './lib/auth';
import { processImportBatch } from './lib/import-service';
import { ensureMedia } from './lib/media-service';
import { calculateProgress } from './lib/progress';
import { getTmdbSeason, searchTmdb, TmdbError } from './lib/tmdb';

const app = new Hono<AppEnv>();
const seasonPosterCache = new Map<string, string | null>();

const isoTimestamp = z.string().datetime({ offset: true });
const kindParam = z.object({
  kind: z.enum(['movie', 'show']),
  id: z.coerce.number().int().positive(),
});
const mediaIdParam = z.object({ mediaId: z.string().min(1) });
const importItemSchema = z.object({
  action: z.enum(['watch', 'rating', 'watchlist']),
  kind: z.enum(['movie', 'show', 'episode']),
  title: z.string().min(1).max(500),
  year: z.number().int().optional(),
  tmdbId: z.number().int().positive().optional(),
  imdbId: z.string().max(32).optional(),
  tvdbId: z.number().int().positive().optional(),
  showTitle: z.string().max(500).optional(),
  showYear: z.number().int().optional(),
  showTmdbId: z.number().int().positive().optional(),
  showImdbId: z.string().max(32).optional(),
  showTvdbId: z.number().int().positive().optional(),
  seasonNumber: z.number().int().min(0).optional(),
  episodeNumber: z.number().int().min(0).optional(),
  watchedAt: isoTimestamp.optional(),
  ratedAt: isoTimestamp.optional(),
  addedAt: isoTimestamp.optional(),
  rating: z.number().int().min(1).max(10).optional(),
  sourceEventId: z.string().max(100).optional(),
  fingerprint: z.string().min(1).max(1000),
});

function eventRecord(row: {
  event: typeof watchEvents.$inferSelect;
  item: typeof media.$inferSelect;
}): WatchEventRecord {
  return {
    id: row.event.id,
    mediaId: row.event.mediaId,
    watchedAt: row.event.watchedAt,
    source: row.event.source,
    media: row.item as MediaRecord,
  };
}

async function getWatchedIds(db: ReturnType<typeof drizzle>, userId: string) {
  const rows = await db
    .select({ mediaId: watchEvents.mediaId })
    .from(watchEvents)
    .where(eq(watchEvents.userId, userId));
  return new Set(rows.map((row) => row.mediaId));
}

app.get('/api/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT }));
app.use('/api/*', requireUser);

app.get('/api/me', (c) => c.json({ user: c.get('user') }));

app.get(
  '/api/search',
  zValidator(
    'query',
    z.object({
      q: z.string().trim().min(2).max(100),
      page: z.coerce.number().int().min(1).default(1),
    }),
  ),
  async (c) => {
    const { q, page } = c.req.valid('query');
    return c.json(await searchTmdb(c.env, q, page));
  },
);

app.get('/api/dashboard', async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get('user');
  const [recentRows, watchlistRows, allEventRows, episodeRows, showRows, excludedRows] =
    await Promise.all([
      db
        .select({ event: watchEvents, item: media })
        .from(watchEvents)
        .innerJoin(media, eq(watchEvents.mediaId, media.id))
        .where(eq(watchEvents.userId, user.id))
        .orderBy(desc(watchEvents.watchedAt), desc(watchEvents.id))
        .limit(12),
      db
        .select({ item: media })
        .from(listEntries)
        .innerJoin(media, eq(listEntries.mediaId, media.id))
        .where(and(eq(listEntries.userId, user.id), eq(listEntries.list, 'watchlist')))
        .orderBy(desc(listEntries.addedAt))
        .limit(12),
      db
        .select({ mediaId: watchEvents.mediaId, kind: media.kind, seriesId: media.seriesId })
        .from(watchEvents)
        .innerJoin(media, eq(watchEvents.mediaId, media.id))
        .where(eq(watchEvents.userId, user.id)),
      db
        .select()
        .from(media)
        .where(eq(media.kind, 'episode'))
        .orderBy(asc(media.seasonNumber), asc(media.episodeNumber)),
      db.select().from(media).where(eq(media.kind, 'show')),
      db
        .select({ showId: upNextExclusions.showId })
        .from(upNextExclusions)
        .where(eq(upNextExclusions.userId, user.id)),
    ]);

  const watchedIds = new Set(allEventRows.map((row) => row.mediaId));
  const excludedShowIds = new Set(excludedRows.map((row) => row.showId));
  const startedShowIds = new Set(
    allEventRows.flatMap((row) => (row.seriesId ? [row.seriesId] : [])),
  );
  const upNext = showRows
    .filter((show) => startedShowIds.has(show.id) && !excludedShowIds.has(show.id))
    .map((show) => ({
      show: show as MediaRecord,
      progress: calculateProgress(show.id, episodeRows as MediaRecord[], watchedIds),
    }))
    .filter(({ progress }) => progress.nextEpisode !== null)
    .sort((a, b) =>
      (a.progress.nextEpisode?.airDate ?? '').localeCompare(b.progress.nextEpisode?.airDate ?? ''),
    );
  const showsById = new Map(showRows.map((show) => [show.id, show as MediaRecord]));

  const payload: DashboardResponse = {
    upNext,
    recent: recentRows.map((row) => ({
      ...eventRecord(row),
      show: row.item.seriesId ? showsById.get(row.item.seriesId) : undefined,
    })),
    watchlist: watchlistRows.map((row) => row.item as MediaRecord),
    stats: {
      watchedMovies: new Set(
        allEventRows.filter((row) => row.kind === 'movie').map((row) => row.mediaId),
      ).size,
      watchedEpisodes: new Set(
        allEventRows.filter((row) => row.kind === 'episode').map((row) => row.mediaId),
      ).size,
      watchEvents: allEventRows.length,
    },
  };
  return c.json(payload);
});

app.get(
  '/api/media/:kind/:id',
  zValidator('param', kindParam),
  zValidator('query', z.object({ refresh: z.enum(['0', '1']).optional() })),
  async (c) => {
    const { kind, id } = c.req.valid('param');
    const { refresh } = c.req.valid('query');
    const item = await ensureMedia(c.env, kind, id, refresh === '1');
    const db = drizzle(c.env.DB);
    const user = c.get('user');
    const episodes =
      kind === 'show'
        ? await db
            .select()
            .from(media)
            .where(eq(media.seriesId, item.id))
            .orderBy(asc(media.seasonNumber), asc(media.episodeNumber))
        : [];
    const [eventRows, rating, listEntry, watchedIds, upNextExclusion] = await Promise.all([
      db
        .select({ event: watchEvents, item: media })
        .from(watchEvents)
        .innerJoin(media, eq(watchEvents.mediaId, media.id))
        .where(
          and(
            eq(watchEvents.userId, user.id),
            kind === 'show'
              ? or(eq(media.id, item.id), eq(media.seriesId, item.id))
              : eq(media.id, item.id),
          ),
        )
        .orderBy(desc(watchEvents.watchedAt)),
      db
        .select()
        .from(ratings)
        .where(and(eq(ratings.userId, user.id), eq(ratings.mediaId, item.id)))
        .get(),
      db
        .select()
        .from(listEntries)
        .where(
          and(
            eq(listEntries.userId, user.id),
            eq(listEntries.mediaId, item.id),
            eq(listEntries.list, 'watchlist'),
          ),
        )
        .get(),
      getWatchedIds(db, user.id),
      kind === 'show'
        ? db
            .select({ id: upNextExclusions.id })
            .from(upNextExclusions)
            .where(and(eq(upNextExclusions.userId, user.id), eq(upNextExclusions.showId, item.id)))
            .get()
        : Promise.resolve(undefined),
    ]);
    const payload: MediaDetailResponse = {
      media: item,
      episodes: episodes as MediaRecord[],
      watchEvents: eventRows.map(eventRecord),
      rating: rating?.rating ?? null,
      inWatchlist: Boolean(listEntry),
      hiddenFromUpNext: Boolean(upNextExclusion),
      progress:
        kind === 'show' ? calculateProgress(item.id, episodes as MediaRecord[], watchedIds) : null,
    };
    return c.json(payload);
  },
);

app.get(
  '/api/history',
  zValidator(
    'query',
    z.object({
      cursor: isoTimestamp.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  ),
  async (c) => {
    const { cursor, limit } = c.req.valid('query');
    const db = drizzle(c.env.DB);
    const user = c.get('user');
    const condition = cursor
      ? and(eq(watchEvents.userId, user.id), lt(watchEvents.watchedAt, cursor))
      : eq(watchEvents.userId, user.id);
    const rows = await db
      .select({ event: watchEvents, item: media })
      .from(watchEvents)
      .innerJoin(media, eq(watchEvents.mediaId, media.id))
      .where(condition)
      .orderBy(desc(watchEvents.watchedAt), desc(watchEvents.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const seriesIds = [
      ...new Set(pageRows.flatMap((row) => (row.item.seriesId ? [row.item.seriesId] : []))),
    ];
    const showRows = seriesIds.length
      ? await db.select().from(media).where(inArray(media.id, seriesIds))
      : [];
    const showsById = new Map(showRows.map((show) => [show.id, show as MediaRecord]));
    const seasons = new Map<string, { show: MediaRecord; seasonNumber: number }>();
    for (const row of pageRows) {
      const show = row.item.seriesId ? showsById.get(row.item.seriesId) : undefined;
      if (show && row.item.seasonNumber !== null) {
        seasons.set(`${show.id}:${row.item.seasonNumber}`, {
          show,
          seasonNumber: row.item.seasonNumber,
        });
      }
    }
    const seasonPosters = new Map(
      await Promise.all(
        [...seasons.entries()].map(async ([key, { show, seasonNumber }]) => {
          if (seasonPosterCache.has(key)) return [key, seasonPosterCache.get(key)] as const;
          try {
            const season = await getTmdbSeason(c.env, show.tmdbId, seasonNumber);
            const posterPath = season.poster_path ?? null;
            seasonPosterCache.set(key, posterPath);
            return [key, posterPath] as const;
          } catch {
            return [key, null] as const;
          }
        }),
      ),
    );
    const page = pageRows.map((row) => ({
      ...eventRecord(row),
      show: row.item.seriesId ? showsById.get(row.item.seriesId) : undefined,
      seasonPosterPath:
        row.item.seriesId && row.item.seasonNumber !== null
          ? (seasonPosters.get(`${row.item.seriesId}:${row.item.seasonNumber}`) ?? null)
          : undefined,
    }));
    return c.json({ items: page, nextCursor: hasMore ? page.at(-1)?.watchedAt : null });
  },
);

app.get(
  '/api/library',
  zValidator(
    'query',
    z.object({ filter: z.enum(['watchlist', 'watched', 'rated']).default('watchlist') }),
  ),
  async (c) => {
    const { filter } = c.req.valid('query');
    const db = drizzle(c.env.DB);
    const user = c.get('user');
    if (filter === 'watchlist') {
      const rows = await db
        .select({ item: media, addedAt: listEntries.addedAt })
        .from(listEntries)
        .innerJoin(media, eq(listEntries.mediaId, media.id))
        .where(and(eq(listEntries.userId, user.id), eq(listEntries.list, 'watchlist')))
        .orderBy(desc(listEntries.addedAt));
      return c.json({ items: rows });
    }
    if (filter === 'rated') {
      const rows = await db
        .select({ item: media, rating: ratings.rating, ratedAt: ratings.ratedAt })
        .from(ratings)
        .innerJoin(media, eq(ratings.mediaId, media.id))
        .where(eq(ratings.userId, user.id))
        .orderBy(desc(ratings.ratedAt));
      return c.json({ items: rows });
    }
    const rows = await db
      .select({ item: media, watchedAt: watchEvents.watchedAt })
      .from(watchEvents)
      .innerJoin(media, eq(watchEvents.mediaId, media.id))
      .where(eq(watchEvents.userId, user.id))
      .orderBy(desc(watchEvents.watchedAt));
    const seen = new Set<string>();
    return c.json({
      items: rows.filter(({ item }) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
    });
  },
);

app.post(
  '/api/watch-events',
  zValidator(
    'json',
    z.object({
      mediaId: z.string().min(1),
      watchedAt: isoTimestamp.optional(),
      source: z.enum(['manual', 'trakt']).default('manual'),
      sourceEventKey: z.string().min(1).optional(),
    }),
  ),
  async (c) => {
    const input = c.req.valid('json');
    const db = drizzle(c.env.DB);
    const user = c.get('user');
    const item = await db
      .select({ id: media.id })
      .from(media)
      .where(eq(media.id, input.mediaId))
      .get();
    if (!item) throw new HTTPException(404, { message: 'Media item not found.' });
    const now = new Date().toISOString();
    const event = {
      id: crypto.randomUUID(),
      userId: user.id,
      mediaId: input.mediaId,
      watchedAt: input.watchedAt ?? now,
      source: input.source,
      sourceEventKey: input.sourceEventKey ?? null,
      createdAt: now,
    };
    await db.insert(watchEvents).values(event).onConflictDoNothing();
    return c.json({ event }, 201);
  },
);

app.delete('/api/watch-events/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const deleted = await db
    .delete(watchEvents)
    .where(and(eq(watchEvents.id, c.req.param('id')), eq(watchEvents.userId, c.get('user').id)))
    .returning({ id: watchEvents.id });
  if (!deleted.length) throw new HTTPException(404, { message: 'Watch event not found.' });
  return c.body(null, 204);
});

app.put(
  '/api/ratings/:mediaId',
  zValidator('param', mediaIdParam),
  zValidator(
    'json',
    z.object({ rating: z.number().int().min(1).max(10), ratedAt: isoTimestamp.optional() }),
  ),
  async (c) => {
    const { mediaId } = c.req.valid('param');
    const input = c.req.valid('json');
    const db = drizzle(c.env.DB);
    const values = {
      id: crypto.randomUUID(),
      userId: c.get('user').id,
      mediaId,
      rating: input.rating,
      ratedAt: input.ratedAt ?? new Date().toISOString(),
      source: 'manual',
    };
    await db
      .insert(ratings)
      .values(values)
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.mediaId],
        set: { rating: values.rating, ratedAt: values.ratedAt, source: 'manual' },
      });
    return c.json({ rating: values.rating });
  },
);

app.delete('/api/ratings/:mediaId', zValidator('param', mediaIdParam), async (c) => {
  const db = drizzle(c.env.DB);
  await db
    .delete(ratings)
    .where(
      and(eq(ratings.userId, c.get('user').id), eq(ratings.mediaId, c.req.valid('param').mediaId)),
    );
  return c.body(null, 204);
});

app.put(
  '/api/watchlist/:mediaId',
  zValidator('param', mediaIdParam),
  zValidator('json', z.object({ addedAt: isoTimestamp.optional() })),
  async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user');
    const { mediaId } = c.req.valid('param');
    const addedAt = c.req.valid('json').addedAt ?? new Date().toISOString();
    await db
      .insert(listEntries)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        mediaId,
        list: 'watchlist',
        addedAt,
        source: 'manual',
      })
      .onConflictDoUpdate({
        target: [listEntries.userId, listEntries.mediaId, listEntries.list],
        set: { addedAt, source: 'manual' },
      });
    return c.json({ inWatchlist: true });
  },
);

app.delete('/api/watchlist/:mediaId', zValidator('param', mediaIdParam), async (c) => {
  const db = drizzle(c.env.DB);
  await db
    .delete(listEntries)
    .where(
      and(
        eq(listEntries.userId, c.get('user').id),
        eq(listEntries.mediaId, c.req.valid('param').mediaId),
      ),
    );
  return c.body(null, 204);
});

app.put(
  '/api/up-next/:mediaId',
  zValidator('param', mediaIdParam),
  zValidator('json', z.object({ hidden: z.boolean() })),
  async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user');
    const { mediaId } = c.req.valid('param');
    const { hidden } = c.req.valid('json');
    const show = await db
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.id, mediaId), eq(media.kind, 'show')))
      .get();
    if (!show) throw new HTTPException(404, { message: 'Show not found.' });

    if (hidden) {
      await db
        .insert(upNextExclusions)
        .values({
          id: crypto.randomUUID(),
          userId: user.id,
          showId: mediaId,
          hiddenAt: new Date().toISOString(),
        })
        .onConflictDoNothing();
    } else {
      await db
        .delete(upNextExclusions)
        .where(and(eq(upNextExclusions.userId, user.id), eq(upNextExclusions.showId, mediaId)));
    }
    return c.json({ hiddenFromUpNext: hidden });
  },
);

app.post(
  '/api/bulk-watch',
  zValidator(
    'json',
    z.object({
      showId: z.string().min(1),
      seasonNumber: z.number().int().min(0).optional(),
      throughEpisodeId: z.string().min(1).optional(),
      watchedAt: isoTimestamp.optional(),
    }),
  ),
  async (c) => {
    const input = c.req.valid('json');
    const db = drizzle(c.env.DB);
    const user = c.get('user');
    const today = new Date().toISOString().slice(0, 10);
    const episodes = await db
      .select()
      .from(media)
      .where(eq(media.seriesId, input.showId))
      .orderBy(asc(media.seasonNumber), asc(media.episodeNumber));
    const through = input.throughEpisodeId
      ? episodes.find((episode) => episode.id === input.throughEpisodeId)
      : undefined;
    if (input.throughEpisodeId && !through) {
      throw new HTTPException(400, {
        message: 'The selected episode does not belong to this show.',
      });
    }
    const watchedIds = await getWatchedIds(db, user.id);
    const selected = episodes.filter((episode) => {
      if (!episode.airDate || episode.airDate > today || watchedIds.has(episode.id)) return false;
      if (input.seasonNumber !== undefined) return episode.seasonNumber === input.seasonNumber;
      if (through) {
        return (
          (episode.seasonNumber ?? 0) < (through.seasonNumber ?? 0) ||
          (episode.seasonNumber === through.seasonNumber &&
            (episode.episodeNumber ?? 0) <= (through.episodeNumber ?? 0))
        );
      }
      return true;
    });
    const watchedAt = input.watchedAt ?? new Date().toISOString();
    for (const episode of selected) {
      await db.insert(watchEvents).values({
        id: crypto.randomUUID(),
        userId: user.id,
        mediaId: episode.id,
        watchedAt,
        source: 'manual',
        sourceEventKey: null,
        createdAt: new Date().toISOString(),
      });
    }
    return c.json({ created: selected.length });
  },
);

app.post(
  '/api/imports',
  zValidator(
    'json',
    z.object({
      source: z.literal('trakt'),
      filename: z.string().max(255),
      totalItems: z.number().int().min(0),
    }),
  ),
  async (c) => {
    const db = drizzle(c.env.DB);
    const now = new Date().toISOString();
    const run = {
      id: crypto.randomUUID(),
      userId: c.get('user').id,
      ...c.req.valid('json'),
      status: 'pending' as const,
      processedItems: 0,
      importedItems: 0,
      skippedItems: 0,
      issueCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(importRuns).values(run);
    return c.json({ run }, 201);
  },
);

app.post(
  '/api/imports/:id/batches',
  zValidator('json', z.object({ items: z.array(importItemSchema).min(1).max(25) })),
  async (c) => {
    const result = await processImportBatch(
      c.env,
      c.get('user').id,
      c.req.param('id'),
      c.req.valid('json').items,
    );
    if (!result) throw new HTTPException(404, { message: 'Import run not found.' });
    return c.json(result);
  },
);

app.get('/api/imports/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const run = await db
    .select()
    .from(importRuns)
    .where(and(eq(importRuns.id, c.req.param('id')), eq(importRuns.userId, c.get('user').id)))
    .get();
  if (!run) throw new HTTPException(404, { message: 'Import run not found.' });
  const issues = await db.select().from(importIssues).where(eq(importIssues.importRunId, run.id));
  return c.json({ run, issues });
});

app.post('/api/imports/:id/finalize', async (c) => {
  const db = drizzle(c.env.DB);
  const updated = await db
    .update(importRuns)
    .set({ status: 'complete', updatedAt: new Date().toISOString() })
    .where(and(eq(importRuns.id, c.req.param('id')), eq(importRuns.userId, c.get('user').id)))
    .returning();
  if (!updated.length) throw new HTTPException(404, { message: 'Import run not found.' });
  return c.json({ run: updated[0] });
});

app.get('/api/export.json', async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get('user');
  const [items, events, userRatings, watchlist, hiddenUpNext] = await Promise.all([
    db.select().from(media),
    db.select().from(watchEvents).where(eq(watchEvents.userId, user.id)),
    db.select().from(ratings).where(eq(ratings.userId, user.id)),
    db.select().from(listEntries).where(eq(listEntries.userId, user.id)),
    db.select().from(upNextExclusions).where(eq(upNextExclusions.userId, user.id)),
  ]);
  c.header(
    'Content-Disposition',
    `attachment; filename="scene-export-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  return c.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    user: { email: user.email },
    media: items,
    watchEvents: events,
    ratings: userRatings,
    watchlist,
    hiddenUpNext,
  });
});

app.notFound((c) => c.json({ error: 'Not found.' }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof TmdbError) {
    return c.json({ error: error.message }, error.status as 404 | 502 | 503);
  }
  console.error(error);
  return c.json({ error: 'An unexpected error occurred.' }, 500);
});

export { app };
export default app;

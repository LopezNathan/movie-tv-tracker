import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { MediaRecord } from '../../shared/types';
import { media } from '../db/schema';
import type { Bindings } from '../env';
import { getTmdbDetails, getTmdbSeason, type TmdbDetails } from './tmdb';

function yearFrom(value?: string) {
  return Number(value?.slice(0, 4)) || null;
}

function isStale(item: typeof media.$inferSelect, now = Date.now()) {
  const age = now - new Date(item.metadataUpdatedAt).getTime();
  const day = 86_400_000;
  if (item.kind === 'show' && item.status !== 'Ended' && item.status !== 'Canceled')
    return age > day;
  if (item.kind === 'show') return age > 30 * day;
  return age > 365 * day;
}

function detailValues(
  kind: 'movie' | 'show',
  tmdbId: number,
  detail: TmdbDetails,
  id: string,
  now: string,
): typeof media.$inferInsert {
  return {
    id,
    kind,
    tmdbId,
    imdbId: detail.external_ids?.imdb_id ?? null,
    tvdbId: detail.external_ids?.tvdb_id ?? null,
    title: detail.title ?? detail.name ?? 'Untitled',
    originalTitle: detail.original_title ?? detail.original_name ?? null,
    releaseYear: yearFrom(detail.release_date ?? detail.first_air_date),
    overview: detail.overview ?? null,
    posterPath: detail.poster_path ?? null,
    backdropPath: detail.backdrop_path ?? null,
    status: detail.status ?? null,
    runtime: detail.runtime ?? detail.episode_run_time?.[0] ?? null,
    seriesId: null,
    seasonNumber: null,
    episodeNumber: null,
    airDate: detail.release_date ?? detail.first_air_date ?? null,
    metadataUpdatedAt: now,
    createdAt: now,
  };
}

async function hydrateEpisodes(env: Bindings, show: typeof media.$inferSelect, seasons: number) {
  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  const seasonNumbers = Array.from({ length: Math.min(seasons, 40) }, (_, index) => index + 1);

  for (let start = 0; start < seasonNumbers.length; start += 5) {
    const chunk = seasonNumbers.slice(start, start + 5);
    const results = await Promise.all(
      chunk.map(async (seasonNumber) => ({
        seasonNumber,
        data: await getTmdbSeason(env, show.tmdbId, seasonNumber),
      })),
    );

    for (const result of results) {
      for (const episode of result.data.episodes) {
        const values: typeof media.$inferInsert = {
          id: crypto.randomUUID(),
          kind: 'episode',
          tmdbId: episode.id,
          title: episode.name,
          originalTitle: null,
          releaseYear: yearFrom(episode.air_date),
          overview: episode.overview ?? null,
          posterPath: episode.still_path ?? show.posterPath,
          backdropPath: show.backdropPath,
          status: episode.air_date ? 'Aired or scheduled' : 'Unknown',
          runtime: episode.runtime ?? show.runtime,
          seriesId: show.id,
          seasonNumber: episode.season_number,
          episodeNumber: episode.episode_number,
          airDate: episode.air_date ?? null,
          metadataUpdatedAt: now,
          createdAt: now,
        };
        await db
          .insert(media)
          .values(values)
          .onConflictDoUpdate({
            target: [media.kind, media.tmdbId],
            set: {
              title: values.title,
              overview: values.overview,
              posterPath: values.posterPath,
              backdropPath: values.backdropPath,
              runtime: values.runtime,
              seriesId: values.seriesId,
              seasonNumber: values.seasonNumber,
              episodeNumber: values.episodeNumber,
              airDate: values.airDate,
              metadataUpdatedAt: now,
            },
          });
      }
    }
  }
}

export async function ensureMedia(
  env: Bindings,
  kind: 'movie' | 'show',
  tmdbId: number,
  force = false,
) {
  const db = drizzle(env.DB);
  const existing = await db
    .select()
    .from(media)
    .where(and(eq(media.kind, kind), eq(media.tmdbId, tmdbId)))
    .get();

  if (existing && !force && !isStale(existing)) return existing as MediaRecord;

  const detail = await getTmdbDetails(env, kind, tmdbId);
  const now = new Date().toISOString();
  const values = detailValues(kind, tmdbId, detail, existing?.id ?? crypto.randomUUID(), now);
  await db
    .insert(media)
    .values(values)
    .onConflictDoUpdate({
      target: [media.kind, media.tmdbId],
      set: {
        imdbId: values.imdbId,
        tvdbId: values.tvdbId,
        title: values.title,
        originalTitle: values.originalTitle,
        releaseYear: values.releaseYear,
        overview: values.overview,
        posterPath: values.posterPath,
        backdropPath: values.backdropPath,
        status: values.status,
        runtime: values.runtime,
        airDate: values.airDate,
        metadataUpdatedAt: now,
      },
    });

  const saved = await db
    .select()
    .from(media)
    .where(and(eq(media.kind, kind), eq(media.tmdbId, tmdbId)))
    .get();
  if (!saved) throw new Error('Media metadata could not be saved.');

  if (kind === 'show') {
    await hydrateEpisodes(env, saved, detail.number_of_seasons ?? 0);
  }
  return saved as MediaRecord;
}

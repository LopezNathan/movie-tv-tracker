import { strFromU8, unzipSync } from 'fflate';
import type { NormalizedImportItem } from '../../shared/types';

type UnknownRecord = Record<string, unknown>;

export type ParsedTraktExport = {
  items: NormalizedImportItem[];
  files: string[];
  warnings: string[];
  counts: { watch: number; rating: number; watchlist: number };
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asTimestamp(value: unknown) {
  const input = asText(value);
  if (!input) return undefined;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function idsFor(item: UnknownRecord) {
  const ids = record(item.ids) ?? item;
  return {
    tmdbId: asNumber(ids.tmdb ?? ids.tmdb_id),
    imdbId: asText(ids.imdb ?? ids.imdb_id),
    tvdbId: asNumber(ids.tvdb ?? ids.tvdb_id),
  };
}

function mediaFrom(row: UnknownRecord) {
  const movie = record(row.movie);
  if (movie) return { kind: 'movie' as const, item: movie };
  const episode = record(row.episode);
  if (episode) return { kind: 'episode' as const, item: episode };
  const show = record(row.show);
  if (show) return { kind: 'show' as const, item: show };
  const kind = asText(row.type ?? row.media_type);
  if (kind === 'movie' || kind === 'show' || kind === 'episode') {
    return { kind, item: record(row.media) ?? row };
  }
  return null;
}

function actionFor(filename: string, row: UnknownRecord) {
  const lower = filename.toLowerCase();
  if (lower.includes('rating') || row.rating !== undefined) return 'rating' as const;
  if (lower.includes('watchlist') || lower.includes('watch_list')) return 'watchlist' as const;
  if (lower.includes('history') || row.watched_at || row.watchedAt) return 'watch' as const;
  return null;
}

function normalize(filename: string, row: UnknownRecord): NormalizedImportItem | null {
  const action = actionFor(filename, row);
  const value = mediaFrom(row);
  if (!action || !value) return null;

  const ids = idsFor(value.item);
  const show = record(row.show);
  const showIds = show ? idsFor(show) : {};
  const seasonNumber = asNumber(value.item.season ?? value.item.season_number ?? row.season);
  const episodeNumber = asNumber(
    value.item.number ?? value.item.episode_number ?? row.episode_number,
  );
  const title =
    asText(value.item.title ?? value.item.name) ??
    (value.kind === 'episode' ? `Episode ${episodeNumber ?? '?'}` : undefined);
  if (!title) return null;

  const watchedAt = asTimestamp(row.watched_at ?? row.watchedAt ?? row.timestamp);
  const ratedAt = asTimestamp(row.rated_at ?? row.ratedAt);
  const addedAt = asTimestamp(row.listed_at ?? row.added_at ?? row.addedAt);
  const rating = asNumber(row.rating);
  if (action === 'rating' && (!rating || rating < 1 || rating > 10)) return null;
  if (action === 'watch' && !watchedAt) return null;

  const sourceEventId = asText(row.id ?? row.history_id ?? row.event_id);
  const identity =
    ids.tmdbId ?? ids.imdbId ?? ids.tvdbId ?? `${title}:${asNumber(value.item.year) ?? ''}`;
  const fingerprint = [
    action,
    value.kind,
    identity,
    seasonNumber ?? '',
    episodeNumber ?? '',
    watchedAt ?? ratedAt ?? addedAt ?? '',
    rating ?? '',
  ].join('|');

  return {
    action,
    kind: value.kind,
    title,
    year: asNumber(value.item.year),
    ...ids,
    showTitle: show ? asText(show.title ?? show.name) : undefined,
    showYear: show ? asNumber(show.year) : undefined,
    showTmdbId: showIds.tmdbId,
    showImdbId: showIds.imdbId,
    showTvdbId: showIds.tvdbId,
    seasonNumber,
    episodeNumber,
    watchedAt,
    ratedAt,
    addedAt,
    rating,
    sourceEventId,
    fingerprint,
  };
}

function rowsFromJson(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.map(record).filter((item) => item !== null);
  const root = record(value);
  if (!root) return [];
  for (const child of Object.values(root)) {
    if (Array.isArray(child)) return child.map(record).filter((item) => item !== null);
  }
  return [root];
}

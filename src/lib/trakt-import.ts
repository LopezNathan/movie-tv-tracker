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
    return { kind: kind as 'movie' | 'show' | 'episode', item: record(row.media) ?? row };
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
  const showIds = show ? idsFor(show) : { tmdbId: undefined, imdbId: undefined, tvdbId: undefined };
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

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

function rowsFromCsv(value: string): UnknownRecord[] {
  const lines = value.replace(/\r/g, '').split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines
    .slice(1)
    .map((line) =>
      Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? ''])),
    );
}

export function parseTraktArchive(bytes: Uint8Array): ParsedTraktExport {
  const archive = unzipSync(bytes);
  const files = Object.keys(archive).filter((name) => /\.(json|csv)$/i.test(name));
  const warnings: string[] = [];
  const items: NormalizedImportItem[] = [];

  for (const filename of files) {
    if (!/(history|rating|watchlist|watch_list)/i.test(filename)) continue;
    try {
      const contents = strFromU8(archive[filename]);
      const rows = filename.toLowerCase().endsWith('.csv')
        ? rowsFromCsv(contents)
        : rowsFromJson(JSON.parse(contents));
      const before = items.length;
      for (const row of rows) {
        const item = normalize(filename, row);
        if (item) items.push(item);
      }
      if (rows.length > 0 && items.length === before) {
        warnings.push(`${filename}: no supported history, rating, or watchlist records found.`);
      }
    } catch (error) {
      warnings.push(
        `${filename}: ${error instanceof Error ? error.message : 'could not read this file'}`,
      );
    }
  }

  if (!files.length) throw new Error('This ZIP does not contain any JSON or CSV export files.');
  if (!items.length)
    throw new Error('No supported Trakt history, rating, or watchlist records found.');
  return {
    items,
    files,
    warnings,
    counts: {
      watch: items.filter((item) => item.action === 'watch').length,
      rating: items.filter((item) => item.action === 'rating').length,
      watchlist: items.filter((item) => item.action === 'watchlist').length,
    },
  };
}

export async function parseTraktExport(file: File) {
  if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Choose a Trakt ZIP export.');
  return parseTraktArchive(new Uint8Array(await file.arrayBuffer()));
}

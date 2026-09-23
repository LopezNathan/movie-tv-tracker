import type { NormalizedImportItem } from '../../shared/types';

type UnknownRecord = Record<string, unknown>;

export type PlexWebhook = {
  event?: string;
  user?: boolean;
  Account?: UnknownRecord;
  Server?: UnknownRecord;
  Metadata?: UnknownRecord;
};

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function guidIds(metadata: UnknownRecord) {
  const values = Array.isArray(metadata.Guid)
    ? metadata.Guid.flatMap((value) => {
        if (typeof value === 'string') return [value];
        if (value && typeof value === 'object') return [text((value as UnknownRecord).id)];
        return [];
      })
    : [];
  const legacy = text(metadata.guid);
  if (legacy) values.push(legacy);
  const find = (scheme: string) => {
    const value = values.find((candidate) => candidate?.startsWith(`${scheme}://`));
    return value?.slice(scheme.length + 3).split(/[/?]/)[0];
  };
  return {
    tmdbId: integer(find('tmdb')),
    imdbId: find('imdb'),
    tvdbId: integer(find('tvdb')),
  };
}

function eventTime(metadata: UnknownRecord, now: Date) {
  const seconds = integer(metadata.lastViewedAt);
  return seconds && seconds > 0 ? new Date(seconds * 1_000).toISOString() : now.toISOString();
}

export function plexAccountTitle(payload: PlexWebhook) {
  return text(payload.Account?.title);
}

export function normalizePlexScrobble(
  payload: PlexWebhook,
  now = new Date(),
): NormalizedImportItem | null {
  if (payload.event !== 'media.scrobble' || !payload.Metadata) return null;
  const metadata = payload.Metadata;
  const type = text(metadata.type);
  if (type !== 'movie' && type !== 'episode') return null;

  const title = text(metadata.title);
  const ratingKey = text(metadata.ratingKey);
  const server = text(payload.Server?.uuid) ?? 'unknown-server';
  if (!title || !ratingKey) return null;

  const watchedAt = eventTime(metadata, now);
  const eventSequence = integer(metadata.lastViewedAt) ?? integer(metadata.viewCount);
  // Modern Plex payloads include lastViewedAt. The minute bucket is a safe
  // fallback that deduplicates immediate retries without collapsing rewatches.
  const sequence = eventSequence ?? Math.floor(now.getTime() / 60_000);
  const ids = guidIds(metadata);
  const seasonNumber = type === 'episode' ? integer(metadata.parentIndex) : undefined;
  const episodeNumber = type === 'episode' ? integer(metadata.index) : undefined;

  return {
    action: 'watch',
    kind: type,
    title,
    year: integer(metadata.year),
    ...ids,
    showTitle: type === 'episode' ? text(metadata.grandparentTitle) : undefined,
    showYear: type === 'episode' ? integer(metadata.grandparentYear) : undefined,
    seasonNumber,
    episodeNumber,
    watchedAt,
    sourceEventId: `${server}:${ratingKey}:${sequence}`,
    fingerprint: ['plex', server, ratingKey, sequence].join('|'),
  };
}

export async function parsePlexWebhook(request: Request): Promise<PlexWebhook> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (Number.isFinite(length) && length > 1_000_000)
    throw new Error('Webhook payload is too large.');
  const contentType = request.headers.get('Content-Type') ?? '';
  let value: unknown;
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const payload = form.get('payload');
    if (typeof payload !== 'string') throw new Error('Plex payload field is missing.');
    value = JSON.parse(payload);
  } else if (contentType.includes('application/json')) {
    value = await request.json();
  } else {
    throw new Error('Plex webhooks must use multipart form data.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Plex payload is invalid.');
  }
  return value as PlexWebhook;
}

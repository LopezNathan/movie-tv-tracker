import type { MediaRecord } from '../../shared/types';

export const imageBase = 'https://image.tmdb.org/t/p/w500';
export const backdropBase = 'https://image.tmdb.org/t/p/w1280';

export function imageUrl(path: string | null, backdrop = false) {
  return path ? `${backdrop ? backdropBase : imageBase}${path}` : null;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function episodeCode(item: Pick<MediaRecord, 'seasonNumber' | 'episodeNumber'>) {
  return `S${String(item.seasonNumber ?? 0).padStart(2, '0')}E${String(item.episodeNumber ?? 0).padStart(2, '0')}`;
}

export function toLocalInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

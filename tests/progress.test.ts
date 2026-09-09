import type { MediaRecord } from '../shared/types';
import { calculateProgress } from '../worker/lib/progress';
import { describe, expect, it } from 'vitest';

function episode(
  id: string,
  seasonNumber: number,
  episodeNumber: number,
  airDate: string | null,
  seriesId = 'show-1',
): MediaRecord {
  return {
    id,
    kind: 'episode',
    tmdbId: Number(id.replace(/\D/g, '')),
    title: id,
    originalTitle: null,
    releaseYear: 2025,
    overview: null,
    posterPath: null,
    backdropPath: null,
    status: null,
    runtime: 45,
    seriesId,
    seasonNumber,
    episodeNumber,
    airDate,
    metadataUpdatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('calculateProgress', () => {
  it('counts only aired episodes and chooses the first unwatched episode', () => {
    const episodes = [
      episode('episode-3', 2, 1, '2026-01-03'),
      episode('episode-1', 1, 1, '2026-01-01'),
      episode('episode-2', 1, 2, '2026-01-02'),
      episode('episode-4', 2, 2, '2026-01-05'),
      episode('episode-5', 2, 3, null),
      episode('other-1', 1, 1, '2026-01-01', 'other-show'),
    ];
    const progress = calculateProgress(
      'show-1',
      episodes,
      ['episode-1', 'episode-1', 'episode-3'],
      '2026-01-03',
    );
    expect(progress).toMatchObject({ watched: 2, aired: 3, percentage: 67 });
    expect(progress.nextEpisode?.id).toBe('episode-2');
    expect(progress.seasons).toEqual([
      { seasonNumber: 1, watched: 1, aired: 2 },
      { seasonNumber: 2, watched: 1, aired: 1 },
    ]);
  });

  it('returns zero progress when nothing has aired', () => {
    const progress = calculateProgress('show-1', [episode('episode-1', 1, 1, null)], []);
    expect(progress).toMatchObject({ watched: 0, aired: 0, percentage: 0, nextEpisode: null });
  });
});

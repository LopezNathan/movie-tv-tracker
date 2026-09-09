import { strToU8, zipSync } from 'fflate';
import { parseTraktArchive } from '../src/lib/trakt-import';
import { describe, expect, it } from 'vitest';

function json(value: unknown) {
  return strToU8(JSON.stringify(value));
}

describe('Trakt export parsing', () => {
  it('normalizes history, ratings, and watchlist while preserving rewatches', () => {
    const archive = zipSync({
      'history/episodes.json': json([
        {
          id: 100,
          watched_at: '2026-01-01T01:00:00Z',
          episode: { season: 1, number: 2, title: 'Second', ids: { tmdb: 22 } },
          show: { title: 'Example Show', year: 2025, ids: { tmdb: 10, tvdb: 20 } },
        },
        {
          id: 101,
          watched_at: '2026-02-01T01:00:00Z',
          episode: { season: 1, number: 2, title: 'Second', ids: { tmdb: 22 } },
          show: { title: 'Example Show', year: 2025, ids: { tmdb: 10, tvdb: 20 } },
        },
      ]),
      'ratings/movies.json': json([
        {
          rated_at: '2026-03-01T00:00:00Z',
          rating: 9,
          movie: { title: 'Film', ids: { imdb: 'tt1' } },
        },
      ]),
      'watchlist/shows.json': json([
        {
          listed_at: '2026-04-01T00:00:00Z',
          show: { title: 'Later', year: 2024, ids: { tmdb: 44 } },
        },
      ]),
      'comments.json': json([{ comment: 'ignored social data' }]),
    });

    const parsed = parseTraktArchive(archive);
    expect(parsed.counts).toEqual({ watch: 2, rating: 1, watchlist: 1 });
    expect(parsed.items).toHaveLength(4);
    expect(parsed.items[0]).toMatchObject({
      action: 'watch',
      kind: 'episode',
      showTmdbId: 10,
      seasonNumber: 1,
      episodeNumber: 2,
      sourceEventId: '100',
    });
    expect(parsed.items[0].fingerprint).not.toBe(parsed.items[1].fingerprint);
  });

  it('rejects archives without supported records', () => {
    expect(() => parseTraktArchive(zipSync({ 'comments.json': json([]) }))).toThrow(
      /No supported Trakt/,
    );
  });
});

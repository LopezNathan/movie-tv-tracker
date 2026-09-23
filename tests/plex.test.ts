import { describe, expect, it } from 'vitest';
import { normalizePlexScrobble, parsePlexWebhook } from '../worker/lib/plex';

describe('Plex webhook parsing', () => {
  it('normalizes a movie scrobble with external IDs and a stable event key', () => {
    const item = normalizePlexScrobble({
      event: 'media.scrobble',
      Account: { title: 'Nathan' },
      Server: { uuid: 'server-1' },
      Metadata: {
        type: 'movie',
        ratingKey: '42',
        title: 'Arrival',
        year: 2016,
        lastViewedAt: 1_800_000_000,
        Guid: [{ id: 'tmdb://329865' }, { id: 'imdb://tt2543164' }],
      },
    });

    expect(item).toMatchObject({
      action: 'watch',
      kind: 'movie',
      title: 'Arrival',
      year: 2016,
      tmdbId: 329865,
      imdbId: 'tt2543164',
      watchedAt: '2027-01-15T08:00:00.000Z',
      sourceEventId: 'server-1:42:1800000000',
    });
  });

  it('keeps the show coordinates needed to resolve an episode', () => {
    const item = normalizePlexScrobble({
      event: 'media.scrobble',
      Server: { uuid: 'server-1' },
      Metadata: {
        type: 'episode',
        ratingKey: '99',
        title: 'The We We Are',
        grandparentTitle: 'Severance',
        parentIndex: 1,
        index: 9,
        viewCount: 2,
        Guid: [{ id: 'tvdb://8179942' }],
      },
    });

    expect(item).toMatchObject({
      kind: 'episode',
      showTitle: 'Severance',
      seasonNumber: 1,
      episodeNumber: 9,
      tvdbId: 8179942,
      sourceEventId: 'server-1:99:2',
    });
  });

  it('reads the multipart format sent by Plex', async () => {
    const form = new FormData();
    form.set('payload', JSON.stringify({ event: 'media.pause' }));
    await expect(
      parsePlexWebhook(new Request('https://scene.test/webhook', { method: 'POST', body: form })),
    ).resolves.toEqual({ event: 'media.pause' });
  });
});

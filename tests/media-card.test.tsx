import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MediaRecord, WatchEventWithShow } from '../shared/types';
import { MediaCard } from '../src/components/media-card';
import { WatchHistoryCard } from '../src/components/watch-history-card';

afterEach(cleanup);

function record(overrides: Partial<MediaRecord>): MediaRecord {
  return {
    id: 'ep-1',
    kind: 'episode',
    tmdbId: 11,
    title: 'Pilot',
    originalTitle: null,
    releaseYear: 2020,
    overview: null,
    posterPath: null,
    backdropPath: null,
    status: null,
    runtime: 45,
    seriesId: 'show-1',
    seasonNumber: 2,
    episodeNumber: 3,
    airDate: '2020-01-01',
    metadataUpdatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('MediaCard', () => {
  it('labels episodes with their season and episode code', () => {
    render(
      <MemoryRouter>
        <MediaCard item={record({})} />
      </MemoryRouter>,
    );
    expect(screen.getByText('S02E03')).toBeInTheDocument();
  });

  it('links to an overridden destination', () => {
    render(
      <MemoryRouter>
        <MediaCard item={record({})} to="/media/show/10" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/media/show/10');
  });

  it('runs onRemove without following the card link', async () => {
    const onRemove = vi.fn();
    render(
      <MemoryRouter>
        <MediaCard item={record({})} onRemove={onRemove} removeLabel="Remove it" />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove it' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('WatchHistoryCard', () => {
  it('shows the episode code beside the episode title', () => {
    const event = {
      id: 'ev-1',
      userId: 'u',
      mediaId: 'ep-1',
      watchedAt: '2026-01-01T00:00:00.000Z',
      media: record({}),
      show: record({ id: 'show-1', kind: 'show', title: 'Show', tmdbId: 10 }),
    } as unknown as WatchEventWithShow;
    render(
      <MemoryRouter>
        <WatchHistoryCard event={event} />
      </MemoryRouter>,
    );
    expect(screen.getByText('S02E03 · Pilot')).toBeInTheDocument();
  });
});

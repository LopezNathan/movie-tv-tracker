import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, Check, Eye, EyeOff, Star } from 'lucide-react';
import { useParams } from 'react-router-dom';
import type { MediaRecord } from '../../shared/types';
import { ErrorState, LoadingState } from '../components/async-state';
import { WatchButton } from '../components/watch-button';
import { api, json, queries } from '../lib/api';
import { episodeCode, imageUrl } from '../lib/format';

function groupEpisodes(episodes: MediaRecord[]) {
  const groups = new Map<number, MediaRecord[]>();
  for (const episode of episodes) {
    const season = episode.seasonNumber ?? 0;
    groups.set(season, [...(groups.get(season) ?? []), episode]);
  }
  return [...groups.entries()];
}

export function MediaDetailPage() {
  const { kind = '', id = '' } = useParams();
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['media', kind, id],
    queryFn: () => queries.media(kind, id),
    enabled: (kind === 'movie' || kind === 'show') && Boolean(id),
  });
  const refreshAll = () => client.invalidateQueries();
  const watch = useMutation({
    mutationFn: ({ mediaId, watchedAt }: { mediaId: string; watchedAt: string }) =>
      api('/api/watch-events', json('POST', { mediaId, watchedAt })),
    onSuccess: refreshAll,
  });
  const undo = useMutation({
    mutationFn: (eventId: string) => api(`/api/watch-events/${eventId}`, { method: 'DELETE' }),
    onSuccess: refreshAll,
  });
  const watchlist = useMutation({
    mutationFn: ({ mediaId, add }: { mediaId: string; add: boolean }) =>
      api(`/api/watchlist/${mediaId}`, add ? json('PUT', {}) : { method: 'DELETE' }),
    onSuccess: refreshAll,
  });
  const rate = useMutation({
    mutationFn: ({ mediaId, rating }: { mediaId: string; rating: number | null }) =>
      api(
        `/api/ratings/${mediaId}`,
        rating === null ? { method: 'DELETE' } : json('PUT', { rating }),
      ),
    onSuccess: refreshAll,
  });
  const bulk = useMutation({
    mutationFn: (body: { showId: string; seasonNumber?: number; throughEpisodeId?: string }) =>
      api<{ created: number }>('/api/bulk-watch', json('POST', body)),
    onSuccess: refreshAll,
  });
  const upNextVisibility = useMutation({
    mutationFn: ({ mediaId, hidden }: { mediaId: string; hidden: boolean }) =>
      api(`/api/up-next/${mediaId}`, json('PUT', { hidden })),
    onSuccess: refreshAll,
  });

  if (detail.isLoading) return <LoadingState label="Opening the title and episode guide…" />;
  if (detail.error) return <ErrorState error={detail.error} retry={() => detail.refetch()} />;
  if (!detail.data) return <ErrorState error={new Error('This title could not be loaded.')} />;

  const data = detail.data;
  const backdrop = imageUrl(data.media.backdropPath, true);
  const poster = imageUrl(data.media.posterPath);
  const bySeason = groupEpisodes(data.episodes);
  const latestEvent = (mediaId: string) =>
    data.watchEvents.find((event) => event.mediaId === mediaId);
  const actionError =
    watch.error ??
    undo.error ??
    watchlist.error ??
    rate.error ??
    bulk.error ??
    upNextVisibility.error;

  return (
    <div className="detail-page">
      {backdrop && (
        <div className="detail-backdrop" style={{ backgroundImage: `url(${backdrop})` }} />
      )}
      <section
        className={data.media.kind === 'show' ? 'detail-hero show-detail-hero' : 'detail-hero'}
      >
        <div className="detail-poster">
          {poster ? (
            <img src={poster} alt={`${data.media.title} poster`} />
          ) : (
            <span>No poster</span>
          )}
        </div>
        <div className="detail-copy">
          <p className="eyebrow">
            {data.media.kind === 'show' ? 'Television series' : 'Motion picture'}
          </p>
          <h1>{data.media.title}</h1>
          <p className="detail-meta">
            {data.media.releaseYear ?? 'Year unknown'}
            {data.media.runtime ? ` · ${data.media.runtime} min` : ''}
            {data.media.status ? ` · ${data.media.status}` : ''}
          </p>
          <p className="lede">{data.media.overview || 'No synopsis is available yet.'}</p>
          <div className="action-row">
            {data.media.kind === 'movie' && (
              <WatchButton
                watched={Boolean(latestEvent(data.media.id))}
                pending={watch.isPending || undo.isPending}
                onWatch={(watchedAt) => watch.mutate({ mediaId: data.media.id, watchedAt })}
                onUndo={() => {
                  const event = latestEvent(data.media.id);
                  if (event) undo.mutate(event.id);
                }}
              />
            )}
            <button
              className={data.inWatchlist ? 'button secondary selected' : 'button secondary'}
              onClick={() => watchlist.mutate({ mediaId: data.media.id, add: !data.inWatchlist })}
              disabled={watchlist.isPending}
            >
              {data.inWatchlist ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
              {data.inWatchlist ? 'In watchlist' : 'Add to watchlist'}
            </button>
            {data.media.kind === 'show' && (
              <button
                className="button ghost"
                onClick={() =>
                  upNextVisibility.mutate({
                    mediaId: data.media.id,
                    hidden: !data.hiddenFromUpNext,
                  })
                }
                disabled={upNextVisibility.isPending}
                aria-pressed={data.hiddenFromUpNext}
              >
                {data.hiddenFromUpNext ? <Eye size={17} /> : <EyeOff size={17} />}
                {data.hiddenFromUpNext ? 'Show in Up Next' : 'Hide from Up Next'}
              </button>
            )}
          </div>
        </div>
      </section>

      {actionError && <ErrorState error={actionError} />}

      <section className="rating-panel">
        <div>
          <p className="eyebrow">Your score</p>
          <h2>
            <Star size={21} fill="currentColor" /> {data.rating ? `${data.rating}/10` : 'Not rated'}
          </h2>
        </div>
        <div className="rating-scale" aria-label="Rate from one to ten">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <button
              key={value}
              className={data.rating === value ? 'selected' : ''}
              aria-label={`Rate ${value} out of 10`}
              aria-pressed={data.rating === value}
              onClick={() =>
                rate.mutate({
                  mediaId: data.media.id,
                  rating: data.rating === value ? null : value,
                })
              }
            >
              {value}
            </button>
          ))}
        </div>
      </section>

      {data.progress && (
        <section className="progress-panel">
          <div>
            <p className="eyebrow">Series progress</p>
            <h2>{data.progress.percentage}% complete</h2>
            <p>
              {data.progress.watched} of {data.progress.aired} aired episodes watched
            </p>
          </div>
          <div
            className="progress-ring"
            style={{ '--progress': `${data.progress.percentage}%` } as React.CSSProperties}
          >
            <strong>{data.progress.percentage}%</strong>
          </div>
        </section>
      )}

      {data.media.kind === 'show' && (
        <section className="season-stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Episode guide</p>
              <h2>Seasons</h2>
            </div>
          </div>
          {bySeason.map(([seasonNumber, episodes]) => {
            const seasonProgress = data.progress?.seasons.find(
              (season) => season.seasonNumber === seasonNumber,
            );
            return (
              <details className="season-panel" key={seasonNumber}>
                <summary>
                  <div>
                    <strong>Season {seasonNumber}</strong>
                    <span>
                      {seasonProgress?.watched ?? 0} / {seasonProgress?.aired ?? 0} aired watched
                    </span>
                  </div>
                  <button
                    className="button subtle compact"
                    onClick={(event) => {
                      event.preventDefault();
                      if (
                        window.confirm(
                          `Mark every aired episode in season ${seasonNumber} watched?`,
                        )
                      ) {
                        bulk.mutate({ showId: data.media.id, seasonNumber });
                      }
                    }}
                  >
                    Mark season watched
                  </button>
                </summary>
                <div className="episode-list">
                  {episodes.map((episode) => {
                    const event = latestEvent(episode.id);
                    return (
                      <article
                        className={event ? 'episode-row watched' : 'episode-row'}
                        key={episode.id}
                      >
                        <div className="episode-number">{episode.episodeNumber}</div>
                        <div className="grow">
                          <span className="meta">
                            {episodeCode(episode)}
                            {episode.airDate ? ` · ${episode.airDate}` : ''}
                          </span>
                          <h3>{episode.title}</h3>
                          {episode.overview && <p>{episode.overview}</p>}
                        </div>
                        {event && <Check className="watched-check" aria-label="Watched" />}
                        <WatchButton
                          watched={Boolean(event)}
                          pending={watch.isPending || undo.isPending}
                          onWatch={(watchedAt) => watch.mutate({ mediaId: episode.id, watchedAt })}
                          onUndo={() => event && undo.mutate(event.id)}
                        />
                        <button
                          className="button ghost compact"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Mark all aired episodes through ${episodeCode(episode)} watched?`,
                              )
                            ) {
                              bulk.mutate({ showId: data.media.id, throughEpisodeId: episode.id });
                            }
                          }}
                        >
                          Through here
                        </button>
                      </article>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}

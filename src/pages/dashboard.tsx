import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ImageOff, Play, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { MediaCard } from '../components/media-card';
import { WatchHistoryCard } from '../components/watch-history-card';
import { api, json, queries } from '../lib/api';
import { episodeCode, imageUrl, toLocalInputValue } from '../lib/format';

export function DashboardPage() {
  const client = useQueryClient();
  const [watchingEpisode, setWatchingEpisode] = useState<{
    id: string;
    title: string;
    showTitle: string;
  } | null>(null);
  const [watchedAt, setWatchedAt] = useState(toLocalInputValue());
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: queries.dashboard });
  const hideFromUpNext = useMutation({
    mutationFn: (mediaId: string) => api(`/api/up-next/${mediaId}`, json('PUT', { hidden: true })),
    onSuccess: () => client.invalidateQueries(),
  });
  const watch = useMutation({
    mutationFn: ({ mediaId, watchedAt }: { mediaId: string; watchedAt: string }) =>
      api('/api/watch-events', json('POST', { mediaId, watchedAt })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['dashboard'] });
      setWatchingEpisode(null);
    },
  });
  if (dashboard.isLoading) return <LoadingState />;
  if (dashboard.error) {
    return <ErrorState error={dashboard.error} retry={() => dashboard.refetch()} />;
  }
  const data = dashboard.data!;
  const empty = data.stats.watchEvents === 0 && data.watchlist.length === 0;

  return (
    <div className="page-stack wide">
      {empty && (
        <header className="hero-copy">
          <p className="hero-statement">
            Search for a movie or show, then start building a watch history that stays yours.
          </p>
          <div className="hero-footer simple">
            <Link className="button primary" to="/search">
              Find a title <ArrowRight size={18} />
            </Link>
          </div>
        </header>
      )}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Continue</p>
            <h2>Up next</h2>
          </div>
        </div>
        {data.upNext.length ? (
          <div className="poster-grid up-next-grid">
            {data.upNext.map(({ show, progress }) => {
              const image = imageUrl(show.posterPath);
              const nextEpisode = progress.nextEpisode!;
              const isWatching = watchingEpisode?.id === nextEpisode.id;
              return (
                <div
                  className={
                    isWatching
                      ? 'media-card up-next-card up-next-card-open'
                      : 'media-card up-next-card'
                  }
                  key={show.id}
                >
                  <div className="poster-wrap">
                    <Link
                      to={`/media/show/${show.tmdbId}`}
                      className="up-next-poster-link"
                      aria-label={`Open ${show.title}`}
                    >
                      {image ? (
                        <img src={image} alt="" loading="lazy" />
                      ) : (
                        <ImageOff aria-hidden="true" />
                      )}
                      <span className="kind-chip" key={nextEpisode.id}>
                        {episodeCode(nextEpisode)}
                      </span>
                    </Link>
                    <button
                      className="poster-card-action up-next-watch"
                      type="button"
                      aria-label={`Log ${nextEpisode.title} as watched`}
                      title="Log watch time"
                      onClick={() => {
                        setWatchedAt(toLocalInputValue());
                        setWatchingEpisode({
                          id: nextEpisode.id,
                          title: nextEpisode.title,
                          showTitle: show.title,
                        });
                      }}
                    >
                      <Play fill="currentColor" size={16} aria-hidden="true" />
                    </button>
                    <button
                      className="up-next-hide"
                      type="button"
                      aria-label={`Hide ${show.title} from Up Next`}
                      title="Hide from Up Next"
                      disabled={hideFromUpNext.isPending}
                      onClick={() => hideFromUpNext.mutate(show.id)}
                    >
                      <X size={17} aria-hidden="true" />
                      <span>Hide</span>
                    </button>
                    {isWatching && (
                      <div className="up-next-watch-popup">
                        <form
                          className="watch-menu"
                          role="dialog"
                          aria-labelledby={`watch-popup-${nextEpisode.id}`}
                          onSubmit={(event) => {
                            event.preventDefault();
                            watch.mutate({
                              mediaId: watchingEpisode.id,
                              watchedAt: new Date(watchedAt).toISOString(),
                            });
                          }}
                        >
                          <p className="up-next-watch-title" id={`watch-popup-${nextEpisode.id}`}>
                            {watchingEpisode.showTitle} · {watchingEpisode.title}
                          </p>
                          <label>
                            Watched at
                            <input
                              type="datetime-local"
                              value={watchedAt}
                              onChange={(event) => setWatchedAt(event.target.value)}
                            />
                          </label>
                          <div className="up-next-watch-actions">
                            <button
                              className="button ghost compact"
                              type="button"
                              onClick={() => setWatchingEpisode(null)}
                            >
                              Cancel
                            </button>
                            <button
                              className="button primary"
                              type="submit"
                              disabled={watch.isPending}
                            >
                              Log this time
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                  <Link to={`/media/show/${show.tmdbId}`} className="up-next-card-link">
                    <div className="media-card-copy up-next-card-copy">
                      <strong>{show.title}</strong>
                      <p>{nextEpisode.title}</p>
                      <span>{progress.percentage}% watched</span>
                      <div className="progress-track">
                        <span style={{ width: `${progress.percentage}%` }} />
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nothing queued">
            Watch an episode and the next aired one will appear here.
          </EmptyState>
        )}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The log</p>
            <h2>Recently watched</h2>
          </div>
          <Link to="/library">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {data.recent.length ? (
          <div className="poster-grid recent-grid">
            {data.recent.slice(0, 6).map((event) => (
              <WatchHistoryCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState title="No history yet">
            Your watches will appear here with their exact timestamps.
          </EmptyState>
        )}
      </section>

      {data.watchlist.length > 0 && (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Saved</p>
              <h2>Watchlist</h2>
            </div>
            <Link to="/watchlist">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <div className="poster-grid">
            {data.watchlist.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

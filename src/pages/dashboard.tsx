import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ImageOff, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { MediaCard } from '../components/media-card';
import { WatchHistoryCard } from '../components/watch-history-card';
import { queries } from '../lib/api';
import { episodeCode, imageUrl } from '../lib/format';

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: queries.dashboard });
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
              return (
                <Link
                  to={`/media/show/${show.tmdbId}`}
                  className="media-card up-next-card"
                  key={show.id}
                >
                  <div className="poster-wrap">
                    {image ? (
                      <img src={image} alt="" loading="lazy" />
                    ) : (
                      <ImageOff aria-hidden="true" />
                    )}
                    <span className="kind-chip">{episodeCode(progress.nextEpisode!)}</span>
                    <span className="poster-card-action" aria-hidden="true">
                      <Play fill="currentColor" size={16} />
                    </span>
                  </div>
                  <div className="media-card-copy up-next-card-copy">
                    <strong>{show.title}</strong>
                    <p>{progress.nextEpisode!.title}</p>
                    <span>{progress.percentage}% watched</span>
                    <div className="progress-track">
                      <span style={{ width: `${progress.percentage}%` }} />
                    </div>
                  </div>
                </Link>
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

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Film, ImageOff, Play, Tv, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { MediaCard } from '../components/media-card';
import { queries } from '../lib/api';
import { episodeCode, formatDate, imageUrl } from '../lib/format';

function artwork(
  item: { backdropPath: string | null; posterPath: string | null },
  fallback?: { backdropPath: string | null; posterPath: string | null },
) {
  const backdrop = fallback?.backdropPath ?? item.backdropPath;
  return backdrop ? imageUrl(backdrop, true) : imageUrl(fallback?.posterPath ?? item.posterPath);
}

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

      {!empty && (
        <section className="stats-grid" aria-label="Viewing totals">
          <div className="stat-card">
            <Film />
            <strong>{data.stats.watchedMovies}</strong>
            <span>movies watched</span>
          </div>
          <div className="stat-card">
            <Tv />
            <strong>{data.stats.watchedEpisodes}</strong>
            <span>episodes watched</span>
          </div>
          <div className="stat-card accent">
            <Waves />
            <strong>{data.stats.watchEvents}</strong>
            <span>total plays</span>
          </div>
        </section>
      )}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Continue</p>
            <h2>Up next</h2>
          </div>
        </div>
        {data.upNext.length ? (
          <div className="up-next-grid">
            {data.upNext.map(({ show, progress }) => {
              const image = artwork(show);
              return (
                <Link to={`/media/show/${show.tmdbId}`} className="up-next-card" key={show.id}>
                  <div className="scene-card-art">
                    {image ? (
                      <img src={image} alt="" loading="lazy" />
                    ) : (
                      <ImageOff aria-hidden="true" />
                    )}
                  </div>
                  <div className="scene-card-shade" />
                  <span className="scene-card-action" aria-hidden="true">
                    <Play fill="currentColor" size={16} />
                  </span>
                  <div className="scene-card-copy">
                    <span className="scene-card-meta">
                      {episodeCode(progress.nextEpisode!)} · {progress.percentage}% watched
                    </span>
                    <h3>{show.title}</h3>
                    <p>{progress.nextEpisode!.title}</p>
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
          <Link to="/history">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {data.recent.length ? (
          <div className="recent-grid">
            {data.recent.slice(0, 6).map((event) => {
              const isEpisode = event.media.kind === 'episode';
              const title = isEpisode && event.show ? event.show.title : event.media.title;
              const target =
                isEpisode && event.show
                  ? `/media/show/${event.show.tmdbId}`
                  : isEpisode
                    ? '/history'
                    : `/media/${event.media.kind}/${event.media.tmdbId}`;
              const image = artwork(event.media, event.show);
              return (
                <Link className="recent-card" to={target} key={event.id}>
                  <div className="scene-card-art">
                    {image ? (
                      <img src={image} alt="" loading="lazy" />
                    ) : (
                      <ImageOff aria-hidden="true" />
                    )}
                  </div>
                  <div className="scene-card-shade" />
                  <div className="scene-card-copy">
                    <span className="scene-card-meta">
                      {isEpisode ? episodeCode(event.media) : 'Movie'} ·{' '}
                      {formatDate(event.watchedAt)}
                    </span>
                    <h3>{title}</h3>
                    {isEpisode && <p>{event.media.title}</p>}
                  </div>
                </Link>
              );
            })}
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

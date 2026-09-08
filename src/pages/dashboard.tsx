import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Film, Play, Tv, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { MediaCard } from '../components/media-card';
import { queries } from '../lib/api';
import { episodeCode, formatDate } from '../lib/format';

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
      <header className="hero-copy">
        <p className="eyebrow">Tonight, remembered</p>
        <h1>{empty ? 'Start your first scene.' : 'Welcome back.'}</h1>
        <p className="lede">
          {empty
            ? 'Search for a movie or show, then start building a watch history that stays yours.'
            : 'Your next episodes, recent watches, and shortlist—without the noise.'}
        </p>
        {empty && (
          <Link className="button primary" to="/search">
            Find a title <ArrowRight size={18} />
          </Link>
        )}
      </header>

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
            {data.upNext.map(({ show, progress }) => (
              <Link to={`/media/show/${show.tmdbId}`} className="up-next-card" key={show.id}>
                <div className="play-orb">
                  <Play fill="currentColor" size={18} />
                </div>
                <div className="grow">
                  <span className="meta">{episodeCode(progress.nextEpisode!)}</span>
                  <h3>{show.title}</h3>
                  <p>{progress.nextEpisode!.title}</p>
                  <div className="progress-track">
                    <span style={{ width: `${progress.percentage}%` }} />
                  </div>
                </div>
                <strong>{progress.percentage}%</strong>
              </Link>
            ))}
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
          <div className="event-list">
            {data.recent.slice(0, 6).map((event) => (
              <div className="event-row" key={event.id}>
                <span className="event-kind">
                  {event.media.kind === 'episode' ? episodeCode(event.media) : event.media.kind}
                </span>
                <div>
                  <strong>{event.media.title}</strong>
                  <span>{formatDate(event.watchedAt)}</span>
                </div>
              </div>
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

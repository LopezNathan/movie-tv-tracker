import { ImageOff, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { WatchEventWithShow } from '../../shared/types';
import { episodeCode, formatDate, imageUrl } from '../lib/format';

type WatchHistoryCardProps = {
  event: WatchEventWithShow;
  onUndo?: (id: string) => void;
  undoDisabled?: boolean;
};

export function WatchHistoryCard({ event, onUndo, undoDisabled }: WatchHistoryCardProps) {
  const { media, show } = event;
  const isEpisode = media.kind === 'episode';
  const title = isEpisode && show ? show.title : media.title;
  const poster = imageUrl(event.seasonPosterPath ?? show?.posterPath ?? media.posterPath);
  const target = isEpisode
    ? show
      ? `/media/show/${show.tmdbId}`
      : null
    : `/media/${media.kind}/${media.tmdbId}`;
  const content = (
    <>
      <div className="poster-wrap">
        {poster ? <img src={poster} alt="" loading="lazy" /> : <ImageOff aria-hidden="true" />}
        <span className="kind-chip">{isEpisode ? episodeCode(media) : media.kind}</span>
      </div>
      <div className="media-card-copy watch-history-card-copy">
        <strong>{title}</strong>
        {isEpisode && show && <span>{media.title}</span>}
        <span>{formatDate(event.watchedAt)}</span>
      </div>
    </>
  );

  return (
    <article
      className={
        onUndo ? 'media-card watch-history-card has-undo' : 'media-card watch-history-card'
      }
    >
      {target ? (
        <Link to={target} className="watch-history-card-link">
          {content}
        </Link>
      ) : (
        <div className="watch-history-card-link">{content}</div>
      )}
      {onUndo && (
        <button
          className="icon-button watch-history-undo"
          aria-label={`Undo watch of ${media.title}`}
          title="Undo this watch"
          onClick={() => onUndo(event.id)}
          disabled={undoDisabled}
        >
          <RotateCcw size={15} />
        </button>
      )}
    </article>
  );
}

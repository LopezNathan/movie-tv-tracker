import { ImageOff, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { WatchEventRecord } from '../../shared/types';
import { episodeCode, formatDate, imageUrl } from '../lib/format';

type WatchHistoryCardProps = {
  event: WatchEventRecord;
  onUndo?: (id: string) => void;
  undoDisabled?: boolean;
};

export function WatchHistoryCard({ event, onUndo, undoDisabled }: WatchHistoryCardProps) {
  const { media } = event;
  const poster = imageUrl(media.posterPath);
  const badge = media.kind === 'episode' ? episodeCode(media) : media.kind;
  const content = (
    <>
      <div className="poster-wrap">
        {poster ? <img src={poster} alt="" loading="lazy" /> : <ImageOff aria-hidden="true" />}
        <span className="kind-chip">{badge}</span>
      </div>
      <div className="watch-history-card-copy">
        <strong>{media.title}</strong>
        <span>{formatDate(event.watchedAt)}</span>
      </div>
    </>
  );

  return (
    <article className={onUndo ? 'watch-history-card has-undo' : 'watch-history-card'}>
      {media.kind === 'episode' ? (
        <div className="watch-history-card-link">{content}</div>
      ) : (
        <Link to={`/media/${media.kind}/${media.tmdbId}`} className="watch-history-card-link">
          {content}
        </Link>
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

import { ImageOff, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MediaRecord, SearchResult } from '../../shared/types';
import { episodeCode, imageUrl } from '../lib/format';

type CardMedia = MediaRecord | SearchResult;

export function MediaCard({
  item,
  note,
  to,
  onRemove,
  removeLabel,
  removeDisabled,
}: {
  item: CardMedia;
  note?: string;
  to?: string;
  onRemove?: () => void;
  removeLabel?: string;
  removeDisabled?: boolean;
}) {
  const poster = imageUrl(item.posterPath);
  return (
    <Link to={to ?? `/media/${item.kind}/${item.tmdbId}`} className="media-card">
      <div className="poster-wrap">
        {poster ? <img src={poster} alt="" loading="lazy" /> : <ImageOff aria-hidden="true" />}
        <span className="kind-chip">{item.kind === 'episode' ? episodeCode(item) : item.kind}</span>
        {onRemove && (
          <button
            type="button"
            className="media-card-remove"
            aria-label={removeLabel ?? `Remove ${item.title}`}
            title={removeLabel ?? 'Remove'}
            disabled={removeDisabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="media-card-copy">
        <strong>{item.title}</strong>
        <span>{note ?? item.releaseYear ?? 'Date unknown'}</span>
      </div>
    </Link>
  );
}

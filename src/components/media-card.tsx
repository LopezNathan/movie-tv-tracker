import { ImageOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MediaRecord, SearchResult } from '../../shared/types';
import { imageUrl } from '../lib/format';

type CardMedia = MediaRecord | SearchResult;

export function MediaCard({ item, note }: { item: CardMedia; note?: string }) {
  const poster = imageUrl(item.posterPath);
  return (
    <Link to={`/media/${item.kind}/${item.tmdbId}`} className="media-card">
      <div className="poster-wrap">
        {poster ? <img src={poster} alt="" loading="lazy" /> : <ImageOff aria-hidden="true" />}
        <span className="kind-chip">{item.kind}</span>
      </div>
      <div className="media-card-copy">
        <strong>{item.title}</strong>
        <span>{note ?? item.releaseYear ?? 'Date unknown'}</span>
      </div>
    </Link>
  );
}

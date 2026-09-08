import { Check, MoreHorizontal, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toLocalInputValue } from '../lib/format';

export function WatchButton({
  watched,
  pending,
  onWatch,
  onUndo,
}: {
  watched: boolean;
  pending: boolean;
  onWatch: (watchedAt: string) => void;
  onUndo: () => void;
}) {
  const [customTime, setCustomTime] = useState(toLocalInputValue());
  return (
    <div className="watch-control">
      <button
        className={watched ? 'button primary watched' : 'button primary'}
        onClick={() => onWatch(new Date().toISOString())}
        disabled={pending}
      >
        <Check size={18} /> {watched ? 'Watch again' : 'Watched now'}
      </button>
      <details>
        <summary className="icon-button" aria-label="More watch options" title="More options">
          <MoreHorizontal size={18} />
        </summary>
        <div className="watch-menu">
          <label>
            Watched at
            <input
              type="datetime-local"
              value={customTime}
              onChange={(event) => setCustomTime(event.target.value)}
            />
          </label>
          <button
            className="button secondary"
            onClick={(event) => {
              onWatch(new Date(customTime).toISOString());
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}
            disabled={pending}
          >
            Log this time
          </button>
          {watched && (
            <button
              className="button danger"
              onClick={(event) => {
                onUndo();
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
              disabled={pending}
            >
              <RotateCcw size={16} /> Undo latest
            </button>
          )}
        </div>
      </details>
    </div>
  );
}

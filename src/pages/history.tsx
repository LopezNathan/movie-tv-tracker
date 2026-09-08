import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { api, queries } from '../lib/api';
import { episodeCode, formatDate } from '../lib/format';

export function HistoryPage() {
  const client = useQueryClient();
  const history = useQuery({ queryKey: ['history'], queryFn: queries.history });
  const undo = useMutation({
    mutationFn: (id: string) => api(`/api/watch-events/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries(),
  });
  if (history.isLoading) return <LoadingState />;
  if (history.error) return <ErrorState error={history.error} retry={() => history.refetch()} />;

  return (
    <div className="page-stack wide">
      <header>
        <p className="eyebrow">The permanent log</p>
        <h1>Watch history.</h1>
        <p className="lede">Every viewing is independent, so rewatches stay part of the story.</p>
      </header>
      {undo.error && <ErrorState error={undo.error} />}
      {history.data!.items.length ? (
        <div className="event-list history-list">
          {history.data!.items.map((event) => (
            <article className="event-row" key={event.id}>
              <span className="event-kind">
                {event.media.kind === 'episode' ? episodeCode(event.media) : event.media.kind}
              </span>
              <div className="grow">
                <strong>{event.media.title}</strong>
                <span>{formatDate(event.watchedAt)}</span>
              </div>
              <button
                className="icon-button"
                aria-label={`Undo watch of ${event.media.title}`}
                title="Undo this watch"
                onClick={() => undo.mutate(event.id)}
                disabled={undo.isPending}
              >
                <RotateCcw size={17} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No watches logged">
          Open a movie or episode and mark it watched to begin your history.
        </EmptyState>
      )}
    </div>
  );
}

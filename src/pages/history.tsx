import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { WatchHistoryCard } from '../components/watch-history-card';
import { api, queries } from '../lib/api';

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
        <div className="poster-grid">
          {history.data!.items.map((event) => (
            <WatchHistoryCard
              key={event.id}
              event={event}
              onUndo={(id) => undo.mutate(id)}
              undoDisabled={undo.isPending}
            />
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

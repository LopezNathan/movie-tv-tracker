import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { WatchHistoryCard } from '../components/watch-history-card';
import { api, queries } from '../lib/api';

export function HistoryPage() {
  const client = useQueryClient();
  const history = useInfiniteQuery({
    queryKey: ['history'],
    queryFn: ({ pageParam }) => queries.history(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const undo = useMutation({
    mutationFn: (id: string) => api(`/api/watch-events/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries(),
  });
  if (history.isPending) return <LoadingState />;
  if (history.error) return <ErrorState error={history.error} retry={() => history.refetch()} />;

  return (
    <div className="page-stack wide">
      <header>
        <p className="eyebrow">The permanent log</p>
        <h1>Watch history.</h1>
        <p className="lede">Every viewing is independent, so rewatches stay part of the story.</p>
      </header>
      {undo.error && <ErrorState error={undo.error} />}
      {history.data!.pages[0]?.items.length ? (
        <>
          <div className="poster-grid history-grid">
            {history
              .data!.pages.flatMap((page) => page.items)
              .map((event) => (
                <WatchHistoryCard
                  key={event.id}
                  event={event}
                  onUndo={(id) => undo.mutate(id)}
                  undoDisabled={undo.isPending}
                />
              ))}
          </div>
          {history.hasNextPage && (
            <div className="library-more">
              <button
                className="button subtle"
                type="button"
                disabled={history.isFetchingNextPage}
                onClick={() => history.fetchNextPage()}
              >
                {history.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState title="No watches logged">
          Open a movie or episode and mark it watched to begin your history.
        </EmptyState>
      )}
    </div>
  );
}

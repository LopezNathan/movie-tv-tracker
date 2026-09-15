import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { MediaCard } from '../components/media-card';
import { queries, type WatchedLibraryCursor } from '../lib/api';

export function WatchlistPage() {
  const watchlist = useInfiniteQuery({
    queryKey: ['watchlist'],
    queryFn: ({ pageParam }) => queries.watchlist(pageParam),
    initialPageParam: null as WatchedLibraryCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  if (watchlist.isPending) return <LoadingState />;
  if (watchlist.error)
    return <ErrorState error={watchlist.error} retry={() => watchlist.refetch()} />;

  return (
    <div className="page-stack wide">
      <header>
        <p className="eyebrow">Saved for later</p>
        <h1>Your watchlist.</h1>
        <p className="lede">A deliberately short path back to everything you meant to watch.</p>
      </header>
      {watchlist.data!.pages[0]?.items.length ? (
        <>
          <div className="poster-grid">
            {watchlist
              .data!.pages.flatMap((page) => page.items)
              .map(({ item, addedAt }) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  note={`Added ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(addedAt))}`}
                />
              ))}
          </div>
          {watchlist.hasNextPage && (
            <div className="library-more">
              <button
                className="button subtle"
                type="button"
                disabled={watchlist.isFetchingNextPage}
                onClick={() => watchlist.fetchNextPage()}
              >
                {watchlist.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState title="Your shortlist is open">
          <Link to="/search">Search for something</Link> and add it to your watchlist.
        </EmptyState>
      )}
    </div>
  );
}

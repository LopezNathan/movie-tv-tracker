import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { MediaCard } from '../components/media-card';
import { queries, type WatchedLibraryCursor } from '../lib/api';

type LibraryFilter = 'all' | 'movie' | 'show' | 'episode' | 'hidden';

const filters: Array<{ value: LibraryFilter; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'episode', label: 'Episodes' },
  { value: 'hidden', label: 'Hidden' },
];

export function LibraryPage() {
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchQuery(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const appliedSearch = filter === 'hidden' ? '' : searchQuery;
  const kind = filter === 'all' || filter === 'hidden' ? undefined : filter;
  const library = useInfiniteQuery({
    queryKey: ['library', filter, kind, appliedSearch],
    queryFn: ({ pageParam }) =>
      filter === 'hidden'
        ? queries.hiddenShows(pageParam)
        : queries.watchedLibrary(kind, pageParam, appliedSearch),
    initialPageParam: null as WatchedLibraryCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => {
    if (!library.data) return [];
    return library.data.pages.flatMap((page) => page.items);
  }, [library.data]);
  const total = library.data?.pages[0]?.total ?? 0;

  if (library.isPending) return <LoadingState label="Loading your watched library…" />;
  if (library.error) return <ErrorState error={library.error} retry={() => library.refetch()} />;

  return (
    <div className="page-stack wide">
      <header>
        <p className="eyebrow">Already seen</p>
        <h1>{filter === 'hidden' ? 'Hidden shows.' : 'Library.'}</h1>
        <p className="lede">
          {filter === 'hidden'
            ? 'Shows hidden from Up Next — most recently hidden first.'
            : "Every distinct movie, show, and episode you've watched — newest first."}
        </p>
      </header>

      {total || appliedSearch ? (
        <>
          <div className="library-toolbar">
            <div className="library-summary">
              <span className="library-count">
                {total} title{total === 1 ? '' : 's'}
                {appliedSearch ? ' found' : ''}
              </span>
              {filter !== 'hidden' && (
                <label className="library-search">
                  <Search aria-hidden="true" size={17} />
                  <span className="sr-only">Search watched titles</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSearch(value);
                      if (!value) setSearchQuery('');
                    }}
                    placeholder="Search watched titles"
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearch('');
                        setSearchQuery('');
                      }}
                    >
                      <X aria-hidden="true" size={16} />
                    </button>
                  )}
                </label>
              )}
            </div>
            <div className="filter-group">
              {filters.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? 'filter-button active' : 'filter-button'}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {items.length ? (
            <>
              <div className="poster-grid">
                {items.map(({ item, watchedAt, hiddenAt }) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    note={
                      hiddenAt
                        ? `Hidden ${new Intl.DateTimeFormat(undefined, {
                            dateStyle: 'medium',
                          }).format(new Date(hiddenAt))}`
                        : `Last watched ${new Intl.DateTimeFormat(undefined, {
                            dateStyle: 'medium',
                          }).format(new Date(watchedAt!))}`
                    }
                  />
                ))}
              </div>
              {library.hasNextPage && (
                <div className="library-more">
                  <button
                    className="button subtle"
                    type="button"
                    onClick={() => library.fetchNextPage()}
                    disabled={library.isFetchingNextPage}
                  >
                    {library.isFetchingNextPage ? 'Loading more…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title={
                appliedSearch
                  ? `No watched titles match “${appliedSearch}”`
                  : filter === 'hidden'
                    ? 'No hidden shows'
                    : `No ${filter}s watched yet`
              }
            >
              {appliedSearch
                ? 'Try a different title or clear your search.'
                : filter === 'hidden'
                  ? 'Hover over a show in Up Next to hide it.'
                  : 'Try another filter to see more of your library.'}
            </EmptyState>
          )}
        </>
      ) : (
        <EmptyState
          title={filter === 'hidden' ? 'No hidden shows' : 'Your watched library is waiting'}
        >
          {filter === 'hidden' ? (
            'Hover over a show in Up Next to hide it.'
          ) : (
            <>
              <Link to="/search">Find something to watch</Link> and mark it watched to add it here.
            </>
          )}
        </EmptyState>
      )}
    </div>
  );
}

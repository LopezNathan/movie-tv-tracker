import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { MediaCard } from '../components/media-card';
import { queries } from '../lib/api';

type LibraryFilter = 'all' | 'movie' | 'show' | 'episode';

const filters: Array<{ value: LibraryFilter; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'episode', label: 'Episodes' },
];

export function LibraryPage() {
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const library = useQuery({ queryKey: ['library', 'watched'], queryFn: queries.watchedLibrary });

  const items = useMemo(() => {
    if (!library.data) return [];
    return filter === 'all'
      ? library.data.items
      : library.data.items.filter(({ item }) => item.kind === filter);
  }, [filter, library.data]);

  if (library.isLoading) return <LoadingState label="Loading your watched library…" />;
  if (library.error) return <ErrorState error={library.error} retry={() => library.refetch()} />;

  return (
    <div className="page-stack wide">
      <header>
        <p className="eyebrow">Already seen</p>
        <h1>Watched library.</h1>
        <p className="lede">
          Every distinct movie, show, and episode you&apos;ve watched — newest first.
        </p>
      </header>

      {library.data!.items.length ? (
        <>
          <div className="library-toolbar" aria-label="Filter watched library">
            <span className="library-count">{items.length} titles</span>
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
            <div className="poster-grid">
              {items.map(({ item, watchedAt }) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  note={`Last watched ${new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                  }).format(new Date(watchedAt))}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState title={`No ${filter}s watched yet`}>
              Try another filter to see more of your library.
            </EmptyState>
          )}
        </>
      ) : (
        <EmptyState title="Your watched library is waiting">
          <Link to="/search">Find something to watch</Link> and mark it watched to add it here.
        </EmptyState>
      )}
    </div>
  );
}

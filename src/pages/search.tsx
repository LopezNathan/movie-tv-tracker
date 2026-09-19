import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { MediaCard } from '../components/media-card';
import { queries } from '../lib/api';

export function SearchPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const results = useQuery({
    queryKey: ['search', query, page],
    queryFn: () => queries.search(query, page),
    enabled: query.length >= 2,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(input.trim());
  }

  return (
    <div className="page-stack wide">
      <header>
        <p className="eyebrow">Explore TMDB</p>
        <h1>Find your next watch.</h1>
        <p className="lede">
          Search movies and shows. Nothing is saved until you interact with it.
        </p>
      </header>
      <form className="search-box" onSubmit={submit} role="search">
        <Search aria-hidden="true" />
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Movie or television title"
          aria-label="Movie or television title"
          minLength={2}
          autoFocus
        />
        <button className="button primary" disabled={input.trim().length < 2}>
          Search
        </button>
      </form>
      {results.isLoading && <LoadingState label="Searching the catalog…" />}
      {results.error && <ErrorState error={results.error} retry={() => results.refetch()} />}
      {results.data &&
        (results.data.results.length ? (
          <>
            <section className="poster-grid search-results" aria-label="Search results">
              {results.data.results.map((item) => (
                <MediaCard
                  key={`${item.kind}-${item.tmdbId}`}
                  item={item}
                  note={item.kind === 'show' ? 'Series' : 'Movie'}
                />
              ))}
            </section>
            {results.data.totalPages > 1 && (
              <div className="library-more search-pagination">
                <button
                  className="button subtle"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {results.data.page} of {results.data.totalPages}
                </span>
                <button
                  className="button subtle"
                  disabled={page === results.data.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState title="No exact match">
            Try a shorter title, alternate spelling, or original-language name.
          </EmptyState>
        ))}
    </div>
  );
}

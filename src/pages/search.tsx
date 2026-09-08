import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../components/async-state';
import { MediaCard } from '../components/media-card';
import { queries } from '../lib/api';

export function SearchPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const results = useQuery({
    queryKey: ['search', query],
    queryFn: () => queries.search(query),
    enabled: query.length >= 2,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
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
          <section className="poster-grid search-results" aria-label="Search results">
            {results.data.results.map((item) => (
              <MediaCard
                key={`${item.kind}-${item.tmdbId}`}
                item={item}
                note={item.kind === 'show' ? 'Series' : 'Movie'}
              />
            ))}
          </section>
        ) : (
          <EmptyState title="No exact match">
            Try a shorter title, alternate spelling, or original-language name.
          </EmptyState>
        ))}
      {!query && (
        <EmptyState title="A clean slate">
          Search results come directly from TMDB and are not added to your library automatically.
        </EmptyState>
      )}
    </div>
  );
}

import type { SearchResult } from '../../shared/types';
import type { Bindings } from '../env';

const BASE_URL = 'https://api.themoviedb.org/3';

export class TmdbError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

type TmdbSearchItem = {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
};

export type TmdbDetails = TmdbSearchItem & {
  status?: string;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  external_ids?: { imdb_id?: string; tvdb_id?: number };
};

export type TmdbSeason = {
  episodes: Array<{
    id: number;
    name: string;
    overview?: string;
    air_date?: string;
    episode_number: number;
    season_number: number;
    runtime?: number;
    still_path?: string;
  }>;
};

async function request<T>(
  env: Bindings,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  if (!env.TMDB_API_TOKEN) throw new TmdbError('TMDB_API_TOKEN is not configured.', 503);
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.TMDB_API_TOKEN}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new TmdbError(
      `TMDB request failed with status ${response.status}.`,
      response.status === 404 ? 404 : 502,
    );
  }
  return response.json<T>();
}

export async function searchTmdb(
  env: Bindings,
  query: string,
  page: number,
): Promise<{ results: SearchResult[]; page: number; totalPages: number }> {
  const data = await request<{ results: TmdbSearchItem[]; page: number; total_pages: number }>(
    env,
    '/search/multi',
    { query, page: String(page), include_adult: 'false' },
  );
  return {
    page: data.page,
    totalPages: data.total_pages,
    results: data.results
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item) => ({
        kind: item.media_type === 'tv' ? 'show' : 'movie',
        tmdbId: item.id,
        title: item.title ?? item.name ?? 'Untitled',
        originalTitle: item.original_title ?? item.original_name ?? null,
        releaseYear: Number((item.release_date ?? item.first_air_date)?.slice(0, 4)) || null,
        overview: item.overview ?? null,
        posterPath: item.poster_path ?? null,
        backdropPath: item.backdrop_path ?? null,
      })),
  };
}

export function getTmdbDetails(env: Bindings, kind: 'movie' | 'show', tmdbId: number) {
  return request<TmdbDetails>(env, `/${kind === 'show' ? 'tv' : 'movie'}/${tmdbId}`, {
    append_to_response: 'external_ids',
  });
}

export function getTmdbSeason(env: Bindings, tmdbId: number, seasonNumber: number) {
  return request<TmdbSeason>(env, `/tv/${tmdbId}/season/${seasonNumber}`);
}

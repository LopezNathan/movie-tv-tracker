export type MediaKind = 'movie' | 'show' | 'episode';

export type MediaRecord = {
  id: string;
  kind: MediaKind;
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  status: string | null;
  runtime: number | null;
  seriesId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  airDate: string | null;
  metadataUpdatedAt: string;
};

export type WatchEventRecord = {
  id: string;
  mediaId: string;
  watchedAt: string;
  source: string;
  media: MediaRecord;
};

export type ShowProgress = {
  showId: string;
  watched: number;
  aired: number;
  percentage: number;
  nextEpisode: MediaRecord | null;
  seasons: Array<{ seasonNumber: number; watched: number; aired: number }>;
};

export type SearchResult = {
  kind: 'movie' | 'show';
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
};

export type DashboardResponse = {
  upNext: Array<{ show: MediaRecord; progress: ShowProgress }>;
  recent: WatchEventRecord[];
  watchlist: MediaRecord[];
  stats: { watchedMovies: number; watchedEpisodes: number; watchEvents: number };
};

export type MediaDetailResponse = {
  media: MediaRecord;
  episodes: MediaRecord[];
  watchEvents: WatchEventRecord[];
  rating: number | null;
  inWatchlist: boolean;
  progress: ShowProgress | null;
};

export type ApiError = { error: string; details?: unknown };

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

export type WatchEventWithShow = WatchEventRecord & {
  show?: MediaRecord;
  seasonPosterPath?: string | null;
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
  recent: WatchEventWithShow[];
  watchlist: MediaRecord[];
  stats: { watchedMovies: number; watchedEpisodes: number; watchEvents: number };
};

export type MediaDetailResponse = {
  media: MediaRecord;
  episodes: MediaRecord[];
  watchEvents: WatchEventRecord[];
  rating: number | null;
  inWatchlist: boolean;
  hiddenFromUpNext: boolean;
  progress: ShowProgress | null;
};

export type ApiError = { error: string; details?: unknown };

export type NormalizedImportItem = {
  action: 'watch' | 'rating' | 'watchlist';
  kind: 'movie' | 'show' | 'episode';
  title: string;
  year?: number;
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;
  showTitle?: string;
  showYear?: number;
  showTmdbId?: number;
  showImdbId?: string;
  showTvdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  watchedAt?: string;
  ratedAt?: string;
  addedAt?: string;
  rating?: number;
  sourceEventId?: string;
  fingerprint: string;
};

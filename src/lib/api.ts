import type {
  ApiError,
  DashboardResponse,
  MediaDetailResponse,
  MediaKind,
  MediaRecord,
  SearchResult,
  WatchEventWithShow,
} from '../../shared/types';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

export function couldBeExpiredAccessSession(error: unknown, online = navigator.onLine) {
  if (!(error instanceof ApiRequestError)) return false;
  return error.status === 401 || error.status === 403 || (error.status === 0 && online);
}

type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, error: ApiRequestError) => void;
};

export type WatchedLibraryCursor = { watchedAt: string; itemId: string };

export type LibraryPage = {
  items: Array<{ item: MediaRecord; watchedAt?: string; hiddenAt?: string }>;
  total: number;
  nextCursor: WatchedLibraryCursor | null;
};

export type WatchedLibraryPage = LibraryPage;

export type HiddenShowsPage = LibraryPage;

export type WatchlistPage = {
  items: Array<{ item: MediaRecord; addedAt: string; entryId: string }>;
  total: number;
  nextCursor: WatchedLibraryCursor | null;
};

function retryable(error: unknown): error is ApiRequestError {
  return (
    error instanceof ApiRequestError &&
    (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)
  );
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET' && !navigator.onLine) {
    throw new ApiRequestError(
      'Reconnect before making changes. Offline writes are never queued.',
      0,
    );
  }
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError(
      method === 'GET'
        ? 'This page is not available offline yet.'
        : 'The request was interrupted. Check your connection and try again.',
      0,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
    throw new ApiRequestError(
      body?.error || response.statusText || `Request failed (HTTP ${response.status}).`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1_000 : undefined,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiWithRetry<T>(
  path: string,
  init?: RequestInit,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 750;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await api<T>(path, init);
    } catch (error) {
      if (!retryable(error) || attempt >= maxAttempts) throw error;
      const delayMs = error.retryAfterMs ?? Math.min(baseDelayMs * 2 ** (attempt - 1), 10_000);
      options.onRetry?.(attempt + 1, delayMs, error);
      await wait(delayMs);
    }
  }
}

export const queries = {
  dashboard: () => api<DashboardResponse>('/api/dashboard'),
  search: (query: string, page = 1) =>
    api<{ results: SearchResult[]; page: number; totalPages: number }>(
      `/api/search?q=${encodeURIComponent(query)}&page=${page}`,
    ),
  media: (kind: string, id: string) => api<MediaDetailResponse>(`/api/media/${kind}/${id}`),
  history: (cursor?: string | null) =>
    api<{ items: WatchEventWithShow[]; nextCursor: string | null }>(
      `/api/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  watchlist: (cursor?: WatchedLibraryCursor | null) => {
    const params = new URLSearchParams({ filter: 'watchlist', limit: '60' });
    if (cursor) {
      params.set('before', cursor.watchedAt);
      params.set('beforeId', cursor.itemId);
    }
    return api<WatchlistPage>(`/api/library?${params}`);
  },
  watchedLibrary: (kind?: MediaKind, cursor?: WatchedLibraryCursor | null, query?: string) => {
    const params = new URLSearchParams({ filter: 'watched', limit: '60' });
    if (kind) params.set('kind', kind);
    if (query?.trim()) params.set('q', query.trim());
    if (cursor) {
      params.set('before', cursor.watchedAt);
      params.set('beforeId', cursor.itemId);
    }
    return api<WatchedLibraryPage>(`/api/library?${params}`);
  },
  hiddenShows: (cursor?: WatchedLibraryCursor | null) => {
    const params = new URLSearchParams({ filter: 'hidden', limit: '60' });
    if (cursor) {
      params.set('before', cursor.watchedAt);
      params.set('beforeId', cursor.itemId);
    }
    return api<HiddenShowsPage>(`/api/library?${params}`);
  },
};

export function json(method: 'POST' | 'PUT' | 'DELETE', body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

import type {
  ApiError,
  DashboardResponse,
  MediaDetailResponse,
  SearchResult,
  WatchEventRecord,
} from '../../shared/types';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ error: response.statusText }))) as ApiError;
    throw new ApiRequestError(body.error || 'Request failed.', response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const queries = {
  dashboard: () => api<DashboardResponse>('/api/dashboard'),
  search: (query: string) =>
    api<{ results: SearchResult[]; page: number; totalPages: number }>(
      `/api/search?q=${encodeURIComponent(query)}`,
    ),
  media: (kind: string, id: string) => api<MediaDetailResponse>(`/api/media/${kind}/${id}`),
  history: () => api<{ items: WatchEventRecord[]; nextCursor: string | null }>('/api/history'),
  watchlist: () =>
    api<{
      items: Array<{ item: MediaDetailResponse['media']; addedAt: string }>;
    }>('/api/library?filter=watchlist'),
};

export function json(method: 'POST' | 'PUT' | 'DELETE', body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

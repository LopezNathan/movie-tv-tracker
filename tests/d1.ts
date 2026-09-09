import { readFile } from 'node:fs/promises';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import type { Bindings } from '../worker/env';

export async function createTestDatabase() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("test") } }',
      compatibilityDate: '2026-09-08',
      d1Databases: { DB: `scene-test-${crypto.randomUUID()}` },
    }),
  );
  const database = await miniflare.getD1Database('DB');
  const migration = await readFile(
    new URL('../migrations/0000_initial.sql', import.meta.url),
    'utf8',
  );
  for (const statement of migration
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean)) {
    await database.prepare(statement).run();
  }
  const env: Bindings = {
    DB: database,
    ENVIRONMENT: 'test',
    DEV_USER_EMAIL: 'owner@example.test',
    TMDB_API_TOKEN: 'test-token',
  };
  return { env, database, dispose: () => miniflare.dispose() };
}

export async function seedMedia(
  database: D1Database,
  values: {
    id: string;
    kind: 'movie' | 'show' | 'episode';
    tmdbId: number;
    title: string;
    seriesId?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    airDate?: string | null;
    status?: string;
    metadataUpdatedAt?: string;
  },
) {
  const now = new Date().toISOString();
  await database
    .prepare(
      `INSERT INTO media (
        id, kind, tmdb_id, title, series_id, season_number, episode_number, air_date,
        status, metadata_updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      values.id,
      values.kind,
      values.tmdbId,
      values.title,
      values.seriesId ?? null,
      values.seasonNumber ?? null,
      values.episodeNumber ?? null,
      values.airDate ?? null,
      values.status ?? null,
      values.metadataUpdatedAt ?? now,
      now,
    )
    .run();
}

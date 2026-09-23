import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  createdAt: text('created_at').notNull(),
});

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['movie', 'show', 'episode'] }).notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    imdbId: text('imdb_id'),
    tvdbId: integer('tvdb_id'),
    title: text('title').notNull(),
    originalTitle: text('original_title'),
    releaseYear: integer('release_year'),
    overview: text('overview'),
    posterPath: text('poster_path'),
    backdropPath: text('backdrop_path'),
    status: text('status'),
    runtime: integer('runtime'),
    seriesId: text('series_id').references((): AnySQLiteColumn => media.id, {
      onDelete: 'cascade',
    }),
    seasonNumber: integer('season_number'),
    episodeNumber: integer('episode_number'),
    airDate: text('air_date'),
    metadataUpdatedAt: text('metadata_updated_at').notNull(),
    episodesUpdatedAt: text('episodes_updated_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('media_kind_tmdb_unique').on(table.kind, table.tmdbId),
    index('media_series_episode_idx').on(table.seriesId, table.seasonNumber, table.episodeNumber),
    index('media_external_idx').on(table.imdbId, table.tvdbId),
  ],
);

export const watchEvents = sqliteTable(
  'watch_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    watchedAt: text('watched_at').notNull(),
    source: text('source').notNull().default('manual'),
    sourceEventKey: text('source_event_key'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('watch_events_user_date_idx').on(table.userId, table.watchedAt),
    index('watch_events_media_idx').on(table.mediaId),
    uniqueIndex('watch_events_source_unique').on(table.userId, table.source, table.sourceEventKey),
  ],
);

// A compact, transactionally maintained projection of watch_events. Read paths
// use this table when they only need "has watched" or the latest watch time.
export const userMediaWatchState = sqliteTable(
  'user_media_watch_state',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    latestWatchedAt: text('latest_watched_at').notNull(),
    watchCount: integer('watch_count').notNull(),
  },
  (table) => [
    uniqueIndex('user_media_watch_state_user_media_unique').on(table.userId, table.mediaId),
    index('user_media_watch_state_user_latest_idx').on(
      table.userId,
      table.latestWatchedAt,
      table.mediaId,
    ),
  ],
);

export const ratings = sqliteTable(
  'ratings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    ratedAt: text('rated_at').notNull(),
    source: text('source').notNull().default('manual'),
  },
  (table) => [uniqueIndex('ratings_user_media_unique').on(table.userId, table.mediaId)],
);

export const listEntries = sqliteTable(
  'list_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    list: text('list', { enum: ['watchlist'] })
      .notNull()
      .default('watchlist'),
    addedAt: text('added_at').notNull(),
    source: text('source').notNull().default('manual'),
  },
  (table) => [
    uniqueIndex('list_entries_user_media_list_unique').on(table.userId, table.mediaId, table.list),
  ],
);

export const upNextExclusions = sqliteTable(
  'up_next_exclusions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    showId: text('show_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    hiddenAt: text('hidden_at').notNull(),
  },
  (table) => [uniqueIndex('up_next_exclusions_user_show_unique').on(table.userId, table.showId)],
);

/** Short-lived handoff credentials produced only after Cloudflare Access succeeds. */
export const mobilePairingCodes = sqliteTable(
  'mobile_pairing_codes',
  {
    id: text('id').primaryKey(),
    codeHash: text('code_hash').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('mobile_pairing_codes_hash_unique').on(table.codeHash)],
);

/** Opaque mobile credentials. Only SHA-256 digests are persisted in D1. */
export const mobileSessions = sqliteTable(
  'mobile_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessTokenHash: text('access_token_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    accessExpiresAt: text('access_expires_at').notNull(),
    refreshExpiresAt: text('refresh_expires_at').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
  },
  (table) => [
    uniqueIndex('mobile_sessions_access_hash_unique').on(table.accessTokenHash),
    uniqueIndex('mobile_sessions_refresh_hash_unique').on(table.refreshTokenHash),
    index('mobile_sessions_user_idx').on(table.userId),
  ],
);

/** Plex webhook credentials. Only the digest of the URL secret is persisted. */
export const plexIntegrations = sqliteTable(
  'plex_integrations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secretHash: text('secret_hash').notNull(),
    plexUsername: text('plex_username').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastEventAt: text('last_event_at'),
    lastStatus: text('last_status'),
    lastError: text('last_error'),
  },
  (table) => [
    uniqueIndex('plex_integrations_user_unique').on(table.userId),
    uniqueIndex('plex_integrations_secret_unique').on(table.secretHash),
  ],
);

export const importRuns = sqliteTable(
  'import_runs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    filename: text('filename'),
    status: text('status', { enum: ['pending', 'running', 'complete', 'failed'] }).notNull(),
    totalItems: integer('total_items').notNull().default(0),
    processedItems: integer('processed_items').notNull().default(0),
    importedItems: integer('imported_items').notNull().default(0),
    skippedItems: integer('skipped_items').notNull().default(0),
    issueCount: integer('issue_count').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('import_runs_user_idx').on(table.userId, table.createdAt)],
);

export const importIssues = sqliteTable(
  'import_issues',
  {
    id: text('id').primaryKey(),
    importRunId: text('import_run_id')
      .notNull()
      .references(() => importRuns.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    reason: text('reason').notNull(),
    payload: text('payload').notNull(),
    resolvedMediaId: text('resolved_media_id').references(() => media.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('import_issues_run_fingerprint_unique').on(table.importRunId, table.fingerprint),
  ],
);

export const importBatchReceipts = sqliteTable(
  'import_batch_receipts',
  {
    id: text('id').primaryKey(),
    importRunId: text('import_run_id')
      .notNull()
      .references(() => importRuns.id, { onDelete: 'cascade' }),
    itemCount: integer('item_count').notNull(),
    importedItems: integer('imported_items').notNull(),
    skippedItems: integer('skipped_items').notNull(),
    issueCount: integer('issue_count').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('import_batch_receipts_run_idx').on(table.importRunId)],
);

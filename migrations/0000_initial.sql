PRAGMA foreign_keys = ON;

CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `created_at` text NOT NULL
);

CREATE TABLE `media` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('movie', 'show', 'episode')),
  `tmdb_id` integer NOT NULL,
  `imdb_id` text,
  `tvdb_id` integer,
  `title` text NOT NULL,
  `original_title` text,
  `release_year` integer,
  `overview` text,
  `poster_path` text,
  `backdrop_path` text,
  `status` text,
  `runtime` integer,
  `series_id` text REFERENCES `media`(`id`) ON DELETE CASCADE,
  `season_number` integer,
  `episode_number` integer,
  `air_date` text,
  `metadata_updated_at` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `media_kind_tmdb_unique` ON `media` (`kind`, `tmdb_id`);
CREATE INDEX `media_series_episode_idx` ON `media` (`series_id`, `season_number`, `episode_number`);
CREATE INDEX `media_external_idx` ON `media` (`imdb_id`, `tvdb_id`);

CREATE TABLE `watch_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `media_id` text NOT NULL REFERENCES `media`(`id`) ON DELETE CASCADE,
  `watched_at` text NOT NULL,
  `source` text NOT NULL DEFAULT 'manual',
  `source_event_key` text,
  `created_at` text NOT NULL
);
CREATE INDEX `watch_events_user_date_idx` ON `watch_events` (`user_id`, `watched_at`);
CREATE INDEX `watch_events_media_idx` ON `watch_events` (`media_id`);
CREATE UNIQUE INDEX `watch_events_source_unique` ON `watch_events` (`user_id`, `source`, `source_event_key`);

CREATE TABLE `ratings` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `media_id` text NOT NULL REFERENCES `media`(`id`) ON DELETE CASCADE,
  `rating` integer NOT NULL CHECK (`rating` BETWEEN 1 AND 10),
  `rated_at` text NOT NULL,
  `source` text NOT NULL DEFAULT 'manual'
);
CREATE UNIQUE INDEX `ratings_user_media_unique` ON `ratings` (`user_id`, `media_id`);

CREATE TABLE `list_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `media_id` text NOT NULL REFERENCES `media`(`id`) ON DELETE CASCADE,
  `list` text NOT NULL DEFAULT 'watchlist' CHECK (`list` = 'watchlist'),
  `added_at` text NOT NULL,
  `source` text NOT NULL DEFAULT 'manual'
);
CREATE UNIQUE INDEX `list_entries_user_media_list_unique` ON `list_entries` (`user_id`, `media_id`, `list`);

CREATE TABLE `import_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `source` text NOT NULL,
  `filename` text,
  `status` text NOT NULL CHECK (`status` IN ('pending', 'running', 'complete', 'failed')),
  `total_items` integer NOT NULL DEFAULT 0,
  `processed_items` integer NOT NULL DEFAULT 0,
  `imported_items` integer NOT NULL DEFAULT 0,
  `skipped_items` integer NOT NULL DEFAULT 0,
  `issue_count` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX `import_runs_user_idx` ON `import_runs` (`user_id`, `created_at`);

CREATE TABLE `import_issues` (
  `id` text PRIMARY KEY NOT NULL,
  `import_run_id` text NOT NULL REFERENCES `import_runs`(`id`) ON DELETE CASCADE,
  `fingerprint` text NOT NULL,
  `reason` text NOT NULL,
  `payload` text NOT NULL,
  `resolved_media_id` text REFERENCES `media`(`id`),
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `import_issues_run_fingerprint_unique` ON `import_issues` (`import_run_id`, `fingerprint`);


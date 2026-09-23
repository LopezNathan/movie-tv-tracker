CREATE TABLE `plex_integrations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `secret_hash` text NOT NULL,
  `plex_username` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `last_event_at` text,
  `last_status` text,
  `last_error` text
);

CREATE UNIQUE INDEX `plex_integrations_user_unique` ON `plex_integrations` (`user_id`);
CREATE UNIQUE INDEX `plex_integrations_secret_unique` ON `plex_integrations` (`secret_hash`);

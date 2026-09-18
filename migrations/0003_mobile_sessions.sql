CREATE TABLE `mobile_pairing_codes` (
  `id` text PRIMARY KEY NOT NULL,
  `code_hash` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `expires_at` text NOT NULL,
  `consumed_at` text,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `mobile_pairing_codes_hash_unique` ON `mobile_pairing_codes` (`code_hash`);

CREATE TABLE `mobile_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `access_token_hash` text NOT NULL,
  `refresh_token_hash` text NOT NULL,
  `access_expires_at` text NOT NULL,
  `refresh_expires_at` text NOT NULL,
  `revoked_at` text,
  `created_at` text NOT NULL,
  `last_used_at` text NOT NULL
);
CREATE UNIQUE INDEX `mobile_sessions_access_hash_unique` ON `mobile_sessions` (`access_token_hash`);
CREATE UNIQUE INDEX `mobile_sessions_refresh_hash_unique` ON `mobile_sessions` (`refresh_token_hash`);
CREATE INDEX `mobile_sessions_user_idx` ON `mobile_sessions` (`user_id`);

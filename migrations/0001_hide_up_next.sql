CREATE TABLE `up_next_exclusions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `show_id` text NOT NULL REFERENCES `media`(`id`) ON DELETE CASCADE,
  `hidden_at` text NOT NULL
);

CREATE UNIQUE INDEX `up_next_exclusions_user_show_unique`
  ON `up_next_exclusions` (`user_id`, `show_id`);

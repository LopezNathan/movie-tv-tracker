CREATE INDEX `watch_events_user_media_date_idx`
  ON `watch_events` (`user_id`, `media_id`, `watched_at` DESC);

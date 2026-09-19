CREATE TABLE `user_media_watch_state` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `media_id` text NOT NULL REFERENCES `media`(`id`) ON DELETE CASCADE,
  `latest_watched_at` text NOT NULL,
  `watch_count` integer NOT NULL,
  PRIMARY KEY (`user_id`, `media_id`)
);

CREATE INDEX `user_media_watch_state_user_latest_idx`
  ON `user_media_watch_state` (`user_id`, `latest_watched_at` DESC, `media_id` DESC);

INSERT INTO `user_media_watch_state` (`user_id`, `media_id`, `latest_watched_at`, `watch_count`)
SELECT `user_id`, `media_id`, MAX(`watched_at`), COUNT(*)
FROM `watch_events`
GROUP BY `user_id`, `media_id`;

CREATE TRIGGER `watch_events_state_after_insert`
AFTER INSERT ON `watch_events`
BEGIN
  INSERT INTO `user_media_watch_state` (`user_id`, `media_id`, `latest_watched_at`, `watch_count`)
  VALUES (NEW.`user_id`, NEW.`media_id`, NEW.`watched_at`, 1)
  ON CONFLICT (`user_id`, `media_id`) DO UPDATE SET
    `latest_watched_at` = MAX(`latest_watched_at`, excluded.`latest_watched_at`),
    `watch_count` = `watch_count` + 1;
END;

CREATE TRIGGER `watch_events_state_after_delete`
AFTER DELETE ON `watch_events`
BEGIN
  DELETE FROM `user_media_watch_state`
  WHERE `user_id` = OLD.`user_id`
    AND `media_id` = OLD.`media_id`
    AND NOT EXISTS (
      SELECT 1 FROM `watch_events`
      WHERE `user_id` = OLD.`user_id` AND `media_id` = OLD.`media_id`
    );

  UPDATE `user_media_watch_state`
  SET
    `latest_watched_at` = (
      SELECT MAX(`watched_at`) FROM `watch_events`
      WHERE `user_id` = OLD.`user_id` AND `media_id` = OLD.`media_id`
    ),
    `watch_count` = (
      SELECT COUNT(*) FROM `watch_events`
      WHERE `user_id` = OLD.`user_id` AND `media_id` = OLD.`media_id`
    )
  WHERE `user_id` = OLD.`user_id` AND `media_id` = OLD.`media_id`;
END;

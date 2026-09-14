CREATE TABLE `import_batch_receipts` (
  `id` text PRIMARY KEY NOT NULL,
  `import_run_id` text NOT NULL REFERENCES `import_runs`(`id`) ON DELETE CASCADE,
  `item_count` integer NOT NULL,
  `imported_items` integer NOT NULL,
  `skipped_items` integer NOT NULL,
  `issue_count` integer NOT NULL,
  `created_at` text NOT NULL
);
CREATE INDEX `import_batch_receipts_run_idx` ON `import_batch_receipts` (`import_run_id`);

ALTER TABLE `users` ADD `status` enum('active','pending','blocked') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `requested_at` datetime(3);--> statement-breakpoint
ALTER TABLE `users` ADD `approved_at` datetime(3);--> statement-breakpoint
ALTER TABLE `users` ADD `approved_by` varchar(190);--> statement-breakpoint
ALTER TABLE `users` ADD `blocked_at` datetime(3);--> statement-breakpoint
ALTER TABLE `users` ADD `blocked_by` varchar(190);--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);
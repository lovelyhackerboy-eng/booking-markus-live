CREATE TABLE `feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`email` varchar(190) NOT NULL,
	`name` varchar(190),
	`role` varchar(20),
	`screen` varchar(120),
	`route` varchar(300),
	`kind` varchar(20) NOT NULL,
	`prio` varchar(20) NOT NULL,
	`doing` text NOT NULL,
	`want` text NOT NULL,
	`actual` text,
	`app_version` varchar(40),
	`status` enum('new','doing','done','wontfix') NOT NULL DEFAULT 'new',
	`admin_note` text,
	`updated_at` datetime(3) NOT NULL,
	`updated_by` varchar(190),
	CONSTRAINT `feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `campaigns` MODIFY COLUMN `status` enum('draft','running','done','deleted') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `campaigns` ADD `deleted_at` datetime(3);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `deleted_by` varchar(190);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `status_before_delete` varchar(20);--> statement-breakpoint
CREATE INDEX `feedback_status_idx` ON `feedback` (`status`);
CREATE TABLE `campaign_steps` (
	`campaign_id` varchar(40) NOT NULL,
	`step_key` varchar(40) NOT NULL,
	`label` varchar(80) NOT NULL,
	`position` int NOT NULL,
	`final` int NOT NULL DEFAULT 0,
	CONSTRAINT `campaign_steps_campaign_id_step_key_pk` PRIMARY KEY(`campaign_id`,`step_key`)
);
--> statement-breakpoint
CREATE TABLE `creator_clips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creator_id` varchar(40) NOT NULL,
	`platform` enum('tiktok','facebook','instagram','youtube','threads') NOT NULL,
	`external_id` varchar(120) NOT NULL,
	`url` varchar(1024),
	`title` varchar(300),
	`published_at` datetime,
	`views` bigint,
	`likes` bigint,
	`comments` bigint,
	`shares` bigint,
	`source` enum('manual','auto') NOT NULL,
	`entered_by` varchar(190),
	`fetched_at` datetime(3) NOT NULL,
	CONSTRAINT `creator_clips_id` PRIMARY KEY(`id`),
	CONSTRAINT `clips_unique` UNIQUE(`creator_id`,`platform`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `creator_metrics` (
	`creator_id` varchar(40) NOT NULL,
	`platform` enum('tiktok','facebook','instagram','youtube','threads') NOT NULL,
	`avg_views` bigint,
	`er` decimal(7,2),
	`sample_size` int NOT NULL DEFAULT 0,
	`followers_seen` bigint,
	`avatar_url` varchar(1024),
	`source` enum('manual','auto') NOT NULL,
	`last_error` varchar(120),
	`computed_at` datetime(3) NOT NULL,
	CONSTRAINT `creator_metrics_creator_id_platform_pk` PRIMARY KEY(`creator_id`,`platform`)
);
--> statement-breakpoint
CREATE TABLE `post_snapshots` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`post_id` varchar(40) NOT NULL,
	`at` datetime(3) NOT NULL,
	`views` bigint,
	`likes` bigint,
	`comments` bigint,
	`shares` bigint,
	CONSTRAINT `post_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` varchar(40) NOT NULL,
	`campaign_id` varchar(40) NOT NULL,
	`creator_id` varchar(40) NOT NULL,
	`platform` enum('tiktok','facebook','instagram','youtube','threads') NOT NULL,
	`url` varchar(1024) NOT NULL,
	`external_id` varchar(120),
	`title` varchar(300),
	`posted_at` datetime,
	`views` bigint,
	`likes` bigint,
	`comments` bigint,
	`shares` bigint,
	`source` enum('manual','auto') NOT NULL,
	`last_fetched_at` datetime(3),
	`created_by` varchar(190),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `posts_unique` UNIQUE(`campaign_id`,`url`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`setting_key` varchar(60) NOT NULL,
	`value` text NOT NULL,
	`updated_by` varchar(190),
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `settings_setting_key` PRIMARY KEY(`setting_key`)
);
--> statement-breakpoint
ALTER TABLE `campaign_entries` MODIFY COLUMN `stage` varchar(40) NOT NULL DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `campaign_entries` ADD `position` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `status` enum('draft','running','done') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `description` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `budget` bigint;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `start_date` datetime;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `end_date` datetime;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `auto_track` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `track_from` datetime;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `track_to` datetime;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `done_at` datetime(3);--> statement-breakpoint
CREATE INDEX `clips_creator_idx` ON `creator_clips` (`creator_id`,`platform`);--> statement-breakpoint
CREATE INDEX `snapshots_post_idx` ON `post_snapshots` (`post_id`);--> statement-breakpoint
CREATE INDEX `posts_campaign_idx` ON `posts` (`campaign_id`);--> statement-breakpoint
UPDATE `campaigns` SET `status` = 'running', `start_date` = `created_at` WHERE `id` IN (SELECT `campaign_id` FROM `campaign_entries`) OR `id` IN (SELECT `campaign_id` FROM `campaign_candidates`);

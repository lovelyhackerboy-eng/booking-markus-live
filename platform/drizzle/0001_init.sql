CREATE TABLE `audit_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`at` datetime(3) NOT NULL,
	`actor_email` varchar(190),
	`action` varchar(60) NOT NULL,
	`target` varchar(120) NOT NULL,
	`before` text,
	`after` text,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` varchar(40) NOT NULL,
	`creator_id` varchar(40) NOT NULL,
	`campaign_id` varchar(40),
	`brand` varchar(120),
	`campaign_name` varchar(190),
	`platform` enum('tiktok','facebook','instagram','youtube','threads'),
	`sow` varchar(60),
	`quoted_amount` bigint,
	`closed_amount` bigint,
	`booked_on` datetime,
	`deadline` datetime,
	`status` enum('confirmed','content','posted','paid','cancelled') NOT NULL,
	`contract` enum('pending','signed'),
	`owner_email` varchar(190),
	`content_url` varchar(1024),
	`views` bigint,
	`er` decimal(5,2),
	`score` decimal(3,1),
	`evaluation_note` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_candidates` (
	`campaign_id` varchar(40) NOT NULL,
	`creator_id` varchar(40) NOT NULL,
	`sow` enum('photo','video','event','brandvideo','live'),
	`added_by` varchar(190),
	`added_at` datetime(3) NOT NULL,
	CONSTRAINT `campaign_candidates_campaign_id_creator_id_pk` PRIMARY KEY(`campaign_id`,`creator_id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_entries` (
	`campaign_id` varchar(40) NOT NULL,
	`creator_id` varchar(40) NOT NULL,
	`stage` enum('none','zalo','manager','quoted','closed') NOT NULL DEFAULT 'none',
	`added_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `campaign_entries_campaign_id_creator_id_pk` PRIMARY KEY(`campaign_id`,`creator_id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_members` (
	`campaign_id` varchar(40) NOT NULL,
	`email` varchar(190) NOT NULL,
	`added_at` datetime(3) NOT NULL,
	CONSTRAINT `campaign_members_campaign_id_email_pk` PRIMARY KEY(`campaign_id`,`email`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` varchar(40) NOT NULL,
	`name` varchar(190) NOT NULL,
	`brand` varchar(120),
	`owner_email` varchar(190) NOT NULL,
	`kpi_views` bigint,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`archived_at` datetime(3),
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`creator_id` varchar(40) NOT NULL,
	`platform` enum('tiktok','facebook','instagram','youtube','threads') NOT NULL,
	`url` varchar(1024),
	`label` varchar(190),
	`followers` bigint,
	`followers_source` enum('sheet','manual','crawler','api'),
	`followers_updated_at` datetime(3),
	CONSTRAINT `channels_creator_id_platform_pk` PRIMARY KEY(`creator_id`,`platform`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`creator_id` varchar(40) NOT NULL,
	`contact_person` varchar(190),
	`contact_channel` varchar(60),
	`contact_detail` varchar(255),
	`company_email` varchar(190),
	`company_phone` varchar(60),
	`company_website` varchar(255),
	`personal_email` varchar(190),
	`personal_phone` varchar(60),
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `contacts_creator_id` PRIMARY KEY(`creator_id`)
);
--> statement-breakpoint
CREATE TABLE `creators` (
	`id` varchar(40) NOT NULL,
	`sheet_row` int,
	`name` varchar(190) NOT NULL,
	`alias` varchar(190),
	`tier` varchar(20),
	`primary_category` varchar(80),
	`secondary_category` varchar(80),
	`creator_type` varchar(80),
	`casting_profile` varchar(190),
	`gender` varchar(20),
	`year_of_birth` smallint,
	`age_band` varchar(20),
	`base_location` varchar(120),
	`representation` varchar(190),
	`hero_platform` enum('tiktok','facebook','instagram','youtube','threads'),
	`relationship_status` varchar(40),
	`owner_email` varchar(190),
	`note` text,
	`source` enum('sheet','v2','seed') NOT NULL,
	`synced_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`deleted_at` datetime(3),
	CONSTRAINT `creators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creator_id` varchar(40) NOT NULL,
	`author_email` varchar(190),
	`author_name` varchar(120),
	`body` text NOT NULL,
	`kind` enum('','good','risk') NOT NULL DEFAULT '',
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rates` (
	`creator_id` varchar(40) NOT NULL,
	`sow` enum('photo','video','event','brandvideo','live') NOT NULL,
	`platform` enum('tiktok','facebook','instagram','youtube','threads'),
	`amount` bigint,
	`amount_text` varchar(120),
	`terms` text,
	`source` varchar(120),
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `rates_creator_id_sow_pk` PRIMARY KEY(`creator_id`,`sow`)
);
--> statement-breakpoint
CREATE TABLE `review_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creator_id` varchar(40) NOT NULL,
	`field` varchar(80) NOT NULL,
	`proposed` text,
	`source` varchar(40) NOT NULL,
	`status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
	`created_at` datetime(3) NOT NULL,
	`decided_by` varchar(190),
	`decided_at` datetime(3),
	CONSTRAINT `review_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` varchar(64) NOT NULL,
	`email` varchar(190) NOT NULL,
	`csrf` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`last_seen_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_id_hash` PRIMARY KEY(`id_hash`)
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(40) NOT NULL,
	`dry_run` int NOT NULL DEFAULT 0,
	`started_at` datetime(3) NOT NULL,
	`finished_at` datetime(3),
	`status` enum('running','ok','failed') NOT NULL,
	`rows_read` int,
	`rows_imported` int,
	`rows_skipped` int,
	`skip_reasons` text,
	`error` varchar(500),
	CONSTRAINT `sync_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`email` varchar(190) NOT NULL,
	`name` varchar(120) NOT NULL,
	`role` enum('admin','manager','planner','viewer') NOT NULL DEFAULT 'viewer',
	`last_login_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `users_email` PRIMARY KEY(`email`)
);
--> statement-breakpoint
CREATE INDEX `audit_target_idx` ON `audit_log` (`target`);--> statement-breakpoint
CREATE INDEX `bookings_creator_idx` ON `bookings` (`creator_id`);--> statement-breakpoint
CREATE INDEX `bookings_campaign_idx` ON `bookings` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `campaign_members_email_idx` ON `campaign_members` (`email`);--> statement-breakpoint
CREATE INDEX `creators_name_idx` ON `creators` (`name`);--> statement-breakpoint
CREATE INDEX `creators_sheet_row_idx` ON `creators` (`sheet_row`);--> statement-breakpoint
CREATE INDEX `notes_creator_idx` ON `notes` (`creator_id`);--> statement-breakpoint
CREATE INDEX `sessions_email_idx` ON `sessions` (`email`);
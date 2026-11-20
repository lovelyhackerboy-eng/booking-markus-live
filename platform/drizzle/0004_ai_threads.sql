CREATE TABLE `ai_threads` (
	`campaign_id` varchar(40) NOT NULL,
	`messages` text NOT NULL,
	`brief` text,
	`updated_by` varchar(190),
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `ai_threads_campaign_id` PRIMARY KEY(`campaign_id`)
);

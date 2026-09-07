CREATE TABLE `application_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`key_prefix` text NOT NULL,
	`secret_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_credentials_hash` ON `application_credentials` (`secret_hash`);
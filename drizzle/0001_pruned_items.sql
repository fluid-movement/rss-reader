CREATE TABLE `pruned_items` (
	`feed_id` text NOT NULL,
	`guid` text NOT NULL,
	`pruned_at` integer NOT NULL,
	PRIMARY KEY(`feed_id`, `guid`),
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);

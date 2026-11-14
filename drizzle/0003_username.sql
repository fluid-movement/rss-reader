ALTER TABLE `user` ADD `username` text;--> statement-breakpoint
ALTER TABLE `user` ADD `display_username` text;--> statement-breakpoint
UPDATE `user` SET `username` = lower(CASE WHEN instr(`email`, '@') > 1 THEN substr(`email`, 1, instr(`email`, '@') - 1) ELSE `email` END);--> statement-breakpoint
UPDATE `user` SET `username` = `username` || '_' || substr(`id`, 1, 8) WHERE `id` IN (
	SELECT `id` FROM (
		SELECT `id`, row_number() OVER (PARTITION BY `username` ORDER BY `created_at`, `id`) AS `rn` FROM `user`
	) WHERE `rn` > 1
);--> statement-breakpoint
UPDATE `user` SET `display_username` = `username`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);

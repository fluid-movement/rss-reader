-- Full-text search. drizzle-kit does not model virtual tables, so this is hand-written.
-- items_fts is a regular FTS5 table keyed by items.rowid, holding plain text only. The triggers
-- call the app-defined SQL function item_search_text(), registered on every connection by
-- connectDatabase() (db/connect.ts); it strips HTML (item_clean_title only removes control
-- characters, which are reserved for highlight markers) so tags and attributes are never indexed.
-- Triggers (rather than app code) keep the index correct for every writer, including later
-- UPDATEs of items.full_content, cascade deletes from feeds and retention pruning.
CREATE VIRTUAL TABLE `items_fts` USING fts5(`title`, `body`, tokenize = 'unicode61 remove_diacritics 2');
--> statement-breakpoint
CREATE TRIGGER `items_fts_ai` AFTER INSERT ON `items` BEGIN
	INSERT INTO `items_fts`(`rowid`, `title`, `body`)
	VALUES (new.`rowid`, item_clean_title(new.`title`), item_search_text(new.`content`, new.`full_content`, new.`summary`));
END;
--> statement-breakpoint
CREATE TRIGGER `items_fts_au` AFTER UPDATE OF `title`, `content`, `full_content`, `summary` ON `items` BEGIN
	DELETE FROM `items_fts` WHERE `rowid` = old.`rowid`;
	INSERT INTO `items_fts`(`rowid`, `title`, `body`)
	VALUES (new.`rowid`, item_clean_title(new.`title`), item_search_text(new.`content`, new.`full_content`, new.`summary`));
END;
--> statement-breakpoint
CREATE TRIGGER `items_fts_ad` AFTER DELETE ON `items` BEGIN
	DELETE FROM `items_fts` WHERE `rowid` = old.`rowid`;
END;
--> statement-breakpoint
INSERT INTO `items_fts`(`rowid`, `title`, `body`)
SELECT `rowid`, item_clean_title(`title`), item_search_text(`content`, `full_content`, `summary`) FROM `items`;

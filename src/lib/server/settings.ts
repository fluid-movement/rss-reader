import { and, eq } from 'drizzle-orm';
import type { AppDatabase } from './db/connect';
import { feeds, userSettings } from './db/schema';
import { cleanSingleLine } from './clean-text';
import { DEFAULT_RETENTION_DAYS } from './retention';
import {
	FEED_TITLE_MAX,
	FONT_SIZE_RANGE,
	READER_WIDTH_RANGE,
	REFRESH_PRESETS,
	RETENTION_DAYS_MAX
} from '#lib/settings-limits.ts';

export class SettingsValidationError extends Error {}
/** A feed id that does not exist or belongs to someone else; callers answer 404. */
export class FeedNotFoundError extends Error {}

export interface UserPrefs {
	retentionDays: number;
	readerFontSize: number;
	readerWidth: number;
}
export const DEFAULT_PREFS: UserPrefs = {
	retentionDays: DEFAULT_RETENTION_DAYS,
	readerFontSize: 18,
	readerWidth: 720
};

/** Strict integer parse: rejects '', '12abc', '1.5', '1e3' and values outside the range. */
export function parseIntegerInRange(
	value: unknown,
	min: number,
	max: number,
	label: string
): number {
	const text = typeof value === 'string' ? value.trim() : '';
	if (!/^\d{1,6}$/.test(text))
		throw new SettingsValidationError(`${label} must be a whole number.`);
	const number = Number(text);
	if (number < min || number > max)
		throw new SettingsValidationError(`${label} must be between ${min} and ${max}.`);
	return number;
}

export function getUserPrefs(db: AppDatabase, userId: string): UserPrefs {
	const row = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
	return row
		? {
				retentionDays: row.retentionDays,
				readerFontSize: row.readerFontSize,
				readerWidth: row.readerWidth
			}
		: { ...DEFAULT_PREFS };
}

function savePrefs(db: AppDatabase, userId: string, patch: Partial<UserPrefs>) {
	db.insert(userSettings)
		.values({ userId, ...patch })
		.onConflictDoUpdate({ target: userSettings.userId, set: patch })
		.run();
}

export function updateReaderPrefs(
	db: AppDatabase,
	userId: string,
	input: { fontSize: unknown; width: unknown }
) {
	const readerFontSize = parseIntegerInRange(
		input.fontSize,
		FONT_SIZE_RANGE.min,
		FONT_SIZE_RANGE.max,
		'Font size'
	);
	const readerWidth = parseIntegerInRange(
		input.width,
		READER_WIDTH_RANGE.min,
		READER_WIDTH_RANGE.max,
		'Content width'
	);
	savePrefs(db, userId, { readerFontSize, readerWidth });
}

/** 0 keeps everything. */
export function updateRetentionDays(db: AppDatabase, userId: string, value: unknown) {
	savePrefs(db, userId, {
		retentionDays: parseIntegerInRange(value, 0, RETENTION_DAYS_MAX, 'Retention')
	});
}

export function updateFeedSettings(
	db: AppDatabase,
	userId: string,
	feedId: string,
	input: { title: unknown; refreshIntervalMinutes: unknown; extractFullText: boolean }
) {
	const title = cleanSingleLine(input.title);
	if (!title || title.length > FEED_TITLE_MAX)
		throw new SettingsValidationError(`Enter a feed title of 1–${FEED_TITLE_MAX} characters.`);
	const minutes = Number(
		typeof input.refreshIntervalMinutes === 'string' ? input.refreshIntervalMinutes.trim() : NaN
	);
	const feed = db
		.select({
			id: feeds.id,
			lastFetchedAt: feeds.lastFetchedAt,
			refreshIntervalMinutes: feeds.refreshIntervalMinutes
		})
		.from(feeds)
		.where(and(eq(feeds.id, typeof feedId === 'string' ? feedId : ''), eq(feeds.userId, userId)))
		.get();
	if (!feed) throw new FeedNotFoundError('Feed not found.');
	// Presets only, except that a feed created with another interval (OPML, older data) may keep it.
	if (
		!REFRESH_PRESETS.some((preset) => preset.minutes === minutes) &&
		minutes !== feed.refreshIntervalMinutes
	)
		throw new SettingsValidationError('Choose one of the listed refresh intervals.');
	// Re-time the next fetch from the last one so the new interval takes effect right away.
	db.update(feeds)
		.set({
			title,
			refreshIntervalMinutes: minutes,
			extractFullText: input.extractFullText,
			...(feed.lastFetchedAt
				? { nextFetchAt: new Date(feed.lastFetchedAt.getTime() + minutes * 60_000) }
				: {})
		})
		.where(and(eq(feeds.id, feed.id), eq(feeds.userId, userId)))
		.run();
}

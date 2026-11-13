import { sql } from 'drizzle-orm';
import type { AppDatabase } from './db/connect';
import type { HighlightSegment } from '#lib/reader.ts';

export const MAX_QUERY_LENGTH = 200;
export const MAX_QUERY_TERMS = 10;
const MAX_TERM_LENGTH = 50;
const MARK_START = '\u0001';
const MARK_END = '\u0002';

/** Search terms of user input: runs of letters, digits and combining marks (any script). */
export function searchTerms(raw: string): string[] {
	return (
		raw
			.slice(0, MAX_QUERY_LENGTH)
			.normalize('NFKC')
			.match(/[\p{L}\p{N}\p{M}]+/gu) ?? []
	)
		.slice(0, MAX_QUERY_TERMS)
		.map((term) => term.slice(0, MAX_TERM_LENGTH));
}

/** The trimmed, length-capped query as shown back in the search box. */
export function normalizeQuery(raw: string | null | undefined): string {
	return (raw ?? '').slice(0, MAX_QUERY_LENGTH).trim();
}

/**
 * FTS5 MATCH expression for user input, or null when there is nothing to search for.
 * User text never reaches MATCH raw: only letter/digit runs survive, and each is emitted as a
 * double-quoted string (so AND/OR/NOT/NEAR, `-`, `:`, `*`, parentheses are inert words). The
 * last term is a prefix match so results appear while typing. Terms are ANDed.
 */
export function buildMatch(raw: string | null | undefined): string | null {
	const terms = searchTerms(raw ?? '');
	if (!terms.length) return null;
	return terms.map((term, index) => `"${term}"${index === terms.length - 1 ? '*' : ''}`).join(' ');
}

function segments(text: string): HighlightSegment[] {
	const parts: HighlightSegment[] = [];
	let match = false;
	let current = '';
	// Delimiters alternate start/end; the text between them is data, never markup.
	for (const char of text) {
		if (char !== MARK_START && char !== MARK_END) {
			current += char;
			continue;
		}
		if (current) parts.push({ text: current, match });
		current = '';
		match = char === MARK_START;
	}
	if (current) parts.push({ text: current, match });
	return parts;
}

/*
 * Scaling note: results are ordered by date, so a page query evaluates the whole match set
 * (every item matching the term, for this user) and sorts it before applying LIMIT. That is
 * instant for rare terms but measured at roughly 80-130 ms for very common terms at ~50k items.
 * If that ever matters: cap the candidate set (for example the newest N matches) or require a
 * minimum length for the final prefix term. Behavior is intentionally unchanged for now.
 */

/**
 * Highlight data for the given items under a match expression. Returned as plain text
 * segments (not HTML), so callers render them with normal escaping.
 */
export function getHighlights(
	db: AppDatabase,
	match: string,
	itemIds: string[]
): Map<string, { title: HighlightSegment[]; snippet: HighlightSegment[] }> {
	const result = new Map<string, { title: HighlightSegment[]; snippet: HighlightSegment[] }>();
	if (!itemIds.length) return result;
	const rows = db.all<{ id: string; title: string; snippet: string }>(sql`
		select items.id as id,
			highlight(items_fts, 0, ${MARK_START}, ${MARK_END}) as title,
			snippet(items_fts, 1, ${MARK_START}, ${MARK_END}, '…', 24) as snippet
		from items_fts
		join items on items.rowid = items_fts.rowid
		where items_fts match ${match}
			and items.id in (${sql.join(
				itemIds.map((id) => sql`${id}`),
				sql`, `
			)})`);
	for (const row of rows) {
		const snippet = segments(row.snippet ?? '');
		result.set(row.id, {
			title: segments(row.title ?? ''),
			// A snippet without a highlighted term adds nothing over the regular summary.
			snippet: snippet.some((part) => part.match) ? snippet : []
		});
	}
	return result;
}

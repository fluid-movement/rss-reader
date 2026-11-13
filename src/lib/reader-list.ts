import type { ArticlePreview } from './reader.ts';

/**
 * Newest-first order used by the server (published/fetched time, then id). Inserts the open
 * article when the loaded pages do not contain it, so it stays listed (for example in Unread
 * after being read, or when it sits beyond the loaded pages) until navigation away.
 */
export function withOpenArticle<T extends ArticlePreview>(list: T[], open: T | undefined): T[] {
	if (!open || list.some((article) => article.id === open.id)) return list;
	const at = list.findIndex(
		(article) =>
			article.sortAt.getTime() < open.sortAt.getTime() ||
			(article.sortAt.getTime() === open.sortAt.getTime() && article.id > open.id)
	);
	const merged = [...list];
	merged.splice(at === -1 ? merged.length : at, 0, open);
	return merged;
}

export const EXTRA_PAGE_SIZE = 100;

/**
 * Reloads `count` articles that follow `after`, in requests of at most `pageSize` each
 * (the server clamps larger limits). Stops early when the view has no more articles.
 */
export async function loadChunked<T extends ArticlePreview>(
	fetchPage: (after: T, limit: number) => Promise<{ articles: T[]; hasMore: boolean }>,
	after: T,
	count: number,
	pageSize = EXTRA_PAGE_SIZE
): Promise<{ articles: T[]; hasMore: boolean }> {
	const articles: T[] = [];
	let hasMore = true;
	let cursor = after;
	while (articles.length < count && hasMore) {
		const page = await fetchPage(cursor, Math.min(pageSize, count - articles.length));
		articles.push(...page.articles);
		hasMore = page.hasMore;
		const last = page.articles.at(-1);
		if (!last) {
			hasMore = false;
			break;
		}
		cursor = last;
	}
	return { articles, hasMore };
}

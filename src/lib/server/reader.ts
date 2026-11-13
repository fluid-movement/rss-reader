import { and, asc, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type {
	ArticleCursor,
	ArticlePreview,
	ReaderData,
	ReaderItem,
	ReaderView
} from '#lib/reader.ts';
import type { AppDatabase } from './db/connect';
import { feeds, folders, items, itemState } from './db/schema';
import { articleSummary, sanitizeArticle, webUrl } from './reader-content';

/** One grouped query: unread items per feed (folder and total sums are derived by callers). */
export function getUnreadCounts(db: AppDatabase, userId: string): Record<string, number> {
	const rows = db
		.select({ feedId: items.feedId, count: sql<number>`count(*)` })
		.from(items)
		.innerJoin(feeds, eq(items.feedId, feeds.id))
		.leftJoin(itemState, and(eq(itemState.itemId, items.id), eq(itemState.userId, userId)))
		.where(and(eq(feeds.userId, userId), isNull(itemState.readAt)))
		.groupBy(items.feedId)
		.all();
	return Object.fromEntries(rows.map((row) => [row.feedId, row.count]));
}

/** Throws 404 when the feed or folder is not owned by the user. */
export function assertViewOwned(db: AppDatabase, userId: string, view: ReaderView, id?: string) {
	if (view === 'feed') {
		const feed = db
			.select({ title: feeds.title })
			.from(feeds)
			.where(and(eq(feeds.id, id ?? ''), eq(feeds.userId, userId)))
			.get();
		if (!feed) error(404, 'Feed not found');
		return feed.title;
	}
	if (view === 'folder') {
		const folder = db
			.select({ name: folders.name })
			.from(folders)
			.where(and(eq(folders.id, id ?? ''), eq(folders.userId, userId)))
			.get();
		if (!folder) error(404, 'Folder not found');
		return folder.name;
	}
	return null;
}

/** Row filter for a view; always includes ownership through the feed. */
export function viewScope(userId: string, view: ReaderView, id?: string) {
	return and(
		eq(feeds.userId, userId),
		view === 'feed' ? eq(feeds.id, id ?? '') : undefined,
		view === 'folder' ? eq(feeds.folderId, id ?? '') : undefined,
		view === 'unread' ? isNull(itemState.readAt) : undefined,
		view === 'starred' ? isNotNull(itemState.starredAt) : undefined
	);
}

/** Total starred items (one count query). */
export function getStarredCount(db: AppDatabase, userId: string): number {
	return (
		db
			.select({ count: sql<number>`count(*)` })
			.from(itemState)
			.innerJoin(items, eq(itemState.itemId, items.id))
			.innerJoin(feeds, eq(items.feedId, feeds.id))
			.where(
				and(eq(itemState.userId, userId), eq(feeds.userId, userId), isNotNull(itemState.starredAt))
			)
			.get()?.count ?? 0
	);
}

export function getShellData(db: AppDatabase, userId: string) {
	return {
		unread: getUnreadCounts(db, userId),
		starred: getStarredCount(db, userId),
		feeds: db
			.select({ id: feeds.id, title: feeds.title, folderId: feeds.folderId })
			.from(feeds)
			.where(eq(feeds.userId, userId))
			.orderBy(asc(feeds.title))
			.all(),
		folders: db
			.select({ id: folders.id, name: folders.name })
			.from(folders)
			.where(eq(folders.userId, userId))
			.orderBy(asc(folders.name))
			.all()
	};
}

/** Items per list page; further pages are loaded on demand. */
export const LIST_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

const sortExpr = sql`coalesce(${items.publishedAt}, ${items.fetchedAt})`;
const stateJoin = (userId: string) =>
	and(eq(itemState.itemId, items.id), eq(itemState.userId, userId));
const preview = {
	id: items.id,
	title: items.title,
	summary: items.summary,
	feedId: feeds.id,
	feedTitle: feeds.title,
	publishedAt: items.publishedAt,
	sortAt: sql<number>`coalesce(${items.publishedAt}, ${items.fetchedAt})`.mapWith(
		(value: number) => new Date(value)
	),
	read: sql<number>`${itemState.readAt} is not null`.mapWith(Boolean),
	starred: sql<number>`${itemState.starredAt} is not null`.mapWith(Boolean)
};

/**
 * One page of a view, newest first (stable tie-break on id). `after` continues from the last
 * item of the previous page. The open article is not special-cased here: the client merges it.
 */
export function getArticlePage(
	db: AppDatabase,
	userId: string,
	selection: { view: ReaderView; id?: string },
	options: { after?: ArticleCursor; limit?: number } = {}
): { articles: ArticlePreview[]; hasMore: boolean } {
	const limit = Math.min(Math.max(1, Math.floor(options.limit ?? LIST_PAGE_SIZE)), MAX_PAGE_SIZE);
	const { after } = options;
	const rows = db
		.select(preview)
		.from(items)
		.innerJoin(feeds, eq(items.feedId, feeds.id))
		.leftJoin(itemState, stateJoin(userId))
		.where(
			and(
				viewScope(userId, selection.view, selection.id),
				after
					? or(
							sql`${sortExpr} < ${after.sortAt}`,
							and(sql`${sortExpr} = ${after.sortAt}`, sql`${items.id} > ${after.id}`)
						)
					: undefined
			)
		)
		.orderBy(desc(sortExpr), asc(items.id))
		.limit(limit + 1)
		.all();
	return {
		articles: rows
			.slice(0, limit)
			.map((article) => ({ ...article, summary: articleSummary(article.summary) })),
		hasMore: rows.length > limit
	};
}

/** The view's first page plus title/ownership. Throws 404 for a feed or folder the user does not own. */
export function getReaderData(
	db: AppDatabase,
	userId: string,
	selection: { view: ReaderView; id?: string }
): ReaderData {
	const { view, id } = selection;
	let viewTitle = {
		all: 'All articles',
		unread: 'Unread',
		starred: 'Starred',
		feed: '',
		folder: ''
	}[view];
	const ownedTitle = assertViewOwned(db, userId, view, id);
	if (ownedTitle !== null) viewTitle = ownedTitle;
	return {
		view,
		viewTitle,
		viewId: id ?? null,
		listPath: view === 'all' ? '/' : `/${view}${id ? `/${encodeURIComponent(id)}` : ''}`,
		...getArticlePage(db, userId, selection),
		hasFeeds: !!db
			.select({ id: feeds.id })
			.from(feeds)
			.where(eq(feeds.userId, userId))
			.limit(1)
			.get()
	};
}

/**
 * One article with sanitized content. Feed and folder views require membership; Unread and
 * Starred accept any owned article so the open one stays reachable after its state changes.
 */
export function getSelectedItem(
	db: AppDatabase,
	userId: string,
	selection: { view: ReaderView; id?: string; itemId: string }
): ReaderItem {
	const { view, id, itemId } = selection;
	assertViewOwned(db, userId, view, id);
	const scope =
		view === 'unread' || view === 'starred'
			? eq(feeds.userId, userId)
			: viewScope(userId, view, id);
	const item = db
		.select({
			...preview,
			author: items.author,
			link: items.link,
			content: items.content,
			fullContent: items.fullContent
		})
		.from(items)
		.innerJoin(feeds, eq(items.feedId, feeds.id))
		.leftJoin(itemState, stateJoin(userId))
		.where(and(scope, eq(items.id, itemId)))
		.get();
	if (!item) error(404, 'Article not found in this view');
	return {
		id: item.id,
		title: item.title,
		summary: articleSummary(item.summary),
		feedId: item.feedId,
		feedTitle: item.feedTitle,
		publishedAt: item.publishedAt,
		sortAt: item.sortAt,
		read: item.read,
		starred: item.starred,
		author: item.author,
		link: webUrl(item.link),
		sanitizedContent: sanitizeArticle(item.content || item.summary, item.link),
		// Stored full text is re-sanitized: the database is not a trust boundary.
		sanitizedFullContent: item.fullContent ? sanitizeArticle(item.fullContent, item.link) : null
	};
}

import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { ReaderData, ReaderView } from '#lib/reader.ts';
import type { AppDatabase } from './db/connect';
import { feeds, folders, items, itemState } from './db/schema';
import { articleSummary, sanitizeArticle, webUrl } from './reader-content';

export interface ReaderSelection {
	view: ReaderView;
	id?: string;
	itemId?: string;
}

export function getShellData(db: AppDatabase, userId: string) {
	return {
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

export function getReaderData(
	db: AppDatabase,
	userId: string,
	selection: ReaderSelection
): ReaderData {
	const { view, id, itemId } = selection;
	let viewTitle = {
		all: 'All articles',
		unread: 'Unread',
		starred: 'Starred',
		feed: '',
		folder: ''
	}[view];
	if (view === 'feed') {
		const feed = db
			.select()
			.from(feeds)
			.where(and(eq(feeds.id, id ?? ''), eq(feeds.userId, userId)))
			.get();
		if (!feed) error(404, 'Feed not found');
		viewTitle = feed.title;
	}
	if (view === 'folder') {
		const folder = db
			.select()
			.from(folders)
			.where(and(eq(folders.id, id ?? ''), eq(folders.userId, userId)))
			.get();
		if (!folder) error(404, 'Folder not found');
		viewTitle = folder.name;
	}
	const scope = and(
		eq(feeds.userId, userId),
		view === 'feed' ? eq(feeds.id, id ?? '') : undefined,
		view === 'folder' ? eq(feeds.folderId, id ?? '') : undefined,
		view === 'unread' ? isNull(itemState.readAt) : undefined,
		view === 'starred' ? isNotNull(itemState.starredAt) : undefined
	);
	const stateJoin = and(eq(itemState.itemId, items.id), eq(itemState.userId, userId));
	const preview = {
		id: items.id,
		title: items.title,
		summary: items.summary,
		feedId: feeds.id,
		feedTitle: feeds.title,
		publishedAt: items.publishedAt
	};
	const articles = db
		.select(preview)
		.from(items)
		.innerJoin(feeds, eq(items.feedId, feeds.id))
		.leftJoin(itemState, stateJoin)
		.where(scope)
		.orderBy(desc(sql`coalesce(${items.publishedAt}, ${items.fetchedAt})`), asc(items.id))
		.all()
		.map((article) => ({ ...article, summary: articleSummary(article.summary) }));
	let selectedItem: ReaderData['selectedItem'] = null;
	if (itemId) {
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
			.leftJoin(itemState, stateJoin)
			.where(and(scope, eq(items.id, itemId)))
			.get();
		if (!item) error(404, 'Article not found in this view');
		selectedItem = {
			id: item.id,
			title: item.title,
			summary: articleSummary(item.summary),
			feedId: item.feedId,
			feedTitle: item.feedTitle,
			publishedAt: item.publishedAt,
			author: item.author,
			link: webUrl(item.link),
			sanitizedContent: sanitizeArticle(item.fullContent || item.content || item.summary, item.link)
		};
	}
	return {
		view,
		viewTitle,
		listPath: view === 'all' ? '/' : `/${view}${id ? `/${encodeURIComponent(id)}` : ''}`,
		articles,
		selectedItem,
		hasFeeds: !!db
			.select({ id: feeds.id })
			.from(feeds)
			.where(eq(feeds.userId, userId))
			.limit(1)
			.get()
	};
}

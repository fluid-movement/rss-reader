export type ReaderView = 'all' | 'unread' | 'starred' | 'feed' | 'folder' | 'search';

export interface ArticlePreview {
	id: string;
	title: string;
	summary: string | null;
	feedId: string;
	feedTitle: string;
	/** The original web link, null when the item has none. */
	link: string | null;
	publishedAt: Date | null;
	/** publishedAt, falling back to when the item was fetched. */
	sortAt: Date;
	read: boolean;
	starred: boolean;
	/** Search results only: the title / a body excerpt with matched terms flagged (plain text). */
	titleParts?: HighlightSegment[];
	snippetParts?: HighlightSegment[];
}

export interface HighlightSegment {
	text: string;
	match: boolean;
}

/** Position in a view's newest-first ordering; the next page starts after it. */
export interface ArticleCursor {
	sortAt: number;
	id: string;
}

export interface ReaderItem extends ArticlePreview {
	author: string | null;
	link: string | null;
	/** Feed-provided content (or summary), sanitized. */
	sanitizedContent: string;
	/** Extracted full article, sanitized; null when not loaded. */
	sanitizedFullContent: string | null;
}

/** List-level data, loaded by the view layout and kept while articles are opened. */
export interface ReaderData {
	view: ReaderView;
	viewTitle: string;
	listPath: string;
	viewId: string | null;
	/** Search view only: the (normalized) query. */
	query: string | null;
	/** First page only; see getArticlePage for continuation. */
	articles: ArticlePreview[];
	hasMore: boolean;
	hasFeeds: boolean;
}

/** Page data of a nested item route (merged with the layout's ReaderData). */
export type ReaderItemData = ReaderData & { selectedItem: ReaderItem };

export interface ShellData {
	user: { id: string; name: string; email: string };
	collapsedFolders: string[];
	feeds: {
		id: string;
		title: string;
		folderId: string | null;
		errorCount: number;
		lastError: string | null;
	}[];
	/** Total starred articles. */
	starred: number;
	/** Unread item count per feed id (feeds with none are absent). */
	unread: Record<string, number>;
	folders: { id: string; name: string }[];
}

/** Match the broken-feed threshold on Manage feeds; only return safe stored text. */
export function feedFailure(feed: { errorCount: number; lastError: string | null } | undefined) {
	return feed && feed.errorCount >= 3
		? feed.lastError || 'Could not fetch this feed. Try again.'
		: null;
}

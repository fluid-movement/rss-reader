export type ReaderView = 'all' | 'unread' | 'starred' | 'feed' | 'folder';

export interface ArticlePreview {
	id: string;
	title: string;
	summary: string | null;
	feedId: string;
	feedTitle: string;
	publishedAt: Date | null;
	/** publishedAt, falling back to when the item was fetched. */
	sortAt: Date;
	read: boolean;
	starred: boolean;
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
	/** First page only; see getArticlePage for continuation. */
	articles: ArticlePreview[];
	hasMore: boolean;
	hasFeeds: boolean;
}

/** Page data of a nested item route (merged with the layout's ReaderData). */
export type ReaderItemData = ReaderData & { selectedItem: ReaderItem };

export interface ShellData {
	user: { name: string; email: string };
	feeds: { id: string; title: string; folderId: string | null }[];
	/** Total starred articles. */
	starred: number;
	/** Unread item count per feed id (feeds with none are absent). */
	unread: Record<string, number>;
	folders: { id: string; name: string }[];
}

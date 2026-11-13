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

export interface ReaderData {
	view: ReaderView;
	viewTitle: string;
	listPath: string;
	viewId: string | null;
	articles: ArticlePreview[];
	selectedItem:
		| (ArticlePreview & {
				author: string | null;
				link: string | null;
				sanitizedContent: string;
		  })
		| null;
	hasFeeds: boolean;
}

export interface ShellData {
	user: { name: string; email: string };
	feeds: { id: string; title: string; folderId: string | null }[];
	/** Unread item count per feed id (feeds with none are absent). */
	unread: Record<string, number>;
	folders: { id: string; name: string }[];
}

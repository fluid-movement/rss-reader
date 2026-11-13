export type ReaderView = 'all' | 'unread' | 'starred' | 'feed' | 'folder';

export interface ArticlePreview {
	id: string;
	title: string;
	summary: string | null;
	feedId: string;
	feedTitle: string;
	publishedAt: Date | null;
}

export interface ReaderData {
	view: ReaderView;
	viewTitle: string;
	listPath: string;
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
	folders: { id: string; name: string }[];
}

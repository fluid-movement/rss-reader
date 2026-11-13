import { error, json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { assertViewOwned, getArticlePage, LIST_PAGE_SIZE } from '#lib/server/reader.ts';
import type { ReaderView } from '#lib/reader.ts';
import type { RequestHandler } from './$types';

const VIEWS: ReaderView[] = ['all', 'unread', 'starred', 'feed', 'folder'];

/**
 * Next page of a view's article list, continuing after a cursor. Read-only and always
 * scoped to locals.user. Dates are returned as epoch milliseconds.
 */
export const GET: RequestHandler = ({ locals, url }) => {
	if (!locals.user) error(401, 'Sign in to continue.');
	const view = url.searchParams.get('view') ?? '';
	if (!VIEWS.includes(view as ReaderView)) error(400, 'Invalid view.');
	const id = url.searchParams.get('id') ?? undefined;
	if ((view === 'feed' || view === 'folder') && !id) error(400, 'Missing view id.');
	const rawSortAt = url.searchParams.get('afterSortAt');
	const afterSortAt = Number(rawSortAt);
	const afterId = url.searchParams.get('afterId') ?? '';
	if (!rawSortAt || !Number.isFinite(afterSortAt) || !afterId) error(400, 'Invalid cursor.');
	const limit = Number(url.searchParams.get('limit') ?? LIST_PAGE_SIZE);
	if (!Number.isInteger(limit) || limit < 1) error(400, 'Invalid limit.');
	assertViewOwned(db, locals.user.id, view as ReaderView, id);
	const page = getArticlePage(
		db,
		locals.user.id,
		{ view: view as ReaderView, id },
		{ after: { sortAt: afterSortAt, id: afterId }, limit }
	);
	return json({
		hasMore: page.hasMore,
		articles: page.articles.map((article) => ({
			...article,
			publishedAt: article.publishedAt?.getTime() ?? null,
			sortAt: article.sortAt.getTime()
		}))
	});
};

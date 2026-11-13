import { describe, expect, it } from 'vitest';
import { loadChunked, withOpenArticle } from './reader-list.ts';
import type { ArticlePreview } from './reader.ts';

const article = (id: string, day: number): ArticlePreview => ({
	id,
	title: id,
	summary: null,
	feedId: 'f',
	feedTitle: 'Feed',
	link: null,
	publishedAt: null,
	sortAt: new Date(Date.UTC(2026, 0, day)),
	read: false,
	starred: false
});

describe('withOpenArticle', () => {
	const list = [article('c', 30), article('b', 20), article('a', 10)];
	it('returns the same list when the open article is listed or absent', () => {
		expect(withOpenArticle(list, list[1])).toBe(list);
		expect(withOpenArticle(list, undefined)).toBe(list);
	});
	it('inserts a missing article in newest-first position', () => {
		expect(withOpenArticle(list, article('x', 25)).map((a) => a.id)).toEqual(['c', 'x', 'b', 'a']);
		expect(withOpenArticle(list, article('y', 40)).map((a) => a.id)).toEqual(['y', 'c', 'b', 'a']);
	});
	it('appends an article older than everything loaded', () => {
		expect(withOpenArticle(list, article('z', 1)).map((a) => a.id)).toEqual(['c', 'b', 'a', 'z']);
	});
	it('breaks timestamp ties by id like the server', () => {
		expect(withOpenArticle(list, article('bb', 20)).map((a) => a.id)).toEqual([
			'c',
			'b',
			'bb',
			'a'
		]);
	});
});

describe('loadChunked', () => {
	const all = Array.from({ length: 450 }, (_, index) =>
		article(`id${String(index).padStart(3, '0')}`, 1)
	);
	const calls: number[] = [];
	const fetchPage = async (after: ArticlePreview, limit: number) => {
		calls.push(limit);
		const start = after ? all.findIndex((a) => a.id === after.id) + 1 : 0;
		return { articles: all.slice(start, start + limit), hasMore: start + limit < all.length };
	};
	it('reloads a large count in bounded requests, in order and without duplicates', async () => {
		calls.length = 0;
		const result = await loadChunked(fetchPage, all[0], 350);
		expect(calls).toEqual([100, 100, 100, 50]);
		expect(result.articles.map((a) => a.id)).toEqual(all.slice(1, 351).map((a) => a.id));
		expect(result.hasMore).toBe(true);
	});
	it('stops when the view runs out and reports no more', async () => {
		calls.length = 0;
		const result = await loadChunked(fetchPage, all[400], 300);
		expect(result.articles).toHaveLength(49);
		expect(result.hasMore).toBe(false);
		expect(calls).toEqual([100]);
	});
});

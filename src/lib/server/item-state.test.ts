import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import { feeds, folders, items, itemState, user } from './db/schema';
import { markViewRead, setItemState } from './item-state';
import { getReaderData, getSelectedItem, getShellData } from './reader';

let connection: ReturnType<typeof connectDatabase>;
const NOW = new Date('2026-11-13T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

beforeEach(() => {
	connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	const db = connection.db;
	db.insert(user)
		.values([
			{ id: 'a', name: 'A', email: 'a@example.com' },
			{ id: 'b', name: 'B', email: 'b@example.com' }
		])
		.run();
	db.insert(folders).values({ id: 'f', userId: 'a', name: 'Folder' }).run();
	db.insert(feeds)
		.values([
			{ id: 'f1', userId: 'a', title: 'One', url: 'https://1.example/rss', folderId: 'f' },
			{ id: 'f2', userId: 'a', title: 'Two', url: 'https://2.example/rss', folderId: 'f' },
			{ id: 'f3', userId: 'a', title: 'Three', url: 'https://3.example/rss' },
			{ id: 'fb', userId: 'b', title: 'Bee', url: 'https://b.example/rss' }
		])
		.run();
	db.insert(items)
		.values([
			{ id: 'i1', feedId: 'f1', guid: '1', title: 'New', publishedAt: day(0) },
			{ id: 'i2', feedId: 'f1', guid: '2', title: 'Week', publishedAt: day(8) },
			{ id: 'i3', feedId: 'f2', guid: '3', title: 'Month', publishedAt: day(40) },
			{ id: 'i4', feedId: 'f3', guid: '4', title: 'Undated', publishedAt: null, fetchedAt: day(3) },
			{ id: 'ib', feedId: 'fb', guid: '5', title: 'Private', publishedAt: day(50) }
		])
		.run();
});
afterEach(() => connection.client.close());

const state = (userId: string, itemId: string) =>
	connection.db
		.select()
		.from(itemState)
		.all()
		.find((row) => row.userId === userId && row.itemId === itemId);

describe('unread counts', () => {
	it('groups per feed, drops read items, and never counts other users', () => {
		expect(getShellData(connection.db, 'a').unread).toEqual({ f1: 2, f2: 1, f3: 1 });
		setItemState(connection.db, 'a', 'i1', { read: true });
		expect(getShellData(connection.db, 'a').unread).toEqual({ f1: 1, f2: 1, f3: 1 });
		expect(getShellData(connection.db, 'b').unread).toEqual({ fb: 1 });
	});
});

describe('setItemState', () => {
	it('reads, unreads, stars and unstars independently and idempotently', () => {
		const db = connection.db;
		expect(setItemState(db, 'a', 'i1', { read: true })).toBe(true);
		expect(setItemState(db, 'a', 'i1', { read: true })).toBe(true);
		expect(setItemState(db, 'a', 'i1', { starred: true })).toBe(true);
		expect(state('a', 'i1')?.readAt).toBeInstanceOf(Date);
		expect(state('a', 'i1')?.starredAt).toBeInstanceOf(Date);
		setItemState(db, 'a', 'i1', { read: false });
		expect(state('a', 'i1')?.readAt).toBeNull();
		expect(state('a', 'i1')?.starredAt).toBeInstanceOf(Date);
		setItemState(db, 'a', 'i1', { starred: false });
		expect(state('a', 'i1')?.starredAt).toBeNull();
		expect(db.select().from(itemState).all()).toHaveLength(1);
	});
	it('refuses items owned by another user and writes nothing', () => {
		expect(setItemState(connection.db, 'a', 'ib', { read: true })).toBe(false);
		expect(setItemState(connection.db, 'a', 'missing', { starred: true })).toBe(false);
		expect(connection.db.select().from(itemState).all()).toHaveLength(0);
	});
});

describe('markViewRead', () => {
	it('marks everything in a feed, folder or all, only for the current user', () => {
		expect(markViewRead(connection.db, 'a', { view: 'feed', id: 'f1' })).toBe(2);
		expect(markViewRead(connection.db, 'a', { view: 'folder', id: 'f' })).toBe(1);
		expect(markViewRead(connection.db, 'a', { view: 'all' })).toBe(1);
		expect(getShellData(connection.db, 'a').unread).toEqual({});
		expect(getShellData(connection.db, 'b').unread).toEqual({ fb: 1 });
		expect(state('b', 'ib')).toBeUndefined();
	});
	it('marks only items older than N days, using fetch time for undated items', () => {
		const run = (olderThanDays: number) =>
			markViewRead(connection.db, 'a', { view: 'all', olderThanDays, now: NOW });
		expect(run(30)).toBe(1); // i3
		expect(run(7)).toBe(1); // i2
		expect(run(1)).toBe(1); // i4 fetched 3 days ago
		expect(getShellData(connection.db, 'a').unread).toEqual({ f1: 1 });
	});
	it('does not touch starred state and keeps existing starred rows', () => {
		setItemState(connection.db, 'a', 'i2', { starred: true });
		markViewRead(connection.db, 'a', { view: 'starred' });
		expect(state('a', 'i2')?.readAt).toBeInstanceOf(Date);
		expect(state('a', 'i2')?.starredAt).toBeInstanceOf(Date);
		expect(state('a', 'i1')).toBeUndefined();
	});
	it('rejects feeds and folders the user does not own', () => {
		expect(() => markViewRead(connection.db, 'a', { view: 'feed', id: 'fb' })).toThrow();
		expect(() => markViewRead(connection.db, 'b', { view: 'folder', id: 'f' })).toThrow();
		expect(connection.db.select().from(itemState).all()).toHaveLength(0);
	});
});

describe('views and the open article', () => {
	it('drops a just-read item from the Unread list but still serves it as the open article', () => {
		setItemState(connection.db, 'a', 'i1', { read: true });
		const list = getReaderData(connection.db, 'a', { view: 'unread' });
		expect(list.articles.map((article) => article.id)).not.toContain('i1');
		const open = getSelectedItem(connection.db, 'a', { view: 'unread', itemId: 'i1' });
		expect(open.read).toBe(true);
	});
	it('serves an unstarred item as the open article in Starred', () => {
		setItemState(connection.db, 'a', 'i2', { starred: true });
		setItemState(connection.db, 'a', 'i2', { starred: false });
		expect(getReaderData(connection.db, 'a', { view: 'starred' }).articles).toEqual([]);
		expect(getSelectedItem(connection.db, 'a', { view: 'starred', itemId: 'i2' }).starred).toBe(
			false
		);
	});
	it('still rejects an article outside the view', () => {
		expect(() => getSelectedItem(connection.db, 'a', { view: 'unread', itemId: 'ib' })).toThrow();
	});
});

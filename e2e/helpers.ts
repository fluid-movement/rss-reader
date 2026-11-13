import { expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { FIXTURE_USER } from './fixture';

export interface Point {
	x: number;
	y: number;
}

const sessions = new WeakMap<Page, Promise<CDPSession>>();
function cdp(page: Page) {
	let session = sessions.get(page);
	if (!session) {
		session = page.context().newCDPSession(page);
		sessions.set(page, session);
	}
	return session;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A real touch gesture through CDP Input.dispatchTouchEvent, so touch AND pointer events fire as
 * on a device. Coordinates are CSS px in the viewport.
 */
export async function swipe(
	page: Page,
	from: Point,
	to: Point,
	{ steps = 10, stepMs = 12 }: { steps?: number; stepMs?: number } = {}
) {
	const session = await cdp(page);
	const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: Point) =>
		session.send('Input.dispatchTouchEvent', {
			type,
			touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : []
		});
	await touch('touchStart', from);
	for (let i = 1; i <= steps; i++) {
		await sleep(stepMs);
		await touch('touchMove', {
			x: from.x + ((to.x - from.x) * i) / steps,
			y: from.y + ((to.y - from.y) * i) / steps
		});
	}
	await sleep(stepMs);
	await touch('touchEnd');
}

/** Centre of an element in viewport coordinates. */
export async function centerOf(locator: Locator): Promise<Point> {
	const box = await locator.boundingBox();
	if (!box) throw new Error('Element has no box');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Swipes horizontally across an element: left = negative dx. Starts well clear of the edges. */
export async function swipeAcross(page: Page, locator: Locator, dx: number) {
	const c = await centerOf(locator);
	const half = Math.abs(dx) / 2;
	const from = { x: c.x + Math.sign(dx) * -half, y: c.y };
	await swipe(page, from, { x: from.x + dx, y: c.y });
}

/** Signs in through the real login form (touch tap) and waits for the reader. */
export async function login(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(FIXTURE_USER.email);
	await page.getByLabel('Password').fill(FIXTURE_USER.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).tap();
	await page.waitForURL((url) => !url.pathname.startsWith('/login'));
	await expect(page.getByRole('link', { name: /Article 01/ })).toBeVisible();
}

/** The list's scroll viewport (the scroll-area viewport that holds the article rows). */
export function listViewport(page: Page) {
	// CSS (not role) selectors: the list stays in the DOM, but hidden, while an article is open.
	return page.locator('[data-slot="scroll-area-viewport"]:has([role="listitem"])');
}

export function row(page: Page, title: string | RegExp) {
	return page.getByRole('listitem').filter({ hasText: title });
}

/** Horizontal overflow of the page in CSS px (0 means none). */
export function horizontalOverflow(page: Page) {
	return page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
}

import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { describe, expect, it, vi } from 'vitest';
import {
	enhanceArticle,
	isViewableImage,
	nextToolbarState,
	shouldOpenViewer
} from './reader-enhancements';

const fixture = readFileSync(new URL('./fixtures/reader-publisher.html', import.meta.url), 'utf8');
const original = 'https://publisher.example.invalid/2026/post/';

function loaded(image: Element, width = 400, height = 300) {
	Object.defineProperties(image, {
		complete: { value: true, configurable: true },
		naturalWidth: { value: width, configurable: true },
		naturalHeight: { value: height, configurable: true }
	});
}

function setup(html = fixture) {
	const { document, window } = parseHTML(`<html><body><article>${html}</article></body></html>`);
	const node = document.querySelector('article')!;
	const open = vi.fn();
	const cleanup = enhanceArticle(node, open, original);
	return { node, window, open, cleanup };
}

describe('rendered reader enhancements (synthetic publisher fixture, no network)', () => {
	it('wraps wide content in named, keyboard-focusable native scroll regions without changing tables', () => {
		const { node } = setup();
		for (const tag of ['table', 'pre']) {
			const content = node.querySelector(tag)!;
			const region = content.parentElement!;
			expect(region.className).toBe('article-scroll-region');
			expect(region.getAttribute('role')).toBe('region');
			expect(region.getAttribute('tabindex')).toBe('0');
			expect(region.hasAttribute('data-reader-horizontal-scroll')).toBe(true);
			expect(region.getAttribute('aria-label')).toBe(tag === 'table' ? 'Table' : 'Code block');
		}
		expect(node.querySelector('table thead th')?.textContent).toBe('Model');
		expect(node.querySelectorAll('tbody tr')[1].children).toHaveLength(4); // missing cell kept as-is
	});

	it('opens linked images by delegated click and exposes accessible keyboard activation', () => {
		const { node, window, open } = setup(
			'<a href="https://example.com"><img src="https://example.com/photo.jpg" alt="A photo"></a>'
		);
		const image = node.querySelector('img')!;
		expect(image.hasAttribute('role')).toBe(false); // not loaded yet
		loaded(image);
		image.dispatchEvent(new window.Event('load'));
		expect(image.getAttribute('role')).toBe('button');
		expect(image.getAttribute('aria-label')).toBe('View image: A photo');
		expect(image.getAttribute('aria-haspopup')).toBe('dialog');
		const click = new window.Event('click', { bubbles: true, cancelable: true });
		image.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(true);
		expect(open).toHaveBeenLastCalledWith({ src: image.src, alt: 'A photo', trigger: image });
		for (const key of ['Enter', ' ', 'Escape']) {
			const event = new window.Event('keydown', { bubbles: true, cancelable: true });
			Object.assign(event, { key });
			image.dispatchEvent(event);
		}
		expect(open).toHaveBeenCalledTimes(3);
	});

	it('ignores empty images, repeated keydowns, and ordinary text links', () => {
		const { node, window, open } = setup('<img><a href="https://example.com">Link</a>');
		node.querySelector('img')!.dispatchEvent(new window.Event('click', { bubbles: true }));
		node.querySelector('a')!.dispatchEvent(new window.Event('click', { bubbles: true }));
		const event = new window.Event('keydown', { bubbles: true });
		Object.assign(event, { key: 'Enter', repeat: true });
		node.querySelector('img')!.dispatchEvent(event);
		expect(open).not.toHaveBeenCalled();
	});

	it('opens web links outside the reader, preserves rel tokens, and leaves fragments/mail links alone', () => {
		const { node } = setup(
			'<a href="/relative" rel="nofollow">Web</a><a href="#section">Section</a><a href="mailto:test@example.com">Email</a>'
		);
		const [web, fragment, mail] = node.querySelectorAll('a');
		expect(web.href).toBe('https://publisher.example.invalid/relative');
		expect(web.target).toBe('_blank');
		expect(web.rel.split(' ')).toEqual(
			expect.arrayContaining(['nofollow', 'external', 'noopener', 'noreferrer'])
		);
		expect(fragment.hasAttribute('target')).toBe(false);
		expect(mail.hasAttribute('target')).toBe(false);
	});

	it('adds an Open original fallback only to placeholders lacking a link', () => {
		const { node } = setup(
			'<p class="embed-placeholder">Embed removed</p><p data-embed-placeholder><a href="https://example.com/video">Watch video</a></p>'
		);
		expect(node.querySelector('.embed-placeholder a')?.textContent).toBe('Open original');
		expect(node.querySelector('.embed-placeholder a')?.getAttribute('target')).toBe('_blank');
		expect(node.querySelectorAll('a')).toHaveLength(2);
	});

	it('cleans up wrappers, attributes and listeners so toggling feed/full text cannot stack enhancements', () => {
		const { node, window, open, cleanup } = setup();
		cleanup();
		expect(node.querySelector('.article-scroll-region')).toBeNull();
		expect(node.querySelector('img')?.hasAttribute('role')).toBe(false);
		expect(node.querySelector('a')?.hasAttribute('target')).toBe(false);
		node.querySelector('img')!.dispatchEvent(new window.Event('click', { bubbles: true }));
		expect(open).not.toHaveBeenCalled();
		const again = enhanceArticle(node, open, original);
		expect(node.querySelectorAll('.article-scroll-region')).toHaveLength(2);
		again();
	});
});

describe('isViewableImage', () => {
	const base = {
		complete: true,
		naturalWidth: 400,
		naturalHeight: 300,
		renderedWidth: 0,
		renderedHeight: 0,
		widthAttr: null,
		heightAttr: null
	};
	it('accepts loaded, normal images (unmeasured or measured)', () => {
		expect(isViewableImage(base)).toBe(true);
		expect(isViewableImage({ ...base, renderedWidth: 300, renderedHeight: 200 })).toBe(true);
	});
	it('rejects unloaded, tracking pixels, and tiny images', () => {
		expect(isViewableImage({ ...base, complete: false })).toBe(false);
		expect(isViewableImage({ ...base, naturalWidth: 0 })).toBe(false);
		expect(isViewableImage({ ...base, widthAttr: '1' })).toBe(false);
		expect(isViewableImage({ ...base, heightAttr: '0' })).toBe(false);
		expect(isViewableImage({ ...base, naturalWidth: 16, naturalHeight: 16 })).toBe(false);
		expect(isViewableImage({ ...base, naturalHeight: 47 })).toBe(false);
		expect(isViewableImage({ ...base, renderedWidth: 20, renderedHeight: 20 })).toBe(false);
	});
});

describe('image enhancement on load', () => {
	it('skips tiny and tracking images, and enhances late-loading ones on load', () => {
		const { node, window, open } = setup(
			'<img id="px" width="1" height="1" src="https://example.invalid/p.gif"><img id="emoji" src="https://example.invalid/e.png"><img id="big" src="https://example.invalid/b.png">'
		);
		const [px, emoji, big] = [...node.querySelectorAll('img')];
		loaded(px, 1, 1);
		loaded(emoji, 16, 16);
		for (const img of [px, emoji, big]) img.dispatchEvent(new window.Event('load'));
		loaded(big);
		big.dispatchEvent(new window.Event('load'));
		for (const img of [px, emoji]) {
			expect(img.hasAttribute('role')).toBe(false);
			expect(img.hasAttribute('tabindex')).toBe(false);
			img.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
		}
		expect(open).not.toHaveBeenCalled();
		expect(big.getAttribute('role')).toBe('button');
	});

	it('lets modified clicks pass through to the link, but opens on plain tap', () => {
		const { node, window, open } = setup(
			'<a href="https://example.invalid/x"><img src="https://example.invalid/b.png"></a>'
		);
		const image = node.querySelector('img')!;
		loaded(image);
		image.dispatchEvent(new window.Event('load'));
		const modified = new window.Event('click', { bubbles: true, cancelable: true });
		Object.assign(modified, { ctrlKey: true, button: 0 });
		image.dispatchEvent(modified);
		expect(modified.defaultPrevented).toBe(false);
		expect(open).not.toHaveBeenCalled();
		const plain = new window.Event('click', { bubbles: true, cancelable: true });
		image.dispatchEvent(plain);
		expect(plain.defaultPrevented).toBe(true);
		expect(open).toHaveBeenCalledTimes(1);
	});
});

describe('shouldOpenViewer', () => {
	it('opens for plain clicks and keyboard, not modified or non-primary clicks', () => {
		expect(shouldOpenViewer({ type: 'click', button: 0 })).toBe(true);
		expect(shouldOpenViewer({ type: 'keydown' })).toBe(true);
		for (const key of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
			expect(shouldOpenViewer({ type: 'click', button: 0, [key]: true })).toBe(false);
		}
		expect(shouldOpenViewer({ type: 'click', button: 1 })).toBe(false);
	});
});

describe('nextToolbarState', () => {
	const f = { top: 100, clientHeight: 800, scrollHeight: 5000, anchor: 0, collapsed: false };
	it('collapses on scroll down and expands on scroll up', () => {
		expect(nextToolbarState(f)).toEqual({ collapsed: true, anchor: 100 });
		expect(nextToolbarState({ ...f, anchor: 200, collapsed: true })).toEqual({
			collapsed: false,
			anchor: 100
		});
	});
	it('ignores small jitter', () => {
		expect(nextToolbarState({ ...f, anchor: 95, collapsed: true })).toEqual({
			collapsed: true,
			anchor: 95
		});
	});
	it('stays expanded near the top and at the end of the article', () => {
		expect(nextToolbarState({ ...f, top: 10, collapsed: true }).collapsed).toBe(false);
		expect(nextToolbarState({ ...f, top: 4195, anchor: 4000, collapsed: true }).collapsed).toBe(
			false
		);
		expect(nextToolbarState({ ...f, top: 4200, anchor: 4000 }).collapsed).toBe(false);
	});
	it('stays expanded when the article cannot scroll', () => {
		expect(nextToolbarState({ ...f, scrollHeight: 805, top: 50, collapsed: true }).collapsed).toBe(
			false
		);
	});
});

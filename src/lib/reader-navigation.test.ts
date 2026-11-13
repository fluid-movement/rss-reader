import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReaderTransition, readerTransitionDirection } from './reader-navigation.ts';

function target(path: string, itemId?: string) {
	return { url: new URL(path, 'https://reader.test'), params: itemId ? { itemId } : {} };
}

describe('reader transition eligibility', () => {
	it.each(['/', '/unread', '/starred', '/search', '/feed/f', '/folder/f', '/base/unread'])(
		'transitions between the list and its article in %s',
		(path) => {
			const list = target(`${path}?q=hello`);
			const article = target(`${path.replace(/\/$/, '')}/item/a?q=hello`, 'a');
			expect(readerTransitionDirection(list, article)).toBe('open');
			expect(readerTransitionDirection(article, list)).toBe('back');
		}
	);
	it('never competes with article swipes or transitions unrelated views', () => {
		expect(readerTransitionDirection(target('/item/a', 'a'), target('/item/b', 'b'))).toBeNull();
		expect(readerTransitionDirection(target('/unread'), target('/starred/item/a', 'a'))).toBeNull();
		expect(
			readerTransitionDirection(target('/search?q=a'), target('/search/item/a?q=b', 'a'))
		).toBeNull();
		expect(readerTransitionDirection(target('/'), target('/unread'))).toBeNull();
		expect(readerTransitionDirection(null, target('/item/a', 'a'))).toBeNull();
		expect(readerTransitionDirection(target('/item/a', 'a'), null)).toBeNull();
	});
});

function deferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

describe('view transition navigation handshake', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	function setup(reduced = false) {
		const root = { dataset: {} as Record<string, string> };
		const workspace = { style: { viewTransitionName: '' } } as HTMLElement;
		const complete = deferred();
		const ready = deferred();
		const updated = deferred();
		const finished = deferred();
		let update!: () => Promise<void>;
		const skipTransition = vi.fn();
		const startViewTransition = vi.fn((callback: () => Promise<void>) => {
			update = callback;
			return {
				ready: ready.promise,
				updateCallbackDone: updated.promise,
				finished: finished.promise,
				skipTransition
			};
		});
		const document = { documentElement: root, startViewTransition };
		vi.stubGlobal('document', document);
		vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
		const prepare = vi.fn(async () => {});
		const transition = createReaderTransition();
		const run = (direction: 'open' | 'back' = 'open') =>
			transition(workspace, direction, complete.promise, prepare);
		return {
			root,
			workspace,
			complete,
			ready,
			updated,
			finished,
			skipTransition,
			startViewTransition,
			document,
			prepare,
			transition,
			run,
			update: () => update()
		};
	}

	it.each([false, true])(
		'falls back without preparing a snapshot (reduced motion: %s)',
		async (reduced) => {
			const s = setup(reduced);
			if (!reduced) Reflect.deleteProperty(s.document, 'startViewTransition');
			await s.run();
			expect(s.prepare).not.toHaveBeenCalled();
			expect(s.startViewTransition).not.toHaveBeenCalled();
			expect(s.root.dataset.readerTransition).toBeUndefined();
		}
	);

	it('releases routing at the snapshot update, not at navigation or animation completion', async () => {
		const s = setup();
		s.workspace.style.viewTransitionName = 'previous';
		const released = vi.fn();
		const routing = s.run().then(released);
		await Promise.resolve();
		expect(s.prepare).toHaveBeenCalledOnce();
		expect(s.workspace.style.viewTransitionName).toBe('reader-workspace');
		expect(released).not.toHaveBeenCalled();
		const updating = s.update();
		await routing;
		expect(released).toHaveBeenCalledOnce();
		expect(s.root.dataset.readerTransition).toBe('open');
		s.complete.resolve();
		await updating;
		s.finished.resolve();
		await Promise.resolve();
		expect(s.workspace.style.viewTransitionName).toBe('previous');
		expect(s.root.dataset.readerTransition).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('falls back if the API throws synchronously', async () => {
		const s = setup();
		s.startViewTransition.mockImplementation(() => {
			throw new Error('unsupported state');
		});
		await s.run();
		expect(s.workspace.style.viewTransitionName).toBe('');
		expect(s.root.dataset.readerTransition).toBeUndefined();
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each(['ready', 'updated', 'finished'] as const)(
		'falls back when %s rejects',
		async (stage) => {
			const s = setup();
			const routing = s.run();
			await Promise.resolve();
			s[stage].reject(new Error('snapshot skipped'));
			await routing;
			expect(s.skipTransition).toHaveBeenCalledOnce();
			expect(s.workspace.style.viewTransitionName).toBe('');
			expect(s.root.dataset.readerTransition).toBeUndefined();
			expect(vi.getTimerCount()).toBe(0);
		}
	);

	it('unblocks routing within 100 ms if the browser never invokes update', async () => {
		const s = setup();
		const routing = s.run();
		await vi.advanceTimersByTimeAsync(100);
		await routing;
		expect(s.skipTransition).toHaveBeenCalledOnce();
		expect(s.root.dataset.readerTransition).toBeUndefined();
	});

	it('cleans up aborted navigation even before an update callback', async () => {
		const s = setup();
		const routing = s.run();
		await Promise.resolve();
		s.complete.reject(new Error('navigation aborted'));
		await routing;
		expect(s.skipTransition).toHaveBeenCalledOnce();
		expect(s.workspace.style.viewTransitionName).toBe('');
		expect(s.root.dataset.readerTransition).toBeUndefined();
	});

	it('falls back cleanly if snapshot preparation fails', async () => {
		const s = setup();
		s.prepare.mockRejectedValue(new Error('unmounted'));
		await s.run();
		expect(s.startViewTransition).not.toHaveBeenCalled();
	});

	it('cancels an older transition without letting its late finish clear the new one', async () => {
		const s = setup();
		const first = s.run();
		await Promise.resolve();
		const firstFinish = s.finished;
		const nextFinish = deferred();
		s.startViewTransition.mockReturnValue({
			ready: Promise.resolve(),
			updateCallbackDone: Promise.resolve(),
			finished: nextFinish.promise,
			skipTransition: vi.fn()
		});
		const second = s.run('back');
		await first;
		firstFinish.resolve();
		await Promise.resolve();
		expect(s.root.dataset.readerTransition).toBe('back');
		await vi.advanceTimersByTimeAsync(100);
		await second;
		expect(s.root.dataset.readerTransition).toBeUndefined();
	});
});

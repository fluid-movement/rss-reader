import { parseHTML } from 'linkedom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	SwipeTracker,
	settleDuration,
	settleStrip,
	startsInHorizontalOwner,
	swipeNavigation,
	type Step
} from './swipe-navigation';

function tracker(allowed: (step: Step) => boolean = () => true, width = 390) {
	return new SwipeTracker({ canStep: allowed, viewportWidth: () => width });
}

/** Drag from (x0, y0) by (dx, dy) in even steps over `ms`; returns the committed step. */
function drag(t: SwipeTracker, x0: number, y0: number, dx: number, dy: number, ms = 400) {
	if (!t.down(x0, y0, 0)) return { started: false, step: 0 as const, last: null };
	let last = null;
	for (let i = 1; i <= 10; i++)
		last = t.move(x0 + (dx * i) / 10, y0 + (dy * i) / 10, (ms * i) / 10);
	return { started: true, step: t.up(x0 + dx, ms), last };
}

describe('swipe tracker (touch emulation at a 390 px phone width)', () => {
	it('swipe left opens the next article and swipe right the previous one', () => {
		expect(drag(tracker(), 300, 400, -120, 4).step).toBe(1);
		expect(drag(tracker(), 100, 400, 120, 4).step).toBe(-1);
	});
	it('follows the finger and snaps back below the distance and velocity thresholds', () => {
		const { last, step } = drag(tracker(), 300, 400, -50, 0, 600);
		expect(last?.offset).toBe(-50);
		expect(step).toBe(0);
	});
	it('commits a short fast flick', () => {
		expect(drag(tracker(), 300, 400, -40, 0, 50).step).toBe(1);
	});
	it('rubber-bands and never navigates past the first or last article', () => {
		const first = drag(
			tracker((s) => s !== -1),
			100,
			400,
			200,
			0
		);
		expect(first.step).toBe(0);
		expect(first.last?.allowed).toBe(false);
		expect(Math.abs(first.last!.offset)).toBeLessThanOrEqual(48);
		expect(
			drag(
				tracker((s) => s !== 1),
				300,
				400,
				-200,
				0
			).step
		).toBe(0);
	});
	it('leaves vertical scrolling and diagonals to the browser', () => {
		expect(drag(tracker(), 200, 300, 10, -200).step).toBe(0);
		expect(drag(tracker(), 200, 300, -60, 60).step).toBe(0);
	});
	it('a vertical scroll never turns into a swipe even if it drifts sideways', () => {
		const t = tracker();
		t.down(200, 300, 0);
		expect(t.move(202, 340, 50).phase).toBe('vertical');
		expect(t.move(80, 345, 100).phase).toBe('vertical');
		expect(t.up(80, 120)).toBe(0);
	});
	it.each([[10], [28], [362], [380]])(
		'ignores gestures starting at x=%i (within 28 px of an edge)',
		(x) => {
			const result = drag(tracker(), x, 400, x < 100 ? 200 : -200, 0);
			expect(result.started).toBe(false);
			expect(result.step).toBe(0);
		}
	);
	it('ignores a gesture that starts blocked (selection or horizontal scroller)', () => {
		expect(tracker().down(200, 300, 0, true)).toBe(false);
	});
});

describe('release velocity and settle duration', () => {
	it('reports the signed release speed in px/ms', () => {
		const t = tracker();
		t.down(300, 400, 0);
		t.move(240, 400, 50);
		t.move(180, 400, 100);
		t.up(180, 100);
		expect(t.releaseVelocity).toBeCloseTo(-1.2);
	});
	it('settles faster for a faster release, within a fixed range', () => {
		expect(settleDuration(270, 0.1)).toBe(300);
		expect(settleDuration(270, 1.2)).toBe(225);
		expect(settleDuration(270, 5)).toBe(120);
		expect(settleDuration(600, 0)).toBe(320);
		expect(settleDuration(270, -1.2)).toBe(settleDuration(270, 1.2));
	});
});

describe('swipe strip attachment', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function setup(
		reduced = false,
		commitImpl?: (step: Step, settle: () => Promise<void>) => Promise<boolean>
	) {
		vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
		vi.stubGlobal('window', { innerWidth: 390 });
		vi.stubGlobal('getSelection', () => null);
		vi.stubGlobal('getComputedStyle', (el: HTMLElement) => ({ transform: el.style.transform }));
		vi.stubGlobal(
			'DOMMatrixReadOnly',
			class {
				m41: number;
				constructor(transform: string) {
					this.m41 = Number(/translate3d\((-?[\d.]+)px/.exec(transform)?.[1] ?? 0);
				}
			}
		);
		const animation = { cancel: vi.fn(), onfinish: null as (() => void) | null };
		const node = Object.assign(new EventTarget(), {
			style: { transform: '' },
			clientWidth: 390,
			setPointerCapture: vi.fn(),
			animate: vi.fn(() => animation)
		});
		const commit = vi.fn(
			commitImpl ??
				(async (_step: Step, settle: () => Promise<void>) => {
					void settle();
					return true;
				})
		);
		const warm = vi.fn();
		let busy = false;
		const detach = swipeNavigation(node as unknown as HTMLElement, () => ({
			canStep: () => true,
			commit,
			warm,
			busy: () => busy
		}));
		function pointer(type: string, x: number, y = 300, time = 0) {
			const event = new Event(type);
			Object.defineProperties(event, {
				pointerType: { value: 'touch' },
				pointerId: { value: 1 },
				clientX: { value: x },
				clientY: { value: y },
				timeStamp: { value: time }
			});
			node.dispatchEvent(event);
		}
		return {
			node,
			animation,
			pointer,
			commit,
			warm,
			detach,
			setBusy: (value: boolean) => (busy = value)
		};
	}

	it('drags the whole strip and settles onto the neighbour with a velocity-aware slide', async () => {
		const { node, animation, pointer, warm, commit, detach } = setup();
		pointer('pointerdown', 300);
		expect(warm).toHaveBeenCalledOnce();
		pointer('pointermove', 180, 300, 100);
		expect(node.style.transform).toBe('translate3d(-120px,0,0)');
		pointer('pointerup', 180, 300, 100);
		expect(commit).toHaveBeenCalledWith(1, expect.any(Function));
		expect(node.animate).toHaveBeenCalledWith(
			[{ transform: 'translate3d(-120px,0,0)' }, { transform: 'translate3d(-390px,0,0)' }],
			{ duration: 225, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
		);
		detach();
		expect(node.style.transform).toBe('');
		expect(animation.cancel).toHaveBeenCalled();
	});

	it('commits only after the settle animation has finished', async () => {
		let committed: (changed: boolean) => void = () => {};
		const order: string[] = [];
		const { animation, pointer, detach } = setup(false, async (_step, settle) => {
			await settle();
			order.push('settled');
			return new Promise<boolean>((resolve) => (committed = resolve));
		});
		pointer('pointerdown', 300);
		pointer('pointermove', 180, 300, 100);
		pointer('pointerup', 180, 300, 100);
		await Promise.resolve();
		expect(order).toEqual([]);
		animation.onfinish?.();
		await Promise.resolve();
		await Promise.resolve();
		expect(order).toEqual(['settled']);
		committed(true);
		detach();
	});

	it('snaps back when the page did not change', async () => {
		const { node, pointer, detach } = setup(false, async () => false);
		pointer('pointerdown', 300);
		pointer('pointermove', 180, 300, 100);
		pointer('pointerup', 180, 300, 100);
		await Promise.resolve();
		await Promise.resolve();
		expect(node.animate).toHaveBeenLastCalledWith(
			[{ transform: 'translate3d(-120px,0,0)' }, { transform: 'translate3d(0px,0,0)' }],
			expect.objectContaining({ easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
		);
		detach();
	});

	it('buttons and keys reuse the settle: slide from rest onto the neighbour or back', async () => {
		const { node, animation, detach } = setup();
		const el = node as unknown as HTMLElement;
		const next = settleStrip(el, 1);
		expect(node.animate).toHaveBeenLastCalledWith(
			[{ transform: 'translate3d(0px,0,0)' }, { transform: 'translate3d(-390px,0,0)' }],
			{ duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
		);
		animation.onfinish?.();
		await next;
		const back = settleStrip(el, -1);
		expect(node.animate).toHaveBeenLastCalledWith(
			[{ transform: 'translate3d(-390px,0,0)' }, { transform: 'translate3d(390px,0,0)' }],
			expect.anything()
		);
		animation.onfinish?.();
		await back;
		detach();
	});

	it('keeps navigation working without drag or slide animation under reduced motion', async () => {
		const { node, pointer, commit, detach } = setup(true);
		pointer('pointerdown', 300);
		pointer('pointermove', 180, 300, 100);
		expect(node.style.transform).toBe('');
		pointer('pointerup', 180, 300, 100);
		await Promise.resolve();
		expect(commit).toHaveBeenCalledWith(1, expect.any(Function));
		expect(node.animate).not.toHaveBeenCalled();
		await expect(settleStrip(node as unknown as HTMLElement, 1)).resolves.toBeUndefined();
		detach();
	});

	it('leaves vertical scrolling alone and removes listeners on teardown', () => {
		const { node, pointer, commit, warm, detach } = setup();
		pointer('pointerdown', 200);
		pointer('pointermove', 202, 400);
		pointer('pointerup', 202, 400);
		expect(node.style.transform).toBe('');
		expect(node.animate).not.toHaveBeenCalled();
		expect(commit).not.toHaveBeenCalled();
		detach();
		pointer('pointerdown', 200);
		expect(warm).toHaveBeenCalledOnce();
	});

	it('ignores new touches while a page turn is in flight', () => {
		const { pointer, warm, setBusy, detach } = setup();
		setBusy(true);
		pointer('pointerdown', 300);
		expect(warm).not.toHaveBeenCalled();
		detach();
	});

	it('suppresses the synthetic click after a swipe but lets later taps through', async () => {
		const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
		const { node, pointer, detach } = setup(true);
		pointer('pointerdown', 300);
		pointer('pointermove', 180);
		pointer('pointerup', 180);
		await Promise.resolve();
		const synthetic = new Event('click', { cancelable: true });
		node.dispatchEvent(synthetic);
		expect(synthetic.defaultPrevented).toBe(true);
		clock.mockReturnValue(1400);
		const tap = new Event('click', { cancelable: true });
		node.dispatchEvent(tap);
		expect(tap.defaultPrevented).toBe(false);
		detach();
	});

	it('cancels a drag with a transform-only snap-back and never navigates', () => {
		const { node, pointer, commit, detach } = setup();
		pointer('pointerdown', 300);
		pointer('pointermove', 250);
		pointer('pointercancel', 250);
		expect(node.animate).toHaveBeenCalledWith(
			[{ transform: 'translate3d(-50px,0,0)' }, { transform: 'translate3d(0px,0,0)' }],
			{ duration: 120, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
		);
		expect(commit).not.toHaveBeenCalled();
		detach();
	});
});

describe('horizontal owners', () => {
	const owners = [
		'<pre id="t">code</pre>',
		'<div class="article-scroll-region"><span id="t">x</span></div>',
		'<table><tbody><tr><td id="t">cell</td></tr></tbody></table>',
		'<iframe id="t"></iframe>'
	];
	it.each(owners)('a gesture inside %s belongs to that element', (html) => {
		const { document } = parseHTML(`<html><body><div id="root">${html}</div></body></html>`);
		const root = document.querySelector('#root')!;
		expect(startsInHorizontalOwner(document.querySelector('#t'), root)).toBe(true);
	});
	it('plain prose is free to swipe', () => {
		const { document } = parseHTML(
			'<html><body><div id="root"><p id="t">hi</p></div></body></html>'
		);
		const root = document.querySelector('#root')!;
		expect(startsInHorizontalOwner(document.querySelector('#t'), root)).toBe(false);
	});
});

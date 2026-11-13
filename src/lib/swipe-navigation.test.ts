import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { SwipeTracker, startsInHorizontalOwner, type Step } from './swipe-navigation';

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

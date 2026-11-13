import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachPullToRefresh, PULL_COMMIT_DISTANCE, PullTracker, pullOffset } from './pull-refresh';

describe('pullOffset', () => {
	it('resists, is monotonic and capped', () => {
		expect(pullOffset(-5)).toBe(0);
		expect(pullOffset(NaN)).toBe(0);
		expect(pullOffset(50)).toBeLessThan(50);
		expect(pullOffset(120)).toBeGreaterThanOrEqual(PULL_COMMIT_DISTANCE);
		expect(pullOffset(2000)).toBeLessThanOrEqual(88);
	});
});

describe('pull attachment scroll ownership', () => {
	afterEach(() => vi.unstubAllGlobals());
	function setup(scrollTop = 0) {
		vi.stubGlobal('window', { innerWidth: 390 });
		const element = Object.assign(new EventTarget(), { scrollTop });
		const onPull = vi.fn();
		const onRefresh = vi.fn();
		const detach = attachPullToRefresh(element as unknown as HTMLElement, {
			onPull,
			onRefresh,
			enabled: () => true
		});
		function touch(type: string, x: number, y: number, fingers = 1) {
			const event = new Event(type, { cancelable: true });
			const point = { identifier: 1, clientX: x, clientY: y };
			Object.defineProperties(event, {
				changedTouches: { value: [point] },
				touches: { value: Array(fingers).fill(point) }
			});
			element.dispatchEvent(event);
			return event;
		}
		return { onPull, onRefresh, touch, detach };
	}

	it('only prevents native scrolling after a downward pull is claimed', () => {
		const { touch, onPull, onRefresh, detach } = setup();
		touch('touchstart', 200, 100);
		expect(touch('touchmove', 200, 105).defaultPrevented).toBe(false);
		expect(touch('touchmove', 200, 260).defaultPrevented).toBe(true);
		expect(onPull).toHaveBeenLastCalledWith({ offset: pullOffset(160), armed: true });
		touch('touchend', 200, 260);
		expect(onPull).toHaveBeenLastCalledWith(null);
		expect(onRefresh).toHaveBeenCalledOnce();
		detach();
	});

	it.each([
		[200, 50],
		[300, 105]
	])('leaves upward/sideways movement (%i, %i) native', (x, y) => {
		const { touch, onPull, onRefresh, detach } = setup();
		touch('touchstart', 200, 100);
		expect(touch('touchmove', x, y).defaultPrevented).toBe(false);
		touch('touchend', x, y);
		expect(onPull).not.toHaveBeenCalled();
		expect(onRefresh).not.toHaveBeenCalled();
		detach();
	});

	it('cancels an armed pull for pinch gestures and detaches listeners cleanly', () => {
		const { touch, onPull, onRefresh, detach } = setup();
		touch('touchstart', 200, 100);
		touch('touchmove', 200, 260);
		touch('touchstart', 200, 260, 2);
		expect(onPull).toHaveBeenLastCalledWith(null);
		touch('touchend', 200, 260);
		expect(onRefresh).not.toHaveBeenCalled();
		detach();
		onPull.mockClear();
		touch('touchstart', 200, 100);
		touch('touchmove', 200, 260);
		expect(onPull).not.toHaveBeenCalled();
	});
});

describe('PullTracker', () => {
	const W = 390;
	it('pulls down from the top and commits past the distance', () => {
		const t = new PullTracker();
		expect(t.down(200, 100, 0, W)).toBe(true);
		expect(t.move(200, 105, 0).phase).toBe('pending');
		expect(t.move(200, 150, 0)).toMatchObject({ phase: 'pulling', armed: false });
		expect(t.move(200, 260, 0).armed).toBe(true);
		expect(t.up()).toBe(true);
	});
	it('does not commit a short pull', () => {
		const t = new PullTracker();
		t.down(200, 100, 0, W);
		t.move(200, 160, 0);
		expect(t.up()).toBe(false);
	});
	it('ignores starts mid-list, at edges and when blocked', () => {
		const t = new PullTracker();
		expect(t.down(200, 100, 1, W)).toBe(false);
		expect(t.down(10, 100, 0, W)).toBe(false);
		expect(t.down(200, 100, 0, W, true)).toBe(false);
		expect(t.move(200, 300, 0).phase).toBe('ignored');
	});
	it('leaves upward and horizontal drags alone', () => {
		const t = new PullTracker();
		t.down(200, 300, 0, W);
		expect(t.move(200, 250, 0).phase).toBe('ignored');
		expect(t.up()).toBe(false);
		t.down(200, 300, 0, W);
		expect(t.move(260, 305, 0).phase).toBe('ignored');
	});
	it('gives up when the list scrolls', () => {
		const t = new PullTracker();
		t.down(200, 100, 0, W);
		expect(t.move(200, 160, 5).phase).toBe('ignored');
	});
});

import { describe, expect, it } from 'vitest';
import { PULL_COMMIT_DISTANCE, PullTracker, pullOffset } from './pull-refresh';

describe('pullOffset', () => {
	it('resists, is monotonic and capped', () => {
		expect(pullOffset(-5)).toBe(0);
		expect(pullOffset(NaN)).toBe(0);
		expect(pullOffset(50)).toBeLessThan(50);
		expect(pullOffset(120)).toBeGreaterThanOrEqual(PULL_COMMIT_DISTANCE);
		expect(pullOffset(2000)).toBeLessThanOrEqual(88);
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

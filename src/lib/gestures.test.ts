import { describe, expect, it } from 'vitest';
import {
	articleStep,
	gestureDirection,
	isEdgeStart,
	lockAxis,
	shouldCommitGesture
} from './gestures';

describe('gesture edge guard', () => {
	it('ignores both inclusive 28px edges and out-of-viewport starts', () => {
		for (const x of [-1, 0, 28, 362, 390, 400]) expect(isEdgeStart(x, 390)).toBe(true);
		for (const x of [28.01, 195, 361.99]) expect(isEdgeStart(x, 390)).toBe(false);
	});
	it('supports a custom margin and rejects invalid coordinates', () => {
		expect(isEdgeStart(25, 390, 24)).toBe(false);
		expect(isEdgeStart(10, 40)).toBe(true);
		for (const [x, width] of [
			[NaN, 390],
			[10, 0],
			[10, Infinity]
		])
			expect(isEdgeStart(x, width)).toBe(true);
	});
});

describe('axis and direction', () => {
	it('waits through jitter and diagonals, then chooses the dominant axis', () => {
		expect(lockAxis(9, 0)).toBeNull();
		expect(lockAxis(12, 12)).toBeNull();
		expect(lockAxis(-10, 2)).toBe('horizontal');
		expect(lockAxis(2, -10)).toBe('vertical');
		expect(lockAxis(100, 1, 'vertical')).toBe('vertical');
		expect(lockAxis(NaN, 0)).toBeNull();
	});
	it('maps signed travel and the reader paging convention', () => {
		expect(gestureDirection(-40, 1, 'horizontal')).toBe('left');
		expect(gestureDirection(40, 1, 'horizontal')).toBe('right');
		expect(gestureDirection(0, -40, 'vertical')).toBe('up');
		expect(gestureDirection(0, 40, 'vertical')).toBe('down');
		expect(gestureDirection(0, 0, 'horizontal')).toBeNull();
		expect(gestureDirection(Infinity, 0, 'horizontal')).toBeNull();
		expect(articleStep('left')).toBe(1);
		expect(articleStep('right')).toBe(-1);
		expect(articleStep('up')).toBe(0);
		expect(articleStep(null)).toBe(0);
	});
});

describe('commit thresholds', () => {
	it('commits deliberate distance in either direction', () => {
		expect(shouldCommitGesture(79.9, 0)).toBe(false);
		expect(shouldCommitGesture(80, 0)).toBe(true);
		expect(shouldCommitGesture(-80, 0)).toBe(true);
	});
	it('accepts flicks but rejects jitter, slow travel and reversed velocity', () => {
		expect(shouldCommitGesture(24, 0.5)).toBe(true);
		expect(shouldCommitGesture(-24, -0.5)).toBe(true);
		expect(shouldCommitGesture(23.9, 2)).toBe(false);
		expect(shouldCommitGesture(24, 0.49)).toBe(false);
		expect(shouldCommitGesture(24, -1)).toBe(false);
		expect(shouldCommitGesture(NaN, 1)).toBe(false);
		expect(shouldCommitGesture(80, Infinity)).toBe(false);
	});
	it('allows later gestures to override thresholds', () => {
		expect(shouldCommitGesture(40, 0, { distance: 40 })).toBe(true);
		expect(shouldCommitGesture(20, 1, { minimumFlickDistance: 20, velocity: 1 })).toBe(true);
	});
	it('falls back to the defaults for non-finite thresholds instead of disabling the commit', () => {
		expect(shouldCommitGesture(80, 0, { distance: NaN })).toBe(true);
		expect(shouldCommitGesture(79.9, 0, { distance: NaN })).toBe(false);
		expect(shouldCommitGesture(24, 0.5, { minimumFlickDistance: NaN, velocity: NaN })).toBe(true);
		expect(shouldCommitGesture(24, 0.49, { velocity: Infinity })).toBe(false);
		expect(shouldCommitGesture(24, 0.5, { minimumFlickDistance: Infinity })).toBe(true);
	});
});

describe('non-finite overrides use the documented defaults', () => {
	it('keeps the edge guard when the margin is NaN or infinite', () => {
		expect(isEdgeStart(10, 390, NaN)).toBe(true);
		expect(isEdgeStart(380, 390, NaN)).toBe(true);
		expect(isEdgeStart(100, 390, NaN)).toBe(false);
		expect(isEdgeStart(10, 390, Infinity)).toBe(true);
		expect(isEdgeStart(100, 390, -Infinity)).toBe(false);
	});
	it('keeps the dead zone and axis ratio when they are NaN', () => {
		expect(lockAxis(5, 0, null, NaN)).toBeNull();
		expect(lockAxis(20, 0, null, NaN)).toBe('horizontal');
		expect(lockAxis(-30, 2, null, 10, NaN)).toBe('horizontal');
		expect(lockAxis(2, -30, null, Infinity, NaN)).toBe('vertical');
		expect(lockAxis(12, 11, null, 10, NaN)).toBeNull();
	});
});

import { isEdgeStart, lockAxis, type GestureAxis } from '#lib/gestures.ts';

/** Distance (CSS px of indicator travel) at which releasing refreshes. */
export const PULL_COMMIT_DISTANCE = 64;
const PULL_RESISTANCE = 0.65;
const PULL_MAX = 88;

/** Finger travel to indicator travel: linear with resistance up to the commit distance,
 * then increasingly stiff up to a hard cap. */
export function pullOffset(dy: number): number {
	if (!Number.isFinite(dy) || dy <= 0) return 0;
	const raw = dy * PULL_RESISTANCE;
	if (raw <= PULL_COMMIT_DISTANCE) return raw;
	return Math.min(PULL_MAX, PULL_COMMIT_DISTANCE + (raw - PULL_COMMIT_DISTANCE) * 0.25);
}

export interface PullMove {
	/** 'ignored' gestures belong to the browser or another handler; never prevent them. */
	phase: 'ignored' | 'pending' | 'pulling';
	offset: number;
	/** Releasing now would refresh. */
	armed: boolean;
}

const IGNORED: PullMove = { phase: 'ignored', offset: 0, armed: false };

/** DOM-free pull-to-refresh state machine. A pull only exists when the list was scrolled to
 * the very top at touch start, the start is not at a screen edge, and the first decisive
 * movement is downward and vertical. Anything else is left alone for the rest of the touch. */
export class PullTracker {
	#active = false;
	#axis: GestureAxis | null = null;
	#startX = 0;
	#startY = 0;
	#armed = false;

	down(x: number, y: number, scrollTop: number, viewportWidth: number, blocked = false): boolean {
		this.cancel();
		if (blocked || scrollTop > 0 || isEdgeStart(x, viewportWidth)) return false;
		this.#active = true;
		this.#startX = x;
		this.#startY = y;
		return true;
	}

	move(x: number, y: number, scrollTop: number): PullMove {
		if (!this.#active) return IGNORED;
		const dx = x - this.#startX;
		const dy = y - this.#startY;
		this.#axis = lockAxis(dx, dy, this.#axis);
		if (this.#axis === 'horizontal' || (this.#axis === 'vertical' && dy <= 0 && !this.#armed)) {
			this.cancel();
			return IGNORED;
		}
		if (this.#axis === null) return { phase: 'pending', offset: 0, armed: false };
		if (scrollTop > 0) {
			this.cancel();
			return IGNORED;
		}
		const offset = pullOffset(dy);
		this.#armed = offset >= PULL_COMMIT_DISTANCE;
		return { phase: 'pulling', offset, armed: this.#armed };
	}

	/** True when the release should refresh. */
	up(): boolean {
		const commit = this.#active && this.#axis === 'vertical' && this.#armed;
		this.cancel();
		return commit;
	}

	cancel() {
		this.#active = false;
		this.#axis = null;
		this.#armed = false;
	}
}

/** Wires a PullTracker to touch events on a scroll element. Touch events (not pointer events)
 * because the browser cancels pointer streams once it claims a vertical pan, and the
 * non-passive touchmove is what lets a pull suppress the native overscroll gesture. */
export function attachPullToRefresh(
	element: HTMLElement,
	options: {
		onPull: (move: { offset: number; armed: boolean } | null) => void;
		onRefresh: () => void;
		/** False while a refresh is running. */
		enabled: () => boolean;
	}
): () => void {
	const tracker = new PullTracker();
	let touchId: number | null = null;
	let pulling = false;

	const find = (event: TouchEvent) =>
		[...event.changedTouches].find((touch) => touch.identifier === touchId);
	function reset() {
		tracker.cancel();
		touchId = null;
		if (pulling) options.onPull(null);
		pulling = false;
	}

	function start(event: TouchEvent) {
		if (touchId !== null || event.touches.length > 1) {
			reset();
			return;
		}
		const touch = event.changedTouches[0];
		if (
			tracker.down(
				touch.clientX,
				touch.clientY,
				element.scrollTop,
				window.innerWidth,
				!options.enabled()
			)
		)
			touchId = touch.identifier;
	}
	function move(event: TouchEvent) {
		const touch = find(event);
		if (!touch) return;
		const result = tracker.move(touch.clientX, touch.clientY, element.scrollTop);
		if (result.phase === 'ignored') {
			reset();
			return;
		}
		if (result.phase !== 'pulling') return;
		pulling = true;
		if (event.cancelable) event.preventDefault();
		options.onPull({ offset: result.offset, armed: result.armed });
	}
	function end(event: TouchEvent) {
		if (!find(event)) return;
		const commit = tracker.up();
		touchId = null;
		if (pulling) options.onPull(null);
		pulling = false;
		if (commit) options.onRefresh();
	}
	function cancel(event: TouchEvent) {
		if (find(event)) reset();
	}

	element.addEventListener('touchstart', start, { passive: true });
	element.addEventListener('touchmove', move, { passive: false });
	element.addEventListener('touchend', end);
	element.addEventListener('touchcancel', cancel);
	return () => {
		element.removeEventListener('touchstart', start);
		element.removeEventListener('touchmove', move);
		element.removeEventListener('touchend', end);
		element.removeEventListener('touchcancel', cancel);
	};
}

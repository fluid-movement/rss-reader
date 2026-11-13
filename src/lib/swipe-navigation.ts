import {
	articleStep,
	gestureDirection,
	isEdgeStart,
	lockAxis,
	shouldCommitGesture,
	type GestureAxis
} from '#lib/gestures.ts';

export type Step = -1 | 1;

export interface SwipeMove {
	/** 'vertical' and 'ignored' gestures belong to the browser; never move the article. */
	phase: 'ignored' | 'pending' | 'vertical' | 'horizontal';
	/** Pixels the article should follow the finger (rubber-banded when there is nowhere to go). */
	offset: number;
	/** The article change this drag would commit, 0 when none. */
	step: Step | 0;
	/** False when the drag is past the first/last article: the offset is a rubber band. */
	allowed: boolean;
}

const RUBBER_FACTOR = 0.35;
const RUBBER_MAX = 48;
const VELOCITY_WINDOW_MS = 100;

/** DOM-free swipe state machine for article paging. The element glue feeds it pointer
 * coordinates; it decides ignore/axis lock/commit using the shared helpers in gestures.ts. */
export class SwipeTracker {
	#axis: GestureAxis | null = null;
	#active = false;
	#startX = 0;
	#startY = 0;
	#samples: { x: number; t: number }[] = [];

	constructor(
		private readonly options: {
			canStep: (step: Step) => boolean;
			viewportWidth: () => number;
		}
	) {}

	/** Returns false (and tracks nothing) when the gesture must be left to the browser. */
	down(x: number, y: number, time: number, blocked = false): boolean {
		this.cancel();
		if (blocked || isEdgeStart(x, this.options.viewportWidth())) return false;
		this.#active = true;
		this.#startX = x;
		this.#startY = y;
		this.#samples = [{ x, t: time }];
		return true;
	}

	move(x: number, y: number, time: number): SwipeMove {
		if (!this.#active) return { phase: 'ignored', offset: 0, step: 0, allowed: false };
		const dx = x - this.#startX;
		const dy = y - this.#startY;
		this.#axis = lockAxis(dx, dy, this.#axis);
		if (this.#axis === 'vertical') return { phase: 'vertical', offset: 0, step: 0, allowed: false };
		if (this.#axis === null) return { phase: 'pending', offset: 0, step: 0, allowed: false };
		this.#samples.push({ x, t: time });
		while (this.#samples.length > 2 && time - this.#samples[0].t > VELOCITY_WINDOW_MS)
			this.#samples.shift();
		const step = articleStep(gestureDirection(dx, dy, 'horizontal'));
		const allowed = step !== 0 && this.options.canStep(step);
		const offset = allowed
			? dx
			: Math.sign(dx) * Math.min(RUBBER_MAX, Math.abs(dx) * RUBBER_FACTOR);
		return { phase: 'horizontal', offset, step, allowed };
	}

	/** The step to commit (-1 previous, 1 next) or 0 to snap back. */
	up(x: number, time?: number): Step | 0 {
		const horizontal = this.#active && this.#axis === 'horizontal';
		const dx = x - this.#startX;
		let velocity = 0;
		if (horizontal) {
			const first = this.#samples[0];
			const span = (time ?? this.#samples[this.#samples.length - 1].t) - first.t;
			velocity = span > 0 ? (x - first.x) / span : 0;
		}
		this.cancel();
		if (!horizontal) return 0;
		const step = articleStep(gestureDirection(dx, 0, 'horizontal'));
		if (step === 0 || !this.options.canStep(step)) return 0;
		return shouldCommitGesture(dx, velocity) ? step : 0;
	}

	cancel() {
		this.#active = false;
		this.#axis = null;
		this.#samples = [];
	}
}

/** Elements that scroll or zoom sideways own a gesture that starts inside them. */
const HORIZONTAL_OWNERS =
	'pre,table,iframe,video,audio,canvas,input,textarea,select,.article-scroll-region';

export function startsInHorizontalOwner(target: Element | null, root: Element): boolean {
	for (let el = target; el && el !== root; el = el.parentElement) {
		if (el.matches(HORIZONTAL_OWNERS)) return true;
		if (el.scrollWidth > el.clientWidth + 1) {
			const overflowX = getComputedStyle(el).overflowX;
			if (overflowX === 'auto' || overflowX === 'scroll') return true;
		}
	}
	return false;
}

export interface SwipeNavigationOptions {
	canStep: (step: Step) => boolean;
	/** Resolves true when the article changed. Called after the slide-out finishes. */
	commit: (step: Step) => Promise<boolean>;
	/** Touch start: warm the neighbors. */
	warm?: () => void;
}

const DURATION = 160;
/** Direction the next-mounted article slides in from (set when a swipe commits). */
let entering: Step | 0 = 0;

/** Svelte attachment: horizontal swipe paging on `node` (touch pointers only). */
export function swipeNavigation(node: HTMLElement, options: () => SwipeNavigationOptions) {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');
	const tracker = new SwipeTracker({
		canStep: (step) => options().canStep(step),
		viewportWidth: () => window.innerWidth
	});
	let pointerId: number | null = null;
	let dragging = false;
	let lastSwipeEnd = 0;
	let animation: Animation | null = null;

	const slide = (from: number, to: number, done?: () => void) => {
		animation?.cancel();
		node.style.transform = to ? `translate3d(${to}px,0,0)` : '';
		if (reduced.matches || from === to) {
			done?.();
			return;
		}
		animation = node.animate(
			[{ transform: `translate3d(${from}px,0,0)` }, { transform: `translate3d(${to}px,0,0)` }],
			{ duration: DURATION, easing: 'ease-out' }
		);
		animation.onfinish = () => done?.();
	};
	const currentOffset = () => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41;
	const hasSelection = () => {
		const selection = getSelection();
		return !!selection && !selection.isCollapsed && selection.toString().length > 0;
	};
	const reset = () => {
		pointerId = null;
		dragging = false;
	};
	const abort = () => {
		const offset = dragging ? currentOffset() : 0;
		const wasDragging = dragging;
		tracker.cancel();
		reset();
		if (wasDragging) slide(offset, 0);
	};

	// A freshly opened article (the scroller is re-created per article) slides in after a swipe.
	if (entering && !reduced.matches) {
		const from = entering * (window.innerWidth || node.clientWidth);
		entering = 0;
		slide(from, 0);
	}
	entering = 0;

	function onDown(event: PointerEvent) {
		if (event.pointerType !== 'touch') return;
		if (pointerId !== null) {
			// A second finger is a pinch or two-finger gesture, not a page turn.
			abort();
			return;
		}
		const blocked = hasSelection() || startsInHorizontalOwner(event.target as Element, node);
		if (!tracker.down(event.clientX, event.clientY, event.timeStamp, blocked)) return;
		pointerId = event.pointerId;
		options().warm?.();
	}
	function onMove(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		const move = tracker.move(event.clientX, event.clientY, event.timeStamp);
		if (move.phase === 'vertical') {
			abort();
			return;
		}
		if (move.phase !== 'horizontal') return;
		if (hasSelection()) {
			abort();
			return;
		}
		if (!dragging) {
			dragging = true;
			animation?.cancel();
			try {
				node.setPointerCapture(event.pointerId);
			} catch {
				// The pointer may already be gone; the drag still works without capture.
			}
		}
		if (!reduced.matches) node.style.transform = `translate3d(${move.offset}px,0,0)`;
	}
	function onUp(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		const wasDragging = dragging;
		const offset = wasDragging && !reduced.matches ? currentOffset() : 0;
		const step = tracker.up(event.clientX, event.timeStamp);
		reset();
		if (wasDragging) lastSwipeEnd = performance.now();
		if (!step) {
			if (wasDragging) slide(offset, 0);
			return;
		}
		// Slide out, switch, and the next article slides in from the other side.
		const width = node.clientWidth || window.innerWidth;
		slide(offset, -step * width, () => {
			entering = step;
			void options()
				.commit(step)
				.then((changed) => {
					entering = 0;
					if (!changed) slide(-step * width, 0);
				});
		});
	}
	function onClick(event: MouseEvent) {
		// A drag that ends over a link must not also activate it.
		if (performance.now() - lastSwipeEnd < 350) {
			event.preventDefault();
			event.stopPropagation();
		}
	}

	node.addEventListener('pointerdown', onDown);
	node.addEventListener('pointermove', onMove);
	node.addEventListener('pointerup', onUp);
	node.addEventListener('pointercancel', abort);
	node.addEventListener('click', onClick, true);
	return () => {
		node.removeEventListener('pointerdown', onDown);
		node.removeEventListener('pointermove', onMove);
		node.removeEventListener('pointerup', onUp);
		node.removeEventListener('pointercancel', abort);
		node.removeEventListener('click', onClick, true);
		animation?.cancel();
		node.style.transform = '';
	};
}

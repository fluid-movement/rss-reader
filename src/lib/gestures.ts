/** Shared, DOM-free gesture policy. Distances are CSS px; velocity is px/ms.
 * Consumers own pointer tracking/cancellation and keep a chosen axis locked.
 * Never prevent native edge navigation: ignore edge starts instead.
 */
export const GESTURE_THRESHOLDS = {
	edgeMargin: 28,
	deadZone: 10,
	axisRatio: 1.25,
	commitDistance: 80,
	commitVelocity: 0.5,
	minimumFlickDistance: 24
} as const;

export type GestureAxis = 'horizontal' | 'vertical';
export type GestureDirection = 'left' | 'right' | 'up' | 'down';

/** Non-finite overrides (NaN, Infinity) fall back to the documented default. NaN
 * comparisons are always false, so passing them through would silently disable a guard. */
function finiteOr(value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isFinite(value) ? value : fallback;
}

export function isEdgeStart(x: number, viewportWidth: number, margin = 28): boolean {
	const edge = Math.max(0, finiteOr(margin, GESTURE_THRESHOLDS.edgeMargin));
	return (
		!Number.isFinite(x) ||
		!Number.isFinite(viewportWidth) ||
		viewportWidth <= 0 ||
		x <= edge ||
		x >= viewportWidth - edge
	);
}

/** null means still undecided (dead zone or diagonal). Pass the prior lock
 * on later moves so a vertical scroll can never turn into a horizontal swipe. */
export function lockAxis(
	dx: number,
	dy: number,
	locked: GestureAxis | null = null,
	deadZone: number = GESTURE_THRESHOLDS.deadZone,
	ratio: number = GESTURE_THRESHOLDS.axisRatio
): GestureAxis | null {
	if (locked) return locked;
	if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
	const x = Math.abs(dx),
		y = Math.abs(dy);
	if (Math.max(x, y) < finiteOr(deadZone, GESTURE_THRESHOLDS.deadZone)) return null;
	const axisRatio = finiteOr(ratio, GESTURE_THRESHOLDS.axisRatio);
	if (x > y * axisRatio) return 'horizontal';
	if (y > x * axisRatio) return 'vertical';
	return null;
}

export function gestureDirection(
	dx: number,
	dy: number,
	axis: GestureAxis
): GestureDirection | null {
	const delta = axis === 'horizontal' ? dx : dy;
	if (!Number.isFinite(delta) || delta === 0) return null;
	return axis === 'horizontal' ? (delta < 0 ? 'left' : 'right') : delta < 0 ? 'up' : 'down';
}

/** A flick needs deliberate travel and velocity in the travel direction.
 * velocity should come from recent samples, not the whole gesture duration. */
export function shouldCommitGesture(
	distance: number,
	velocity: number,
	thresholds: { distance?: number; velocity?: number; minimumFlickDistance?: number } = {}
): boolean {
	if (!Number.isFinite(distance) || !Number.isFinite(velocity)) return false;
	const travel = Math.abs(distance);
	const commitDistance = finiteOr(thresholds.distance, GESTURE_THRESHOLDS.commitDistance);
	const flickDistance = finiteOr(
		thresholds.minimumFlickDistance,
		GESTURE_THRESHOLDS.minimumFlickDistance
	);
	const flickVelocity = finiteOr(thresholds.velocity, GESTURE_THRESHOLDS.commitVelocity);
	return (
		travel >= commitDistance ||
		(travel >= flickDistance &&
			Math.abs(velocity) >= flickVelocity &&
			Math.sign(distance) === Math.sign(velocity))
	);
}

/** Epic convention: swipe left = next; swipe right = previous. */
export function articleStep(direction: GestureDirection | null): -1 | 0 | 1 {
	return direction === 'left' ? 1 : direction === 'right' ? -1 : 0;
}

<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Minus, Plus, RotateCcw, X } from '@lucide/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	let {
		image,
		onclose
	}: { image: { src: string; alt: string; trigger: HTMLElement }; onclose: () => void } = $props();
	let scale = $state(1);
	let x = $state(0);
	let y = $state(0);
	let surface: HTMLElement;
	let picture: HTMLImageElement;
	const points = new SvelteMap<number, { x: number; y: number }>();
	let start = { x: 0, y: 0, panX: 0, panY: 0, time: 0 };
	let pinchDistance = 0;
	let pinchScale = 1;
	let multitouch = false;
	let lastTap = { time: 0, x: 0, y: 0 };
	const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
	function bound() {
		if (!surface || !picture) return;
		x = clamp(x, Math.max(0, (picture.clientWidth * scale - surface.clientWidth) / 2));
		y = clamp(y, Math.max(0, (picture.clientHeight * scale - surface.clientHeight) / 2));
	}
	function zoom(next: number) {
		scale = Math.max(1, Math.min(5, next));
		bound();
	}
	function reset() {
		scale = 1;
		x = 0;
		y = 0;
	}
	function key(event: KeyboardEvent) {
		if (event.key === '+' || event.key === '=') zoom(scale + 0.5);
		else if (event.key === '-') zoom(scale - 0.5);
		else if (event.key === '0') reset();
		else if (event.key.startsWith('Arrow')) {
			x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0;
			y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0;
			bound();
		} else return;
		event.preventDefault();
	}
	function distance() {
		const [a, b] = [...points.values()];
		return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
	}
	function down(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		surface.setPointerCapture(event.pointerId);
		points.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (points.size === 1) {
			multitouch = false;
			start = { x: event.clientX, y: event.clientY, panX: x, panY: y, time: event.timeStamp };
		} else {
			multitouch = true;
			lastTap.time = 0;
			pinchDistance = distance();
			pinchScale = scale;
		}
	}
	function move(event: PointerEvent) {
		if (!points.has(event.pointerId)) return;
		points.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (points.size >= 2) {
			if (pinchDistance) zoom((pinchScale * distance()) / pinchDistance);
		} else if (!multitouch && scale > 1) {
			x = start.panX + event.clientX - start.x;
			y = start.panY + event.clientY - start.y;
			bound();
		}
	}
	function up(event: PointerEvent) {
		if (!points.has(event.pointerId)) return;
		points.delete(event.pointerId);
		if (event.type !== 'pointerup' || multitouch || points.size) {
			lastTap.time = 0;
			bound();
			return;
		}
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		if (scale === 1 && dy > 100 && dy > Math.abs(dx) * 1.5 && event.timeStamp - start.time < 900) {
			onclose();
			return;
		}
		if (Math.hypot(dx, dy) < 12 && event.timeStamp - start.time < 300) {
			if (
				lastTap.time &&
				event.timeStamp - lastTap.time < 350 &&
				Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 32
			) {
				if (scale > 1) reset();
				else zoom(2.5);
				lastTap.time = 0;
			} else lastTap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
		} else lastTap.time = 0;
	}
	function gestures(node: HTMLElement) {
		surface = node;
		const observer = new ResizeObserver(bound);
		observer.observe(node);
		node.addEventListener('pointerdown', down);
		node.addEventListener('pointermove', move);
		node.addEventListener('pointerup', up);
		node.addEventListener('pointercancel', up);
		node.addEventListener('lostpointercapture', up);
		return () => {
			observer.disconnect();
			points.clear();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', up);
			node.removeEventListener('lostpointercapture', up);
		};
	}
</script>

<Dialog.Root
	open
	onOpenChange={(open) => {
		if (!open) onclose();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		class="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 duration-0 sm:max-w-none data-open:animate-none data-closed:animate-none"
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			if (image.trigger.isConnected) image.trigger.focus({ preventScroll: true });
		}}
	>
		<Dialog.Title class="sr-only">Article image</Dialog.Title>
		<Dialog.Description class="sr-only"
			>Pinch or double-tap to zoom. Drag to pan when zoomed. Swipe down when unzoomed to close, or
			use the controls. Escape closes the viewer.</Dialog.Description
		>
		<div
			class="viewer-controls flex shrink-0 flex-wrap items-center justify-between gap-2 border-b p-2"
		>
			<div class="flex flex-wrap items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					class="size-11"
					aria-label="Zoom out"
					disabled={scale <= 1}
					onclick={() => zoom(scale - 0.5)}><Minus /></Button
				>
				<output aria-live="polite" class="min-w-12 text-center text-sm"
					>{Math.round(scale * 100)}%</output
				>
				<Button
					variant="ghost"
					size="icon"
					class="size-11"
					aria-label="Zoom in"
					disabled={scale >= 5}
					onclick={() => zoom(scale + 0.5)}><Plus /></Button
				>
				<Button variant="ghost" class="min-h-11" onclick={reset}
					><RotateCcw data-icon="inline-start" />Reset</Button
				>
			</div>
			<Button
				variant="ghost"
				size="icon"
				class="size-11"
				aria-label="Close image viewer"
				onclick={onclose}><X /></Button
			>
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (Focusable region provides keyboard panning; native buttons provide zoom/reset.) -->
		<div
			class="image-surface"
			role="region"
			aria-label="Image zoom and pan surface"
			tabindex="0"
			onkeydown={key}
			{@attach gestures}
		>
			<img
				{@attach (node) => {
					picture = node;
				}}
				src={image.src}
				alt={image.alt}
				draggable="false"
				onload={bound}
				style:transform="translate({x}px, {y}px) scale({scale})"
			/>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.viewer-controls {
		padding-top: max(0.5rem, env(safe-area-inset-top));
	}
	.image-surface {
		display: flex;
		flex: 1;
		min-height: 0;
		min-width: 0;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		touch-action: none;
		user-select: none;
		padding-bottom: env(safe-area-inset-bottom);
	}
	.image-surface img {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
	}
</style>

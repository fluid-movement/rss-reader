type Target = {
	url: Pick<URL, 'pathname' | 'search'>;
	params: { itemId?: string } | null;
};

/** Only list <-> article in the same view; sibling articles keep their swipe animation. */
export function readerTransitionDirection(from: Target | null, to: Target | null) {
	if (!from || !to || !!from.params?.itemId === !!to.params?.itemId) return null;
	const listPath = (target: Target) =>
		target.url.pathname.replace(/\/item\/[^/]+\/?$/, '').replace(/\/$/, '') || '/';
	if (listPath(from) !== listPath(to) || from.url.search !== to.url.search) return null;
	return to.params?.itemId ? 'open' : 'back';
}

/** Navigation waits only for the old snapshot, never the animation or a rejected API. */
export function createReaderTransition() {
	let stop: (() => void) | undefined;
	let generation = 0;
	return async (
		workspace: HTMLElement,
		direction: 'open' | 'back',
		complete: Promise<void>,
		prepare: () => Promise<void>
	) => {
		const current = ++generation;
		stop?.();
		// A navigation can abort even before the browser invokes the update callback.
		void complete.catch(() => {});
		if (
			!document.startViewTransition ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		)
			return;
		// Remove the loading overlay and reveal the still-mounted list before capturing it.
		try {
			await prepare();
		} catch {
			return;
		}
		if (current !== generation) return;
		return new Promise<void>((release) => {
			const root = document.documentElement;
			const previousName = workspace.style.viewTransitionName;
			root.dataset.readerTransition = direction;
			workspace.style.viewTransitionName = 'reader-workspace';
			let transition: ViewTransition | undefined;
			let cleaned = false;
			const cleanup = () => {
				if (cleaned) return;
				cleaned = true;
				clearTimeout(timeout);
				workspace.style.viewTransitionName = previousName;
				delete root.dataset.readerTransition;
				if (stop === cancel) stop = undefined;
			};
			const cancel = () => {
				try {
					transition?.skipTransition();
				} catch {
					// Even an API implementation that throws while skipping cannot hold routing hostage.
				} finally {
					cleanup();
					release();
				}
			};
			// A hidden document or an implementation that never invokes update must not stall routing.
			const timeout = setTimeout(cancel, 100);
			stop = cancel;
			void complete.catch(cancel);
			try {
				transition = document.startViewTransition(async () => {
					clearTimeout(timeout);
					release();
					await complete;
					// Named snapshot participants are excluded from live hit-testing, even when
					// the overlay has pointer-events:none. Capture only the outgoing workspace:
					// the incoming reader stays live and accepts swipes during the exit animation.
					if (current === generation) workspace.style.viewTransitionName = 'none';
				});
				void transition.ready.catch(cancel);
				void transition.updateCallbackDone.catch(cancel);
				void transition.finished.then(cleanup, cancel);
			} catch {
				cancel();
			}
		});
	};
}

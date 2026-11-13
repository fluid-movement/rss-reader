export interface ArticleImage {
	src: string;
	alt: string;
	trigger: HTMLElement;
}

export const MIN_IMAGE_SIZE = 48;

export interface ImageFacts {
	complete: boolean;
	naturalWidth: number;
	naturalHeight: number;
	renderedWidth: number;
	renderedHeight: number;
	widthAttr: string | null;
	heightAttr: string | null;
}

/** Whether an image deserves the viewer: loaded, not a tracking pixel, and not icon/emoji sized. */
export function isViewableImage(facts: ImageFacts): boolean {
	for (const attr of [facts.widthAttr, facts.heightAttr]) {
		if (attr === null) continue;
		const value = Number.parseFloat(attr);
		if (value === 0 || value === 1) return false;
	}
	if (!facts.complete || !(facts.naturalWidth > 0) || !(facts.naturalHeight > 0)) return false;
	if (facts.naturalWidth < MIN_IMAGE_SIZE || facts.naturalHeight < MIN_IMAGE_SIZE) return false;
	// Rendered size is 0 when not laid out; only trust it when measured.
	if (facts.renderedWidth > 0 && facts.renderedWidth < MIN_IMAGE_SIZE) return false;
	if (facts.renderedHeight > 0 && facts.renderedHeight < MIN_IMAGE_SIZE) return false;
	return true;
}

/** Plain taps open the viewer; modified or non-primary clicks keep native link behavior. */
export function shouldOpenViewer(event: {
	type: string;
	button?: number;
	ctrlKey?: boolean;
	metaKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
}): boolean {
	if (event.type !== 'click') return true;
	return !(
		(event.button ?? 0) !== 0 ||
		event.ctrlKey ||
		event.metaKey ||
		event.shiftKey ||
		event.altKey
	);
}

export interface ScrollFacts {
	top: number;
	clientHeight: number;
	scrollHeight: number;
	anchor: number;
	collapsed: boolean;
}

/** Collapse while scrolling down, expand on scroll up, near the top, at the end, or when it cannot scroll. */
export function nextToolbarState(f: ScrollFacts): { collapsed: boolean; anchor: number } {
	if (f.scrollHeight <= f.clientHeight + 8) return { collapsed: false, anchor: f.top };
	if (f.top < 32 || f.top + f.clientHeight >= f.scrollHeight - 8) {
		return { collapsed: false, anchor: f.top };
	}
	const delta = f.top - f.anchor;
	if (Math.abs(delta) > 12) return { collapsed: delta > 0, anchor: f.top };
	return { collapsed: f.collapsed, anchor: f.anchor };
}

/** Enhance only the rendered, already-sanitized DOM; never persist modified article HTML. */
export function enhanceArticle(
	node: HTMLElement,
	openImage: (image: ArticleImage) => void,
	original: string | null
): () => void {
	const restore: (() => void)[] = [];
	function attribute(element: Element, name: string, value: string) {
		const previous = element.getAttribute(name);
		element.setAttribute(name, value);
		restore.push(() => {
			if (previous === null) element.removeAttribute(name);
			else element.setAttribute(name, previous);
		});
	}

	for (const content of node.querySelectorAll('table, pre')) {
		const region = node.ownerDocument.createElement('div');
		region.className = 'article-scroll-region';
		region.setAttribute('role', 'region');
		region.setAttribute(
			'aria-label',
			content.tagName.toLowerCase() === 'table' ? 'Table' : 'Code block'
		);
		region.setAttribute('tabindex', '0');
		// Future article paging must ignore gestures starting in these native scrollers.
		region.setAttribute('data-reader-horizontal-scroll', '');
		content.before(region);
		region.append(content);
		restore.push(() => {
			region.before(content);
			region.remove();
		});
	}

	const enhanced = new Set<Element>();
	function enhanceImage(image: HTMLImageElement) {
		if (enhanced.has(image)) return;
		const facts: ImageFacts = {
			complete: image.complete,
			naturalWidth: image.naturalWidth,
			naturalHeight: image.naturalHeight,
			renderedWidth: image.clientWidth,
			renderedHeight: image.clientHeight,
			widthAttr: image.getAttribute('width'),
			heightAttr: image.getAttribute('height')
		};
		if (!isViewableImage(facts)) return;
		enhanced.add(image);
		attribute(image, 'role', 'button');
		attribute(image, 'tabindex', '0');
		attribute(image, 'aria-haspopup', 'dialog');
		attribute(image, 'aria-label', `View image${image.alt ? `: ${image.alt}` : ''}`);
	}
	for (const image of node.querySelectorAll('img')) {
		enhanceImage(image);
		if (enhanced.has(image)) continue;
		// Not (yet) viewable: re-evaluate once the image finishes loading.
		const onLoad = () => enhanceImage(image);
		image.addEventListener('load', onLoad);
		restore.push(() => image.removeEventListener('load', onLoad));
	}

	// The placeholder marker is optional: older feed bodies have no removed-embed notice.
	for (const placeholder of node.querySelectorAll(
		'.embed-placeholder, .removed-embed, [data-embed-placeholder]'
	)) {
		if (!placeholder.querySelector('a') && original) {
			const link = node.ownerDocument.createElement('a');
			link.href = original;
			link.textContent = 'Open original';
			placeholder.append(link);
			restore.push(() => link.remove());
		}
	}

	for (const link of node.querySelectorAll('a[href]')) {
		const href = link.getAttribute('href')!;
		if (href.startsWith('#')) continue;
		try {
			const url = new URL(href, original ?? node.ownerDocument.baseURI);
			if (!['https:', 'http:'].includes(url.protocol)) continue;
			attribute(link, 'href', url.href);
			attribute(link, 'target', '_blank');
			attribute(
				link,
				'rel',
				[
					...new Set(
						`${link.getAttribute('rel') ?? ''} noopener noreferrer external`.trim().split(/\s+/)
					)
				].join(' ')
			);
		} catch {
			// Invalid links remain inert under the existing sanitization policy.
		}
	}

	function activate(event: Event) {
		const target = event.target as Element | null;
		const image = target?.closest?.('img');
		if (!image || !node.contains(image) || !enhanced.has(image)) return;
		// Modified/non-primary clicks pass through to a surrounding link untouched.
		if (!shouldOpenViewer(event as MouseEvent)) return;
		if (event.type === 'keydown') {
			const key = (event as KeyboardEvent).key;
			if (key !== 'Enter' && key !== ' ') return;
			if ((event as KeyboardEvent).repeat) return;
		}
		const src = image.currentSrc || image.src;
		if (!src) return;
		// A plain tap on an image inside a publisher link opens the viewer instead of navigating.
		event.preventDefault();
		openImage({ src, alt: image.alt || '', trigger: image });
	}
	node.addEventListener('click', activate);
	node.addEventListener('keydown', activate);
	return () => {
		node.removeEventListener('click', activate);
		node.removeEventListener('keydown', activate);
		for (const undo of restore.reverse()) undo();
	};
}

import { describe, expect, it, vi } from 'vitest';
import { shareArticle } from './share';

const article = { title: 'A good read', url: 'https://example.com/article' };

describe('article sharing', () => {
	it('uses the native share sheet when available', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		const writeText = vi.fn();
		expect(await shareArticle(article, { share, clipboard: { writeText } })).toBe('shared');
		expect(share).toHaveBeenCalledWith(article);
		expect(writeText).not.toHaveBeenCalled();
	});
	it('copies the original URL when Web Share is unavailable', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		expect(await shareArticle(article, { clipboard: { writeText } })).toBe('copied');
		expect(writeText).toHaveBeenCalledWith(article.url);
	});
	it('falls back when native sharing is denied', async () => {
		const share = vi.fn().mockRejectedValue(new Error('Permission denied'));
		const writeText = vi.fn().mockResolvedValue(undefined);
		expect(await shareArticle(article, { share, clipboard: { writeText } })).toBe('copied');
	});
	it('does not copy after the user cancels the share sheet', async () => {
		const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
		const writeText = vi.fn();
		expect(await shareArticle(article, { share, clipboard: { writeText } })).toBe('cancelled');
		expect(writeText).not.toHaveBeenCalled();
	});
	it('surfaces clipboard failures for the UI to report', async () => {
		await expect(shareArticle(article, {})).rejects.toThrow('unavailable');
		await expect(
			shareArticle(article, {
				clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied')) }
			})
		).rejects.toThrow('Clipboard denied');
	});
});

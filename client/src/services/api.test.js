import { afterEach, expect, test, vi } from 'vitest';
import { queryChatbot } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
test('encodes questions and validates the response contract', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answer: 'Policy answer' }) });
  vi.stubGlobal('fetch', fetch);
  expect(await queryChatbot('Returns & refunds?')).toBe('Policy answer');
  expect(fetch.mock.calls[0][0]).toContain('question=Returns+%26+refunds%3F');
  fetch.mockResolvedValue({ ok: true, json: async () => ({ answer: null }) });
  await expect(queryChatbot('Hello')).rejects.toThrow('incomplete response');
});
test('provider errors and network failures use safe messages', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'secret provider detail' }) });
  vi.stubGlobal('fetch', fetch);
  await expect(queryChatbot('Hello')).rejects.toThrow('temporarily unavailable');
  fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(queryChatbot('Hello')).rejects.toThrow('Check your connection');
});
test('timeouts abort the request and show a retryable message', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })));
  const pending = queryChatbot('Hello');
  const assertion = expect(pending).rejects.toThrow('too long');
  await vi.advanceTimersByTimeAsync(70000);
  await assertion;
});

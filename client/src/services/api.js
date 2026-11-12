const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const configuredTimeout = Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS);
const timeoutMs = configuredTimeout > 0 ? configuredTimeout : 70000;

export async function queryChatbot(question, { signal } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(`${apiUrl}/api/v1/query?${new URLSearchParams({ question })}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
    let data;
    try { data = await response.json(); } catch {
      throw new Error('Support returned an unreadable response. Please try again.');
    }
    if (!response.ok) {
      const messages = {
        400: 'Please enter a question of up to 2,000 characters.',
        429: 'You’ve sent a few questions in quick succession. Please wait a minute.',
        504: 'Support took too long to respond. Please try again.'
      };
      throw new Error(messages[response.status] || 'The support service is temporarily unavailable. Please try again.');
    }
    if (typeof data?.answer !== 'string' || !data.answer.trim()) {
      throw new Error('Support returned an incomplete response. Please try again.');
    }
    return data.answer;
  } catch (error) {
    if (timedOut) throw new Error('Support took too long to respond. Please try again.');
    if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (error instanceof TypeError) throw new Error('We couldn’t connect to support. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

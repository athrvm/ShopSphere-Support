import { useCallback, useEffect, useRef, useState } from 'react';
import { queryChatbot } from '../services/api';
import { MAX_QUESTION_LENGTH } from '../config';

export default function useChat() {
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const active = useRef(null);
  const failed = useRef(null);

  useEffect(() => () => active.current?.abort(), []);

  const request = useCallback(async (question, replaceId = null) => {
    if (active.current || !question.trim() || question.length > MAX_QUESTION_LENGTH) return false;
    const controller = new AbortController();
    active.current = controller;
    failed.current = null;
    setPending(true);
    setError(null);
    try {
      const text = await queryChatbot(question, { signal: controller.signal });
      if (controller.signal.aborted) return false;
      const answer = { id: crypto.randomUUID(), role: 'assistant', text, question, timestamp: Date.now() };
      setMessages((current) => replaceId
        ? current.map((message) => message.id === replaceId ? answer : message)
        : [...current, answer]);
      return true;
    } catch (requestError) {
      if (controller.signal.aborted) return false;
      failed.current = { question, replaceId };
      setError(requestError.message);
      return false;
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }, []);

  const send = useCallback(async (question) => {
    const trimmed = question.trim();
    if (active.current || !trimmed || trimmed.length > MAX_QUESTION_LENGTH) return false;
    setMessages((current) => [...current, {
      id: crypto.randomUUID(), role: 'user', text: trimmed, timestamp: Date.now()
    }]);
    return request(trimmed);
  }, [request]);

  const clear = useCallback(() => {
    active.current?.abort();
    active.current = null;
    failed.current = null;
    setMessages([]);
    setError(null);
    setPending(false);
  }, []);

  const retry = useCallback(() => {
    if (failed.current) return request(failed.current.question, failed.current.replaceId);
  }, [request]);

  return { messages, pending, error, send, clear, retry,
    regenerate: (message) => request(message.question, message.id) };
}

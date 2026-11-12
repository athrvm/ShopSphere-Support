import { useEffect, useRef, useState } from 'react';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import { MAX_QUESTION_LENGTH } from '../config';

export default function ChatInput({ onSend, pending, conversationKey }) {
  const [draft, setDraft] = useState('');
  const input = useRef(null);
  const submitting = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setDraft('');
    if (conversationKey > 0) input.current?.focus();
  }, [conversationKey]);
  useEffect(() => {
    const element = input.current;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 150)}px`;
  }, [draft]);
  useEffect(() => {
    if (!window.ResizeObserver) return;
    let previousWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === previousWidth) return;
      previousWidth = entry.contentRect.width;
      const element = input.current;
      element.style.height = 'auto';
      element.style.height = `${Math.min(element.scrollHeight, 150)}px`;
    });
    observer.observe(input.current);
    return () => observer.disconnect();
  }, []);
  async function send(event) {
    event?.preventDefault();
    if (pending || submitting.current || !draft.trim() || draft.length > MAX_QUESTION_LENGTH) return;
    submitting.current = true;
    const submittedDraft = draft;
    const submittedGeneration = generation.current;
    try {
      const succeeded = await onSend(submittedDraft);
      if (succeeded && generation.current === submittedGeneration) {
        setDraft((current) => current === submittedDraft ? '' : current);
      }
    } finally {
      submitting.current = false;
      input.current?.focus();
    }
  }
  return <div className="composer-area"><form className="composer" onSubmit={send}>
    <label className="sr-only" htmlFor="question">Your question</label>
    <textarea id="question" ref={input} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a question about your order or our policies…" maxLength={MAX_QUESTION_LENGTH} aria-describedby="input-help" onKeyDown={(event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
    }} />
    <div className="composer-bottom"><span>ShopSphere Support</span><div>{draft.length > 1800 && <span className="character-count">{draft.length}/{MAX_QUESTION_LENGTH}</span>}<button type="submit" className="send-button" disabled={pending || !draft.trim()} aria-label={pending ? 'Waiting for response' : 'Send question'}>{pending ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={19} />}</button></div></div>
  </form><div className="composer-caption" id="input-help"><span>AI answers can be imperfect. Avoid sharing sensitive information.</span><span className="keyboard-hint"><kbd>Enter</kbd> to send · <kbd>Shift ↵</kbd> for a new line</span></div></div>;
}

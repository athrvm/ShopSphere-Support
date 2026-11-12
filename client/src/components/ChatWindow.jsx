import { useEffect, useRef } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import ChatMessage from './ChatMessage';
import TypingIndicator from './TypingIndicator';
import WelcomeScreen from './WelcomeScreen';

export default function ChatWindow({ messages, pending, error, onSend, onRetry, onRegenerate }) {
  const end = useRef(null);
  const nearBottom = useRef(true);
  useEffect(() => {
    if (nearBottom.current) end.current?.scrollIntoView?.({ behavior: 'instant', block: 'end' });
  }, [messages, pending, error]);
  return <div className="chat-scroll" onScroll={(event) => {
    const area = event.currentTarget;
    nearBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 150;
  }}>
    {!messages.length && !pending ? <WelcomeScreen onQuestion={onSend} pending={pending} /> : <div className="conversation">
      <div className="conversation-heading"><span>YOUR CONVERSATION</span><span>ShopSphere support</span></div>
      <div role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text" aria-busy={pending}>
        {messages.map((message, index) => <ChatMessage key={message.id} message={message} canRegenerate={index === messages.length - 1} onRegenerate={onRegenerate} pending={pending} />)}
      </div>
      {pending && <TypingIndicator />}
      {error && <div className="request-error" role="alert"><AlertCircle size={18} /><div><strong>We couldn’t get an answer.</strong><p>{error}</p><button onClick={onRetry} disabled={pending}><RotateCcw size={14} />Try again</button></div></div>}
      <div ref={end} />
    </div>}
  </div>;
}

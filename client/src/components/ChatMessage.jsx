import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, RotateCcw } from 'lucide-react';
import SupportIcon from './SupportIcon';

const markdownComponents = {
  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a>,
  table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
  img: ({ alt }) => <span>{alt}</span>
};

export default function ChatMessage({ message, canRegenerate, onRegenerate, pending }) {
  const [copyStatus, setCopyStatus] = useState('');
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const assistant = message.role === 'assistant';
  async function copy() {
    try { await navigator.clipboard.writeText(message.text); setCopyStatus('Copied'); }
    catch { setCopyStatus('Copy unavailable'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyStatus(''), 2500);
  }
  return <article className={`chat-message ${message.role}`} aria-label={`${assistant ? 'Support' : 'You'} message`}>
    {assistant && <span className="assistant-avatar"><SupportIcon size={17} /></span>}
    <div className="message-main"><div className="message-meta"><strong>{assistant ? 'ShopSphere Support' : 'You'}</strong>{assistant && <span className="ai-label">AI</span>}<time dateTime={new Date(message.timestamp).toISOString()}>{new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(message.timestamp)}</time></div>
      <div className="message-content">{assistant ? <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>{message.text}</Markdown> : <p className="user-text">{message.text}</p>}</div>
      {assistant && <div className="message-actions"><button onClick={copy} aria-label="Copy response">{copyStatus === 'Copied' ? <Check size={14} /> : <Copy size={14} />}{copyStatus || 'Copy'}</button>{canRegenerate && <button onClick={() => onRegenerate(message)} disabled={pending}><RotateCcw size={14} />Regenerate</button>}<span role="status" className="sr-only">{copyStatus}</span></div>}
    </div>
  </article>;
}

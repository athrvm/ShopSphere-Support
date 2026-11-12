import SupportIcon from './SupportIcon';

export default function TypingIndicator() {
  return <div className="typing-message" role="status"><span className="assistant-avatar"><SupportIcon size={17} /></span><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span><span className="typing-label">Finding an answer…</span></div>;
}

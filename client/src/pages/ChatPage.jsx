import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import ChatWindow from '../components/ChatWindow';
import ChatInput from '../components/ChatInput';
import useChat from '../hooks/useChat';
import useTheme from '../hooks/useTheme';

export default function ChatPage() {
  const chat = useChat();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [conversationKey, setConversationKey] = useState(0);
  useEffect(() => {
    function escape(event) { if (event.key === 'Escape') setMenuOpen(false); }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  function clear() { chat.clear(); setConversationKey((key) => key + 1); }
  return <div className="app-shell">
    <a className="skip-link" href="#question">Skip to question</a>
    <Sidebar onClear={clear} onQuestion={chat.send} pending={chat.pending} open={menuOpen} onClose={() => setMenuOpen(false)} />
    <main className="main-panel" inert={menuOpen || undefined}>
      <Header theme={theme} onTheme={toggleTheme} onClear={clear} hasMessages={chat.messages.length > 0} onMenu={() => setMenuOpen((open) => !open)} menuOpen={menuOpen} />
      <div className="workspace"><ChatWindow messages={chat.messages} pending={chat.pending} error={chat.error} onSend={chat.send} onRetry={chat.retry} onRegenerate={chat.regenerate} />
        <ChatInput onSend={chat.send} pending={chat.pending} conversationKey={conversationKey} />
      </div>
    </main>
  </div>;
}

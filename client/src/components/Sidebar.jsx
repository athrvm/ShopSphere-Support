import { useEffect, useRef } from 'react';
import { FileText, MessageSquare, Plus, ShoppingBag, ArrowUpRight, X } from 'lucide-react';
import { knowledgeDocuments, supportTopics } from '../config';
import SupportIcon from './SupportIcon';

export default function Sidebar({ onClear, onQuestion, pending, open, onClose }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    panel.current?.querySelector('.mobile-close')?.focus();
    return () => previousFocus?.focus();
  }, [open]);
  function containFocus(event) {
    if (!open || event.key !== 'Tab') return;
    const elements = [...panel.current.querySelectorAll('a, button:not(:disabled)')];
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <>
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside ref={panel} id="support-navigation" className={`sidebar ${open ? 'is-open' : ''}`} role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-label="Support navigation" onKeyDown={containFocus}>
      <a className="brand" href="/" aria-label="ShopSphere support home">
        <span className="brand-mark"><ShoppingBag size={21} strokeWidth={1.7} /></span>
        <span>ShopSphere<span className="brand-subtitle">CUSTOMER SUPPORT</span></span>
      </a>
      <button className="mobile-close icon-button" onClick={onClose} aria-label="Close menu"><X size={19} /></button>
      <button className="new-conversation" onClick={() => { onClear(); onClose(); }}><Plus size={17} />New conversation</button>
      <div className="sidebar-current"><MessageSquare size={17} /><span>Ask support</span><span className="current-indicator" /></div>
      <nav aria-label="Support topics" className="topic-nav">
        <h2 className="section-label">SUPPORT TOPICS</h2>
        {supportTopics.map((topic) => <button key={topic.id} disabled={pending} onClick={() => { onQuestion(topic.question); onClose(); }}>
          <SupportIcon type={topic.icon} size={17} /><span>{topic.title}</span><ArrowUpRight className="topic-arrow" size={13} />
        </button>)}
      </nav>
      <div className="sidebar-knowledge">
        <h2 className="section-label">OUR KNOWLEDGE BASE</h2>
        <p>Answers grounded in our policies.</p>
        <ul>{knowledgeDocuments.map((title) => <li key={title}><FileText size={14} aria-hidden="true" />{title}</li>)}</ul>
      </div>
      <div className="sidebar-footer"><span className="small-brand">S</span><div>Here to help.<span>One question at a time.</span></div></div>
    </aside>
  </>;
}

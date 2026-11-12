import { Menu, Moon, Sun, Trash2 } from 'lucide-react';

export default function Header({ theme, onTheme, onClear, hasMessages, onMenu, menuOpen }) {
  return <header className="header">
    <div className="header-title"><button className="menu-button icon-button" onClick={onMenu} aria-label="Open navigation" aria-controls="support-navigation" aria-expanded={menuOpen}><Menu size={20} /></button>
      <span>Help centre</span><span className="header-divider">/</span><strong>Ask support</strong>
    </div>
    <div className="header-actions"><span className="support-status"><span />AI support</span>
      <span className="action-divider" />
      <button className="icon-button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={onTheme}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
      <button className="icon-button" aria-label="Clear conversation" title="Clear conversation" onClick={onClear} disabled={!hasMessages}><Trash2 size={17} /></button>
    </div>
  </header>;
}

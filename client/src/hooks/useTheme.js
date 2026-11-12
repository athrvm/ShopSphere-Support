import { useEffect, useState } from 'react';

function initialTheme() {
  try {
    const saved = localStorage.getItem('shopsphere-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Theme still works when storage is unavailable. */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('shopsphere-theme', theme); } catch { /* Optional preference. */ }
  }, [theme]);
  return { theme, toggleTheme: () => setTheme((current) => current === 'light' ? 'dark' : 'light') };
}

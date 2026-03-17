import { useState, useEffect } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('aria_theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('aria_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const applyTheme = (light) => setTheme(light ? 'light' : 'dark');

  return { theme, toggleTheme, applyTheme };
}

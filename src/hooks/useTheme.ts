import { useState, useEffect } from 'react';

export type Theme = 'dark' | 'light' | 'purple' | 'ocean' | 'emerald' | 'sunset';

export const THEMES = [
  { id: 'dark',    name: 'Dark',           desc: 'Escuro profissional', icon: '🌑', type: 'dark' },
  { id: 'light',   name: 'Light',          desc: 'Claro e limpo',       icon: '☀️', type: 'light' },
  { id: 'purple',  name: 'Midnight Purple', desc: 'Roxo elegante',      icon: '💜', type: 'dark' },
  { id: 'ocean',   name: 'Ocean Blue',     desc: 'Azul oceano',         icon: '🌊', type: 'dark' },
  { id: 'emerald', name: 'Emerald',        desc: 'Verde esmeralda',     icon: '🌿', type: 'dark' },
  { id: 'sunset',  name: 'Sunset',         desc: 'Laranja pôr do sol',  icon: '🔥', type: 'dark' },
];

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('optiflow_theme') as Theme) || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('optiflow_theme', theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('optiflow_theme', t);
  };

  return { theme, setTheme, themes: THEMES };
}

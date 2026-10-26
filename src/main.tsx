
// Inicializar tema salvo
const savedTheme = localStorage.getItem('optiflow_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

// Registra o service worker (necessario para "instalar" o sistema como aplicativo
// no celular). Ele nao guarda nada em cache - ver public/sw.js.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

// Rolar a pagina com o mouse em cima de um campo numerico focado mudava o valor sozinho (ex.: entrada 90 virou 89,99
// no teste de 26/10/2026). Ao rolar, o campo perde o foco e a pagina rola normalmente, sem mexer no numero.
document.addEventListener('wheel', (e) => {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement && el.type === 'number' && e.target === el) el.blur();
}, { passive: true });

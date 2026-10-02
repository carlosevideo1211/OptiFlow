
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

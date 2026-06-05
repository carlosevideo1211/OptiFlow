
// Inicializar tema salvo
const savedTheme = localStorage.getItem('optiflow_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

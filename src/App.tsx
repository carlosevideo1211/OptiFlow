import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Shell from './components/Shell';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ClientesPage from './pages/ClientesPage';
import ConsultaPage from './pages/consulta/ConsultaPage';
import AtendimentoPage from './pages/consulta/AtendimentoPage';
import AgendaPage from './pages/AgendaPage';
import HistoricoPage from './pages/consulta/HistoricoPage';
import ProntuarioPage from './pages/consulta/ProntuarioPage';
import OrdemServicoPage from './pages/OrdemServicoPage';
import VendasPage from './pages/VendasPage';
import ProdutosPage from './pages/ProdutosPage';
import EstoquePage from './pages/EstoquePage';
import CrediarioPage from './pages/CrediarioPage';
import PlanosPage from './pages/PlanosPage';
import PlanosSuccessPage from './pages/planos/SuccessPage';
import FinanceiroPage from './pages/FinanceiroPage';
import RelatoriosPage from './pages/RelatoriosPage';
import CadastrosPage from './pages/CadastrosPage';
import ConfiguracaoPage from './pages/ConfiguracaoPage';

import NfePage from './pages/NfePage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminPanelPage from './pages/admin/AdminPanelPage';
import TrialExpiredPage from './pages/TrialExpiredPage';
function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (location.pathname.startsWith('/admin')) {
    return (
      <Routes>
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route path="/admin"       element={<AdminPanelPage />} />
        <Route path="/admin/*"     element={<AdminPanelPage />} />
      </Routes>
    );
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', background:'#0B1120', flexDirection:'column', gap:12 }}>
      <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="10" fill="url(#load)"/>
        <ellipse cx="16" cy="16" rx="10" ry="6" stroke="white" strokeWidth="1.8" fill="none"/>
        <circle cx="16" cy="16" r="3.5" fill="white"/>
        <defs><linearGradient id="load" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1"/><stop offset="1" stopColor="#06b6d4"/>
        </linearGradient></defs>
      </svg>
      <div style={{ color:'#06b6d4', fontSize:14, fontWeight:600 }}>Carregando OptiFlow...</div>
    </div>
  );

  return (
    <Routes>
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route path="/admin"       element={<AdminPanelPage />} />
      <Route path="/admin/*"     element={<AdminPanelPage />} />
      <Route path="/planos"        element={<PlanosPage />} />
      <Route path="/planos/sucesso"  element={<PlanosSuccessPage />} />
      <Route path="/login"       element={!user ? <LoginPage />    : <Navigate to="/dashboard" />} />
      <Route path="/registro"    element={!user ? <RegisterPage /> : <Navigate to="/dashboard" />} />
      <Route path="/esqueci-senha" element={!user ? <ForgotPasswordPage /> : <Navigate to="/dashboard" />} />
      <Route path="/trial-expirado" element={<TrialExpiredPage />} />
      <Route path="/*" element={
        (!user && !localStorage.getItem('admin_viewing_tenant')) ? <Navigate to="/login" /> :
        <Shell>
          <Routes>
            <Route path="/dashboard"    element={<DashboardPage />} />
            <Route path="/clientes"     element={<ClientesPage />} />
            <Route path="/consulta"     element={<ConsultaPage />} />
            <Route path="/consulta/atendimento/novo" element={<AtendimentoPage />} />
            <Route path="/consulta/atendimento/:id"  element={<AtendimentoPage />} />
            <Route path="/consulta/historico/:customerId" element={<HistoricoPage />} />
            <Route path="/consulta/prontuario/:customerId" element={<ProntuarioPage />} />
            <Route path="/agenda" element={<AgendaPage />} />
            <Route path="/os"           element={<OrdemServicoPage />} />
            <Route path="/vendas"       element={<VendasPage />} />
            <Route path="/produtos"     element={<ProdutosPage />} />
            <Route path="/estoque"      element={<EstoquePage />} />
            <Route path="/crediario"    element={<CrediarioPage />} />
            <Route path="/financeiro"   element={<FinanceiroPage />} />
            <Route path="/relatorios"   element={<RelatoriosPage />} />
            <Route path="/cadastros"    element={<CadastrosPage />} />
            <Route path="/configuracao" element={<ConfiguracaoPage />} />
            <Route path="/nfe"          element={<NfePage />} />
            <Route path="*"             element={<Navigate to="/dashboard" />} />
          </Routes>
        </Shell>
      } />
    </Routes>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{
          style: { background:'#1A2235', color:'#E8EDF5',
            border:'1px solid rgba(255,255,255,0.08)', fontSize:13 }
        }} />
      </AuthProvider>
    </BrowserRouter>
  );
}







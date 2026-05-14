import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Shell from './components/Shell';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ClientesPage from './pages/ClientesPage';
import ConsultaPage from './pages/consulta/ConsultaPage';
import OrdemServicoPage from './pages/OrdemServicoPage';
import VendasPage from './pages/VendasPage';
import ProdutosPage from './pages/ProdutosPage';
import EstoquePage from './pages/EstoquePage';
import CrediarioPage from './pages/CrediarioPage';
import FinanceiroPage from './pages/FinanceiroPage';
import RelatoriosPage from './pages/RelatoriosPage';
import CadastrosPage from './pages/CadastrosPage';
import ConfiguracaoPage from './pages/ConfiguracaoPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminPanelPage from './pages/admin/AdminPanelPage';
import TrialExpiredPage from './pages/TrialExpiredPage';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0B1120', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:32 }}>👁️</div>
      <div style={{ color:'var(--accent)', fontSize:14, fontWeight:600 }}>Carregando OptiFlow...</div>
    </div>
  );

  const isAdmin = user?.role === 'system_admin';
  const trialExpired = user && user.role !== 'system_admin';

  return (
    <Routes>
      <Route path="/login"    element={!user ? <LoginPage />    : <Navigate to="/dashboard" />} />
      <Route path="/registro" element={!user ? <RegisterPage /> : <Navigate to="/dashboard" />} />
      <Route path="/trial-expirado" element={<TrialExpiredPage />} />
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route path="/admin/*"     element={<AdminPanelPage />} />
      <Route path="/*" element={
        !user ? <Navigate to="/login" /> :
        <Shell>
          <Routes>
            <Route path="/dashboard"   element={<DashboardPage />} />
            <Route path="/clientes"    element={<ClientesPage />} />
            <Route path="/consulta"    element={<ConsultaPage />} />
            <Route path="/os"          element={<OrdemServicoPage />} />
            <Route path="/vendas"      element={<VendasPage />} />
            <Route path="/produtos"    element={<ProdutosPage />} />
            <Route path="/estoque"     element={<EstoquePage />} />
            <Route path="/crediario"   element={<CrediarioPage />} />
            <Route path="/financeiro"  element={<FinanceiroPage />} />
            <Route path="/relatorios"  element={<RelatoriosPage />} />
            <Route path="/cadastros"   element={<CadastrosPage />} />
            <Route path="/configuracao" element={<ConfiguracaoPage />} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
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
          style: { background:'#1A2235', color:'#E8EDF5', border:'1px solid rgba(255,255,255,0.08)', fontSize:13 }
        }} />
      </AuthProvider>
    </BrowserRouter>
  );
}

import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Eye, ClipboardList, ShoppingCart, Calendar,
  Package, Boxes, CreditCard, TrendingUp, BarChart3, FileText,
  BookUser, Settings, LogOut, Menu, X, Bell, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const navSections = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard',  label: 'Dashboard',       icon: LayoutDashboard, sub: false },
      { to: '/clientes',   label: 'Clientes',         icon: Users,           sub: false },
      { to: '/consulta',   label: 'Consulta / Rx',    icon: Eye,             sub: false },
      { to: '/os',         label: 'Ordem de Serviço', icon: ClipboardList,   sub: false },
      { to: '/vendas',     label: 'Vendas / PDV',     icon: ShoppingCart,    sub: false },
    ]
  },
  {
    label: 'Estoque',
    items: [
      { to: '/produtos', label: 'Produtos', icon: Package, sub: false },
      { to: '/estoque',  label: 'Estoque',  icon: Boxes,   sub: false },
    ]
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/crediario',  label: 'Crediário',  icon: CreditCard, sub: false },
      { to: '/financeiro', label: 'Financeiro', icon: TrendingUp, sub: false },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3,  sub: false },
      { to: '/nfe',        label: 'NF-e',       icon: FileText,   sub: false },
    ]
  },
  {
    label: 'Sistema',
    items: [
      { to: '/cadastros',    label: 'Cadastros',    icon: BookUser, sub: false },
      { to: '/configuracao', label: 'Configuração', icon: Settings, sub: false },
    ]
  }
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, tenantId, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges]         = useState({ os: 0, parcelas: 0 });
  const [trialDays, setTrialDays]   = useState<number | null>(null);
  const [tooltip, setTooltip]       = useState<{ label: string; y: number } | null>(null);

  useEffect(() => {
    if (!tenantId || !user) return;
    const loadData = async () => {
      const { count: osCount } = await supabase
        .from('service_orders')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pronta');
      const today = new Date().toISOString().split('T')[0];
      const { count: parcCount } = await supabase
        .from('crediario_parcelas')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pendente')
        .lt('due_date', today);
      const { data: tenant } = await supabase
        .from('tenants')
        .select('trial_end_date, status, plan')
        .eq('id', tenantId)
        .single();
      if (tenant?.trial_end_date && tenant.status === 'trial') {
        const end  = new Date(tenant.trial_end_date);
        const now  = new Date();
        const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        setTrialDays(Math.max(0, diff));
      }
      setBadges({ os: osCount || 0, parcelas: parcCount || 0 });
    };
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [tenantId]);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Até logo!');
    navigate('/login');
  };

  const initials = user?.full_name?.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase() ?? 'OP';

  const badgeFor = (to: string) => {
    if (to === '/os')        return badges.os;
    if (to === '/crediario') return badges.parcelas;
    return 0;
  };

  const sidebarW = collapsed ? 64 : 220;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:998 }}/>
      )}

      {/* Sidebar */}
      <aside style={{
        position:'fixed', top:0, left: mobileOpen ? 0 : undefined,
        bottom:0, width: sidebarW,
        background:'var(--bg-sidebar)',
        borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column',
        zIndex:999, transition:'width .2s',
        transform: typeof window !== 'undefined' && window.innerWidth < 768 && !mobileOpen ? 'translateX(-100%)' : 'none',
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '16px 0' : '16px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          {!collapsed && (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="10" fill="url(#lg1)"/>
                <ellipse cx="16" cy="16" rx="10" ry="6" stroke="white" strokeWidth="1.8" fill="none"/>
                <circle cx="16" cy="16" r="3.5" fill="white"/>
                <defs><linearGradient id="lg1" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1"/><stop offset="1" stopColor="#06b6d4"/>
                </linearGradient></defs>
              </svg>
              <span style={{ fontWeight:700, fontSize:15, letterSpacing:'.02em' }}>
                Opti<span style={{ color:'#06b6d4' }}>Flow</span>
              </span>
            </div>
          )}
          {collapsed && (
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="10" fill="url(#lg2)"/>
              <ellipse cx="16" cy="16" rx="10" ry="6" stroke="white" strokeWidth="1.8" fill="none"/>
              <circle cx="16" cy="16" r="3.5" fill="white"/>
              <defs>
                <linearGradient id="lg2" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1"/><stop offset="1" stopColor="#06b6d4"/>
                </linearGradient>
              </defs>
            </svg>
          )}
          <button onClick={() => setCollapsed(v => !v)}
            style={{ background:'rgba(255,255,255,.07)', border:'none', borderRadius:8,
              padding:'6px', cursor:'pointer', color:'rgba(255,255,255,.5)',
              display:'flex', alignItems:'center', flexShrink:0 }}>
            {collapsed ? <ChevronRight size={15}/> : <Menu size={15}/>}
          </button>
        </div>

        {/* Trial banner */}
        {trialDays !== null && !collapsed && (
          <div style={{ margin:'12px 12px 0', padding:'8px 12px', borderRadius:8,
            background: trialDays <= 3 ? 'rgba(248,113,113,.15)' : 'rgba(99,102,241,.12)',
            border: '1px solid '+(trialDays<=3?'rgba(248,113,113,.3)':'rgba(99,102,241,.25)') }}>
            <div style={{ fontSize:11, fontWeight:600,
              color: trialDays<=3?'#f87171':'#a5b4fc', marginBottom:4 }}>
              {trialDays<=3 ? '⚠️ Trial expirando!' : '🕐 Período de teste'}
            </div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.6)' }}>
              {trialDays > 0 ? trialDays+' dia'+(trialDays!==1?'s':'')+' restante'+(trialDays!==1?'s':'') : 'Expirado hoje'}
            </div>
            <div style={{ marginTop:6, height:3, borderRadius:2, background:'rgba(255,255,255,.1)' }}>
              <div style={{ height:'100%', borderRadius:2, width: Math.min(100,(14-trialDays)/14*100)+'%',
                background: trialDays<=3?'#f87171':'#6366f1', transition:'width .3s' }}/>
            </div>
          </div>
        )}

        {/* Nav */}
        <div style={{ flex:1, overflowY:'auto', padding:'8px 0', marginTop:8 }}>
          {navSections.map(section => (
            <div key={section.label} style={{ marginBottom:4 }}>
              {!collapsed && (
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em',
                  color:'rgba(255,255,255,.3)', padding:'8px 16px 4px', textTransform:'uppercase' }}>
                  {section.label}
                </div>
              )}
              {collapsed && <div style={{ height:12 }}/>}
              {section.items.map(({ to, label, icon: Icon, sub }) => {
                const badge = badgeFor(to);
                return (
                  <div key={to} style={{ position:'relative', margin:'1px 8px', marginLeft: sub && !collapsed ? '24px' : '8px' }}
                    onMouseEnter={e => collapsed && setTooltip({ label, y: (e.currentTarget as HTMLElement).getBoundingClientRect().top })}
                    onMouseLeave={() => setTooltip(null)}>
                    {sub && !collapsed && (
                      <div style={{ position:'absolute', left:-12, top:'50%', transform:'translateY(-50%)',
                        width:8, height:1, background:'rgba(255,255,255,.2)' }}/>
                    )}
                    <NavLink to={to}
                      className={({ isActive }) => 'nav-item '+(isActive?'active':'')}
                      style={{ justifyContent: collapsed?'center':'flex-start',
                        padding: collapsed?'10px': sub ? '7px 12px' : '10px 12px',
                        borderRadius:8, position:'relative', gap: collapsed?0:10 }}>
                      <Icon size={sub ? 14 : 16} style={{ flexShrink:0, opacity: sub ? 0.75 : 1 }}/>
                      {!collapsed && (
                        <span style={{ flex:1, fontSize: sub ? 12 : 13, fontWeight: sub ? 400 : 500,
                          color: sub ? 'rgba(255,255,255,.65)' : 'inherit' }}>
                          {label}
                        </span>
                      )}
                      {badge > 0 && (
                        <span style={{ background:'#f87171', color:'white', fontSize:10,
                          fontWeight:700, borderRadius:10, padding:'1px 6px',
                          minWidth:18, textAlign:'center',
                          position: collapsed?'absolute':'static',
                          top: collapsed?6:'auto', right: collapsed?6:'auto' }}>
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* User */}
        <div style={{ borderTop:'1px solid var(--border)', padding:'12px', flexShrink:0 }}>
          {!collapsed && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:32, height:32, borderRadius:'50%',
                background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {initials}
              </div>
              <div style={{ overflow:'hidden' }}>
                <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {user?.full_name ?? 'Usuário'}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {user?.role === 'master' ? 'Master' : 'Operador'}
                </div>
              </div>
            </div>
          )}
          <button onClick={handleSignOut}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent: collapsed?'center':'flex-start',
              gap:8, padding:'8px', borderRadius:8, border:'none', background:'rgba(248,113,113,.1)',
              color:'#f87171', cursor:'pointer', fontSize:13, fontWeight:500 }}>
            <LogOut size={15}/>
            {!collapsed && 'Sair'}
          </button>
        </div>
      </aside>

      {/* Tooltip collapsed */}
      {tooltip && collapsed && (
        <div style={{ position:'fixed', left:72, top: tooltip.y, zIndex:1000,
          background:'#1e293b', border:'1px solid rgba(255,255,255,.1)',
          borderRadius:6, padding:'6px 10px', fontSize:12, fontWeight:500,
          color:'#e2e8f0', pointerEvents:'none', whiteSpace:'nowrap' }}>
          {tooltip.label}
        </div>
      )}

      {/* Main */}
      <main style={{ marginLeft: sidebarW, minHeight:'100vh', transition:'margin-left .2s',
        background:'var(--bg-main)', padding:'24px' }}>
        {/* Mobile header */}
        <div style={{ display:'none' }} className="mobile-header">
          <button onClick={() => setMobileOpen(v => !v)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text)' }}>
            <Menu size={22}/>
          </button>
        </div>
        {children}
      </main>
    </>
  );
}

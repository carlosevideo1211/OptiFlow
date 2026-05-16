import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Eye, ClipboardList, ShoppingCart,
  Package, Boxes, CreditCard, TrendingUp, BarChart3,
  BookUser, Settings, LogOut, Menu, X, Bell, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const navSections = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
      { to: '/clientes',   label: 'Clientes',         icon: Users           },
      { to: '/consulta',   label: 'Consulta / Rx',    icon: Eye             },
      { to: '/os',         label: 'Ordem de Serviço', icon: ClipboardList   },
      { to: '/vendas',     label: 'Vendas / PDV',     icon: ShoppingCart    },
    ]
  },
  {
    label: 'Estoque',
    items: [
      { to: '/produtos', label: 'Produtos', icon: Package },
      { to: '/estoque',  label: 'Estoque',  icon: Boxes   },
    ]
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/crediario',  label: 'Crediário',  icon: CreditCard },
      { to: '/financeiro', label: 'Financeiro', icon: TrendingUp },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3  },
    ]
  },
  {
    label: 'Sistema',
    items: [
      { to: '/cadastros',    label: 'Cadastros',    icon: BookUser },
      { to: '/configuracao', label: 'Configuração', icon: Settings },
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

  // Carregar badges e trial
  useEffect(() => {
    if (!tenantId || !user) return;
    const loadData = async () => {
      // OS prontas para entrega
      const { count: osCount } = await supabase
        .from('service_orders')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pronta');

      // Parcelas vencidas
      const today = new Date().toISOString().split('T')[0];
      const { count: parcCount } = await supabase
        .from('crediario_parcelas')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pendente')
        .lt('due_date', today);

      // Trial
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

      <div className="app-layout" style={{ '--sidebar-w': sidebarW+'px' } as any}>
        {/* ── SIDEBAR ── */}
        <aside className="sidebar" style={{
          width: sidebarW,
          transition: 'width .25s ease',
          overflow: 'hidden',
          position: 'fixed', top:0, left:0, bottom:0, zIndex:999,
          display: 'flex', flexDirection:'column',
        }}>

          {/* Logo + collapse button */}
          <div style={{ display:'flex', alignItems:'center', justifyContent: collapsed?'center':'space-between',
            padding: collapsed?'20px 0':'20px 16px', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
            {!collapsed && (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {/* SVG Logo */}
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect width="32" height="32" rx="10" fill="url(#lg)"/>
                  <ellipse cx="16" cy="16" rx="10" ry="6" stroke="white" strokeWidth="1.8" fill="none"/>
                  <circle cx="16" cy="16" r="3.5" fill="white"/>
                  <circle cx="16" cy="16" r="1.5" fill="url(#lg)"/>
                  <defs>
                    <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#6366f1"/>
                      <stop offset="1" stopColor="#06b6d4"/>
                    </linearGradient>
                  </defs>
                </svg>
                <span style={{ fontSize:18, fontWeight:800, color:'white', letterSpacing:'-0.5px' }}>
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
              {/* Progress bar */}
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
                {section.items.map(({ to, label, icon: Icon }) => {
                  const badge = badgeFor(to);
                  return (
                    <div key={to} style={{ position:'relative', margin:'1px 8px' }}
                      onMouseEnter={e => collapsed && setTooltip({ label, y: (e.currentTarget as HTMLElement).getBoundingClientRect().top })}
                      onMouseLeave={() => setTooltip(null)}>
                      <NavLink to={to}
                        className={({ isActive }) => 'nav-item '+(isActive?'active':'')}
                        style={{ justifyContent: collapsed?'center':'flex-start',
                          padding: collapsed?'10px':'10px 12px', borderRadius:8,
                          position:'relative', gap: collapsed?0:10 }}>
                        <Icon size={16} style={{ flexShrink:0 }}/>
                        {!collapsed && <span style={{ flex:1, fontSize:13, fontWeight:500 }}>{label}</span>}
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

          {/* Footer */}
          <div style={{ borderTop:'1px solid rgba(255,255,255,.07)', padding:'12px 8px' }}>
            {!collapsed && (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px',
                borderRadius:8, background:'rgba(255,255,255,.05)', marginBottom:4 }}>
                <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
                  background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:700, color:'white' }}>
                  {initials}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'white',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {user?.full_name}
                  </div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', textTransform:'capitalize' }}>
                    {user?.role}
                  </div>
                </div>
              </div>
            )}
            {collapsed && (
              <div style={{ display:'flex', justifyContent:'center', marginBottom:4 }}>
                <div style={{ width:32, height:32, borderRadius:'50%',
                  background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:700, color:'white' }}>
                  {initials}
                </div>
              </div>
            )}
            <button onClick={handleSignOut}
              style={{ width:'100%', display:'flex', alignItems:'center',
                justifyContent: collapsed?'center':'flex-start',
                gap:8, padding: collapsed?'8px':'8px 10px',
                background:'none', border:'none', borderRadius:8, cursor:'pointer',
                color:'rgba(248,113,113,.8)', fontSize:13, fontWeight:500,
                transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,.1)'; e.currentTarget.style.color='#f87171'; }}
              onMouseLeave={e => { e.currentTarget.style.background='none'; e.currentTarget.style.color='rgba(248,113,113,.8)'; }}>
              <LogOut size={16} style={{ flexShrink:0 }}/>
              {!collapsed && 'Sair'}
            </button>
          </div>
        </aside>

        {/* Tooltip para modo colapsado */}
        {tooltip && collapsed && (
          <div style={{ position:'fixed', left:72, top:tooltip.y, zIndex:9999,
            background:'#1e293b', border:'1px solid rgba(255,255,255,.1)',
            borderRadius:8, padding:'6px 12px', fontSize:13, fontWeight:500,
            color:'white', pointerEvents:'none', whiteSpace:'nowrap',
            boxShadow:'0 4px 20px rgba(0,0,0,.4)' }}>
            {tooltip.label}
          </div>
        )}

        {/* ── MAIN ── */}
        <main style={{ marginLeft: sidebarW, minHeight:'100vh', transition:'margin-left .25s ease', padding:'28px 32px', background:'var(--bg)', width:'calc(100% - '+sidebarW+'px)', boxSizing:'border-box' }}>
          {children}
        </main>
      </div>

      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(v => !v)}
        style={{ display:'none', position:'fixed', top:16, left:16, zIndex:1000,
          background:'#1e293b', border:'1px solid rgba(255,255,255,.1)',
          borderRadius:10, padding:10, cursor:'pointer', color:'white' }}
        className="mobile-menu-btn">
        {mobileOpen ? <X size={20}/> : <Menu size={20}/>}
      </button>
    </>
  );
}

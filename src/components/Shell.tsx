import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Eye, ClipboardList, ShoppingCart,
  Package, Boxes, CreditCard, TrendingUp, BarChart3,
  BookUser, Settings, LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
      { to: '/produtos',   label: 'Produtos',   icon: Package },
      { to: '/estoque',    label: 'Estoque',    icon: Boxes   },
    ]
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/crediario',  label: 'Crediário',  icon: CreditCard  },
      { to: '/financeiro', label: 'Financeiro', icon: TrendingUp  },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3   },
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
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    toast.success('Até logo!');
    navigate('/login');
  };

  const initials = user?.full_name?.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase() ?? 'OP';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">👁️</div>
          <div className="sidebar-logo-text">Opti<span>Flow</span></div>
        </div>

        {/* Nav */}
        {navSections.map(section => (
          <div key={section.label} className="sidebar-section">
            <div className="sidebar-section-label">{section.label}</div>
            {section.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Icon size={16} />{label}
              </NavLink>
            ))}
          </div>
        ))}

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user?.full_name}
              </div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
          <button className="nav-item" onClick={handleSignOut} style={{ color:'var(--danger)' }}>
            <LogOut size={16} />Sair
          </button>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}

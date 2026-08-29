import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Calendar, Eye, EyeOff, ClipboardList, ShoppingCart, CreditCard, BarChart3, Check, ArrowRight,
} from 'lucide-react';
import { PLANO_OTICA, PLANO_CONSULTORIO } from '../../constants/planos';

// Grade de modulos em destaque no painel de marketing. E uma vitrine, nao a
// lista completa de tudo que o sistema tem (isso ficaria poluido demais
// numa tela de login) -- por isso a linha "+ Estoque, Financeiro, NF-e e
// muito mais" logo abaixo, sinalizando que tem mais sem competir
// visualmente com os planos, que sao o foco da tela.
const MODULOS_DESTAQUE = [
  { Icon: Calendar, label: 'Agenda' },
  { Icon: Eye, label: 'Consulta / Rx' },
  { Icon: ClipboardList, label: 'Ordem de Serviço' },
  { Icon: ShoppingCart, label: 'Vendas / PDV' },
  { Icon: CreditCard, label: 'Crediário' },
  { Icon: BarChart3, label: 'Relatórios' },
];

// Logo (marca "olho") do OptiFlow, exatamente como usada no menu lateral do
// sistema (Shell.tsx) -- gradiente indigo -> ciano, sem emoji.
function LogoMark({ size, id }: { size: number; id: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="10" fill={`url(#${id})`} />
      <ellipse cx="16" cy="16" rx="10" ry="6" stroke="white" strokeWidth="1.8" fill="none" />
      <circle cx="16" cy="16" r="3.5" fill="white" />
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Email ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap' }}>

        {/* Lado esquerdo - Login */}
        <div style={{ width: '40%', minWidth: 360, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 40px' }}>
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
              <LogoMark size={36} id="lg-login-esq" />
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Opti<span style={{ color: '#06b6d4' }}>Flow</span></span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Bem-vindo de volta</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Entre para acessar o sistema</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>E-MAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                required
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>SENHA</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 700 }}>
              {loading ? 'Entrando...' : 'Entrar no sistema →'}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Não tem conta? <Link to="/registro" style={{ color: '#6366f1', fontWeight: 600 }}>Criar agora →</Link>
            </p>
            <p style={{ marginTop: 8 }}>
              <Link to="/admin" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Acesso administrativo</Link>
            </p>
            <p style={{ marginTop: 8 }}>
              <Link to="/esqueci-senha" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Esqueci minha senha</Link>
            </p>
          </div>
        </div>

        {/* Lado direito - Marketing + Planos */}
        <div style={{
          flex: 1, minWidth: 480, borderLeft: '1px solid var(--border)', padding: '48px 56px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          background: 'radial-gradient(circle at 12% 15%, rgba(99,102,241,0.14), transparent 45%), radial-gradient(circle at 90% 80%, rgba(6,182,212,0.10), transparent 45%)',
        }}>
          <div style={{ marginBottom: 24, boxShadow: '0 12px 28px rgba(99,102,241,0.3)', borderRadius: 18, width: 64, height: 64 }}>
            <LogoMark size={64} id="lg-login-dir" />
          </div>

          <h2 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', lineHeight: 1.15, marginBottom: 12, maxWidth: 480 }}>
            Sistema completo para <span style={{ color: '#06b6d4' }}>óticas</span> e <span style={{ color: '#6366f1' }}>consultórios</span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 24, maxWidth: 460 }}>
            Consulta/Rx, Ordem de Serviço, Vendas/PDV, Crediário, Estoque e Relatórios — tudo integrado, num só sistema.
          </p>

          {/* Selos de confiança */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
            {['14 dias grátis', 'Cartão ou Pix', 'Cancele quando quiser'].map(txt => (
              <div key={txt} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>
                <Check size={12} />{txt}
              </div>
            ))}
          </div>

          {/* Grid de módulos */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12 }}>TUDO QUE VOCÊ PRECISA</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 8 }}>
            {MODULOS_DESTAQUE.map(({ Icon, label }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(99,102,241,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
                  <Icon size={14} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 28 }}>+ Estoque, Financeiro e muito mais</div>

          {/* Planos */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12 }}>ESCOLHA SEU PLANO</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            <div style={{ position: 'relative', background: 'rgba(99,102,241,0.06)', border: '1.5px solid #6366f1', borderRadius: 12, padding: 16 }}>
              <div style={{ position: 'absolute', top: 10, right: 10, background: '#6366f1', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>Mais completo</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Ótica</div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>R$ {PLANO_OTICA.valor.toFixed(2).replace('.', ',')}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/mês</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10 }}>Ótica completa + Consulta/Rx</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {PLANO_OTICA.features.slice(2, 6).map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
                    <Check size={11} color="#6366f1" />{f}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Consultório</div>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>R$ {PLANO_CONSULTORIO.valor.toFixed(2).replace('.', ',')}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/mês</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 10 }}>Só Consulta/Rx</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {PLANO_CONSULTORIO.features.slice(2, 5).map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
                    <Check size={11} color="#06b6d4" />{f}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = "/planos"; }}
            style={{ marginTop: 16, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 10px 28px rgba(99,102,241,0.35)' }}>
            Ver planos e criar conta <ArrowRight size={15} />
          </button>
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>Sem compromisso · Cancele quando quiser</div>
        </div>
      </div>

      {/* Rodapé */}
      <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
        <a href="/termos" style={{ color: 'var(--text-muted)', textDecoration: 'underline', marginRight: 16 }}>Termos de Uso</a>
        <a href="/privacidade" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>Politica de Privacidade</a>
      </div>
    </div>
  );
}

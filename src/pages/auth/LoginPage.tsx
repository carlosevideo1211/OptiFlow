import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

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
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      {/* Lado esquerdo - Login */}
      <div style={{ width:'40%', minWidth:340, display:'flex', flexDirection:'column', justifyContent:'center', padding:'48px 40px' }}>
        <div style={{ marginBottom:40 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:32 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#6366f1,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ color:'white', fontSize:18 }}>👁</span>
            </div>
            <span style={{ fontSize:20, fontWeight:800, color:'var(--text)' }}>Opti<span style={{ color:'#6366f1' }}>Flow</span></span>
          </div>
          <h1 style={{ fontSize:26, fontWeight:800, color:'var(--text)', marginBottom:8 }}>Bem-vindo de volta</h1>
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>Entre para acessar o sistema</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>E-MAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              required
              style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-secondary)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }}
            />
          </div>
          <div style={{ marginBottom:24 }}>
            <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>SENHA</label>
            <div style={{ position:'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                style={{ width:'100%', padding:'10px 40px 10px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-secondary)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }}
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:16 }}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary"
            style={{ width:'100%', padding:'12px', fontSize:15, fontWeight:700 }}>
            {loading ? 'Entrando...' : 'Entrar no sistema →'}
          </button>
        </form>

        <div style={{ marginTop:24, textAlign:'center' }}>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>
            Não tem conta? <Link to="/registro" style={{ color:'#6366f1', fontWeight:600 }}>Criar agora →</Link>
          </p>
          <p style={{ marginTop:8 }}>
            <Link to="/admin" style={{ color:'var(--text-muted)', fontSize:12 }}>Acesso administrativo</Link>
          </p>
          <p style={{ marginTop:8 }}>
            <Link to="/esqueci-senha" style={{ color:'var(--text-muted)', fontSize:12 }}>Esqueci minha senha</Link>
          </p>
        </div>
      </div>

      {/* Lado direito - Info + Planos */}
      <div style={{ flex:1, background:'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(168,85,247,0.05))', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:48, borderLeft:'1px solid var(--border)' }}>
        <div style={{ textAlign:'center', maxWidth:440 }}>
          <div style={{ fontSize:56, marginBottom:16 }}>👁️</div>
          <h2 style={{ fontSize:26, fontWeight:800, color:'var(--text)', marginBottom:12 }}>
            Sistema completo para <span style={{ color:'#06b6d4' }}>óticas</span>
          </h2>
          <p style={{ color:'var(--text-muted)', fontSize:14, lineHeight:1.7, marginBottom:32 }}>
            Consulta, OS, PDV, Crediário e muito mais — tudo integrado e simples de usar.
          </p>

          {/* Banner de planos */}
          <div style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:12, padding:24, marginBottom:24 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#6366f1', marginBottom:8 }}>🚀 Planos a partir de R$ 97/mês</div>
            <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>Básico · Pro · Premium · Lançamento R$109,90</div>
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = "/planos"; }} style={{ display:"inline-block", background:"#6366f1", color:"white", padding:"12px 32px", borderRadius:"8px", fontWeight:700, fontSize:15, border:"none", cursor:"pointer" }}>Ver planos e preços →</button>
            <div style={{ marginTop:12, fontSize:12, color:'var(--text-muted)' }}>✅ 14 dias grátis · Cartão ou Pix · Cancele quando quiser</div>
          </div>

          {/* Grid de módulos */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[['👥','Clientes'],['👁️','Consulta Rx'],['📋','Ordem de Serviço'],['💰','PDV / Vendas'],['💳','Crediário'],['📊','Relatórios']].map(([icon,label]) => (
              <div key={label} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:16 }}>{icon}</span>
                <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:500 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

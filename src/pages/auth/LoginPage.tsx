import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch {
      toast.error('Email ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      {/* Left */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'48px', maxWidth:460 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:48 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg, var(--primary), var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>👁️</div>
          <span style={{ fontSize:22, fontWeight:800, color:'var(--text)' }}>Opti<span style={{ color:'var(--accent)' }}>Flow</span></span>
        </div>
        <h1 style={{ fontSize:30, fontWeight:800, color:'var(--text)', letterSpacing:'-0.5px', marginBottom:8 }}>Bem-vindo de volta</h1>
        <p style={{ color:'var(--text2)', marginBottom:36, fontSize:14 }}>Entre para acessar o sistema</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input className="form-input" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Senha</label>
            <div style={{ position:'relative' }}>
              <input className="form-input" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight:44 }} required />
              <button type="button" onClick={() => setShowPass(!showPass)} style={{ position:'absolute', right:13, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text2)', cursor:'pointer' }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{ width:'100%', justifyContent:'center', marginTop:4 }} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar no sistema →'}
          </button>
        </form>
        <p style={{ textAlign:'center', marginTop:24, fontSize:13, color:'var(--text2)' }}>
          Não tem conta? <Link to="/registro" style={{ color:'var(--accent)', fontWeight:600 }}>Criar agora →</Link>
        </p>
        <p style={{ textAlign:'center', marginTop:8, fontSize:13, color:'var(--text3)' }}>
          <Link to="/admin-login" style={{ color:'var(--text3)' }}>Acesso administrativo</Link>
        </p>
      </div>
      {/* Right */}
      <div style={{ flex:1, background:'var(--bg2)', borderLeft:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', padding:48 }}>
        <div style={{ maxWidth:360, textAlign:'center' }}>
          <div style={{ fontSize:64, marginBottom:24 }}>👁️</div>
          <h2 style={{ fontSize:26, fontWeight:800, color:'var(--text)', marginBottom:16, letterSpacing:'-0.5px' }}>
            Sistema completo para <span style={{ color:'var(--accent)' }}>óticas</span>
          </h2>
          <p style={{ color:'var(--text2)', lineHeight:1.8, fontSize:14 }}>
            Consulta, OS, PDV, Crediário e muito mais — tudo integrado e simples de usar.
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:28 }}>
            {[['👥','Clientes'],['👁️','Consulta Rx'],['📋','Ordem de Serviço'],['💰','PDV / Vendas'],['💳','Crediário'],['📊','Relatórios']].map(([icon, label]) => (
              <div key={label} style={{ background:'var(--bg3)', borderRadius:10, padding:'12px', border:'1px solid var(--border)', textAlign:'left' }}>
                <span style={{ fontSize:20 }}>{icon}</span>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)', marginTop:6 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

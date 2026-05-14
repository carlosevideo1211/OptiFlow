import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email !== ADMIN_EMAIL) { toast.error('Acesso negado'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate('/admin');
    } catch { toast.error('Credenciais inválidas'); } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>👁️</div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'var(--text)', marginBottom:4 }}>OptiFlow Admin</h1>
          <p style={{ color:'var(--text2)', fontSize:13 }}>Painel administrativo</p>
        </div>
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <div className="form-group"><label className="form-label">Senha</label><input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <button type="submit" className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }} disabled={loading}>{loading ? 'Entrando...' : 'Acessar painel'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}

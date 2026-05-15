import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

const ADMIN_EMAIL = 'carlosevideo28@gmail.com';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      toast.error('Acesso negado'); return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate('/admin');
    } catch (err: any) {
      toast.error(err.message || 'Credenciais inválidas');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f172a', padding:24 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none" style={{ margin:'0 auto 12px', display:'block' }}>
            <rect width="32" height="32" rx="10" fill="url(#lg_admin)"/>
            <ellipse cx="16" cy="16" rx="10" ry="6" stroke="white" strokeWidth="1.8" fill="none"/>
            <circle cx="16" cy="16" r="3.5" fill="white"/>
            <circle cx="16" cy="16" r="1.5" fill="url(#lg_admin)"/>
            <defs><linearGradient id="lg_admin" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366f1"/><stop offset="1" stopColor="#06b6d4"/>
            </linearGradient></defs>
          </svg>
          <h1 style={{ fontSize:22, fontWeight:800, color:'white', marginBottom:4 }}>OptiFlow Admin</h1>
          <p style={{ color:'rgba(255,255,255,.4)', fontSize:13 }}>Painel administrativo</p>
        </div>
        <div style={{ background:'#1e293b', borderRadius:16, padding:28, border:'1px solid rgba(255,255,255,.08)' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.4)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>E-mail</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus
                style={{ width:'100%', padding:'10px 14px', borderRadius:8, background:'#0f172a',
                  border:'1px solid rgba(255,255,255,.1)', color:'white', fontSize:14, boxSizing:'border-box', outline:'none' }}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.4)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Senha</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
                style={{ width:'100%', padding:'10px 14px', borderRadius:8, background:'#0f172a',
                  border:'1px solid rgba(255,255,255,.1)', color:'white', fontSize:14, boxSizing:'border-box', outline:'none' }}/>
            </div>
            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:'12px', borderRadius:10, border:'none', cursor:'pointer',
                background:'linear-gradient(135deg,#6366f1,#06b6d4)', color:'white',
                fontSize:15, fontWeight:700, opacity: loading?0.7:1 }}>
              {loading ? 'Entrando...' : 'Acessar painel'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

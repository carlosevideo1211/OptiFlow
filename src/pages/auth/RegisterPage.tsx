import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Senha mínimo 6 caracteres'); return; }
    setLoading(true);
    try {
      await signUp(email, password, name);
      toast.success('Conta criada! Bem-vindo ao OptiFlow 🎉');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:10, marginBottom:20 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg, var(--primary), var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>👁️</div>
            <span style={{ fontSize:22, fontWeight:800, color:'var(--text)' }}>Opti<span style={{ color:'var(--accent)' }}>Flow</span></span>
          </div>
          <h1 style={{ fontSize:26, fontWeight:800, color:'var(--text)', marginBottom:8 }}>Criar conta grátis</h1>
          <p style={{ color:'var(--text2)', fontSize:13 }}>14 dias de acesso completo sem cartão</p>
        </div>
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group"><label className="form-label">Nome da clínica / ótica</label><input className="form-input" placeholder="Ex: Ótica Visão Clara" value={name} onChange={e => setName(e.target.value)} required /></div>
            <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <div className="form-group"><label className="form-label">Senha</label><input className="form-input" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width:'100%', justifyContent:'center', marginTop:4 }} disabled={loading}>
              {loading ? 'Criando...' : 'Começar gratuitamente →'}
            </button>
          </form>
        </div>
        <p style={{ textAlign:'center', marginTop:20, fontSize:13, color:'var(--text2)' }}>
          Já tem conta? <Link to="/login" style={{ color:'var(--accent)', fontWeight:600 }}>Entrar →</Link>
        </p>
      </div>
    </div>
  );
}

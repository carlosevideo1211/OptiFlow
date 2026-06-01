import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { Mail, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Digite seu e-mail'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      setSent(true);
      toast.success('E-mail enviado! Verifique sua caixa de entrada.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar e-mail');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none" style={{ margin: '0 auto 16px' }}>
            <rect width="32" height="32" rx="10" fill="url(#lg_fp)"/>
            <ellipse cx="16" cy="16" rx="10" ry="6" stroke="white" strokeWidth="1.8" fill="none"/>
            <circle cx="16" cy="16" r="3.5" fill="white"/>
            <defs><linearGradient id="lg_fp" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366f1"/><stop offset="1" stopColor="#06b6d4"/>
            </linearGradient></defs>
          </svg>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
            {sent ? 'E-mail enviado!' : 'Recuperar senha'}
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>
            {sent
              ? 'Verifique sua caixa de entrada e clique no link para redefinir sua senha.'
              : 'Digite seu e-mail e enviaremos um link para redefinir sua senha.'}
          </p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
              <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
                Link enviado para <strong style={{ color: 'var(--text)' }}>{email}</strong>
              </p>
              <button onClick={() => setSent(false)} className="btn btn-secondary" style={{ width: '100%', marginBottom: 12 }}>
                Tentar outro e-mail
              </button>
              <Link to="/login" style={{ color: '#6366f1', fontSize: 13, fontWeight: 600 }}>
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)' }}/>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{ paddingLeft: 36 }}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginBottom: 16 }}>
                {loading ? 'Enviando...' : 'Enviar link de recuperacao'}
              </button>
              <Link to="/login" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text2)', fontSize: 13 }}>
                <ArrowLeft size={14}/> Voltar para o login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

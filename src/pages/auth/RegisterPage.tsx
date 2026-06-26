import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { sendEmail, emailBoasVindas } from '../../lib/email';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Store, User, Mail, Lock, Phone } from 'lucide-react';

export default function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '',
    company: '', phone: '', city: '', state: 'AM'
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
    'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nome obrigatorio'); return; }
    if (!form.company.trim()) { toast.error('Nome da optica obrigatorio'); return; }
    if (form.password.length < 6) { toast.error('Senha minimo 6 caracteres'); return; }
    if (form.password !== form.confirm) { toast.error('Senhas nao conferem'); return; }
    setLoading(true);
    try {
      // 0. Verificar se email ja existe na tabela tenants
      const { data: existingTenant } = await supabase
        .from('tenants')
        .select('id')
        .ilike('email', form.email.trim())
        .maybeSingle();
      if (existingTenant) {
        toast.error('Este e-mail ja esta cadastrado. Faca login ou use outro e-mail.');
        setLoading(false);
        return;
      }

      // 1. Criar usuario no Supabase Auth
      await signUp(form.email, form.password, form.name, form.company);

      // 2. Aguardar trigger criar tenant+store_settings+user_profiles
      await new Promise(r => setTimeout(r, 2500));
      
      // Atualizar dados extras (phone, city, state)
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('id')
          .eq('email', form.email.trim())
          .maybeSingle();
        if (tenantRow?.id) {
          await Promise.all([
            supabase.from('tenants').update({
              phone: form.phone, city: form.city, state: form.state
            }).eq('id', tenantRow.id),
            supabase.from('store_settings').update({
              phone: form.phone, city: form.city, state: form.state
            }).eq('tenant_id', tenantRow.id),
            supabase.from('user_profiles').update({
              tenant_id: tenantRow.id, full_name: form.name
            }).eq('id', authData.user.id),
          ]);
        }
      }

            // Enviar email de boas-vindas
      const emailData = emailBoasVindas(form.company, form.name, form.email);
        sendEmail(emailData);

      toast.success('Conta criada! Bem-vindo ao OptiFlow 14 dias gratis!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message ?? 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 8,
    border: '1.5px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)',
    color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box'
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: 'var(--text2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px'
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)' }}>
      {/* Left panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px', maxWidth: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="10" fill="url(#lg_reg)"/>
            <ellipse cx="16" cy="16" rx="10" ry="6" stroke="white" strokeWidth="1.8" fill="none"/>
            <circle cx="16" cy="16" r="3.5" fill="white"/>
            <circle cx="16" cy="16" r="1.5" fill="url(#lg_reg)"/>
            <defs><linearGradient id="lg_reg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366f1"/><stop offset="1" stopColor="#06b6d4"/>
            </linearGradient></defs>
          </svg>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Opti<span style={{ color: '#06b6d4' }}>Flow</span></span>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Crie sua conta gratis</h1>
        <p style={{ color: 'var(--text2)', marginBottom: 32, fontSize: 14 }}>14 dias de acesso completo, sem cartao de credito</p>

        <form onSubmit={handleSubmit}>
          {/* Dados do responsavel */}
          <div style={{ marginBottom: 12, padding: '12px 16px', borderRadius: 8, background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', marginBottom: 10, textTransform: 'uppercase' }}>
              <User size={12} style={{ marginRight: 4 }}/> Dados do Responsavel
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Nome completo *</label>
                <input style={inp} placeholder="Seu nome" value={form.name} onChange={e => set('name', e.target.value)} required/>
              </div>
              <div>
                <label style={lbl}>E-mail *</label>
                <input style={inp} type="email" placeholder="seu@email.com" value={form.email} onChange={e => set('email', e.target.value)} required/>
              </div>
              <div>
                <label style={lbl}>Senha *</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inp, paddingRight: 40 }} type={showPass ? 'text' : 'password'} placeholder="Minimo 6 caracteres" value={form.password} onChange={e => set('password', e.target.value)} required/>
                  <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                    {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>
              <div>
                <label style={lbl}>Confirmar senha *</label>
                <input style={inp} type="password" placeholder="Repita a senha" value={form.confirm} onChange={e => set('confirm', e.target.value)} required/>
              </div>
            </div>
          </div>

          {/* Dados da optica */}
          <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 8, background: 'rgba(6,182,212,.08)', border: '1px solid rgba(6,182,212,.2)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', marginBottom: 10, textTransform: 'uppercase' }}>
              <Store size={12} style={{ marginRight: 4 }}/> Dados da Optica
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={lbl}>Nome da optica *</label>
                <input style={inp} placeholder="Ex: Otica Central" value={form.company} onChange={e => set('company', e.target.value)} required/>
              </div>
              <div>
                <label style={lbl}>Telefone</label>
                <input style={inp} placeholder="(92) 9xxxx-xxxx" value={form.phone} onChange={e => set('phone', e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Cidade</label>
                <input style={inp} placeholder="Manaus" value={form.city} onChange={e => set('city', e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Estado</label>
                <select style={inp} value={form.state} onChange={e => set('state', e.target.value)}>
                  {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '13px', borderRadius: 8, border: 'none',
            background: loading ? '#444' : 'linear-gradient(135deg, #6366f1, #06b6d4)',
            color: 'white', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer'
          }}>
            {loading ? 'Criando conta...' : 'Criar conta gratis - 14 dias trial'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text2)' }}>
            Ja tem conta? <Link to="/login" style={{ color: '#6366f1', fontWeight: 600 }}>Entrar</Link>
          </p>
        </form>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, background: 'linear-gradient(135deg, #1e1b4b, #0c4a6e)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 48 }}>
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 24 }}>👁️</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: 'white', marginBottom: 16 }}>Sistema completo para opticas</h2>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, marginBottom: 32 }}>Gerencie clientes, OS, estoque, crediario e financeiro em um so lugar</p>
          {[
            '✅ Clientes e prontuario optico',
            '✅ Ordem de Servico com RX',
            '✅ PDV e crediario',
            '✅ Controle de estoque',
            '✅ Financeiro e relatorios',
            '✅ Multi-funcionarios',
          ].map((f, i) => (
            <div key={i} style={{ textAlign: 'left', padding: '8px 0', color: 'rgba(255,255,255,.85)', fontSize: 14 }}>{f}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

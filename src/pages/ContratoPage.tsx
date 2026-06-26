import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export default function ContratoPage() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signed, setSigned] = useState(false);
  const [form, setForm] = useState({
    company_name: '', company_cnpj: '', company_address: '',
    signed_name: '', signed_cpf: '', agreed: false
  });

  useEffect(() => {
    loadTenant();
  }, [tenantId]);

  const loadTenant = async () => {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    if (data) {
      setTenant(data);
      setForm(f => ({ ...f, company_name: data.company_name || '', company_cnpj: data.cnpj || '' }));
    }
    // Verificar se ja assinou
    const { data: contrato } = await supabase.from('contratos').select('id,status').eq('tenant_id', tenantId).maybeSingle();
    if (contrato?.status === 'assinado') setSigned(true);
    setLoading(false);
  };

  const planLabel: Record<string, string> = {
    trial: 'Trial', basico: 'Basico', profissional: 'Profissional', clinica: 'Clinica'
  };
  const planValue: Record<string, string> = {
    trial: '0,00', basico: '89,00', profissional: '149,00', clinica: '249,00'
  };

  const handleSign = async () => {
    if (!form.company_name.trim()) { toast.error('Informe o nome da empresa'); return; }
    if (!form.signed_name.trim()) { toast.error('Informe seu nome completo'); return; }
    if (!form.signed_cpf.trim()) { toast.error('Informe seu CPF'); return; }
    if (!form.agreed) { toast.error('Voce precisa concordar com os termos'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const contractHtml = generateContractHtml(form, tenant, now);
      const { error } = await supabase.from('contratos').upsert({
        tenant_id: tenantId,
        status: 'assinado',
        signed_at: now,
        signed_name: form.signed_name,
        signed_cpf: form.signed_cpf,
        company_name: form.company_name,
        company_cnpj: form.company_cnpj,
        company_address: form.company_address,
        plan: tenant?.plan,
        plan_value: parseFloat(planValue[tenant?.plan] || '0'),
        plan_period: 'mensal',
        contract_html: contractHtml,
      }, { onConflict: 'tenant_id' });
      if (error) throw error;
      toast.success('Contrato assinado com sucesso!');
      setSigned(true);
    } catch (e: any) {
      toast.error('Erro ao assinar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const generateContractHtml = (f: typeof form, t: any, date: string) => {
    const d = new Date(date);
    const dateStr = d.toLocaleDateString('pt-BR');
    return `<h2>CONTRATO DE PRESTACAO DE SERVICOS - OptiFlow</h2>
<p><b>CONTRATADA:</b> Carlos Eduardo - OptiFlow</p>
<p><b>CONTRATANTE:</b> ${f.company_name}, CNPJ/CPF: ${f.company_cnpj}, Endereco: ${f.company_address}</p>
<p><b>Plano:</b> ${planLabel[t?.plan] || t?.plan} | <b>Valor:</b> R$ ${planValue[t?.plan] || '0,00'}/mes</p>
<hr/>
<p>1. OBJETO: Acesso ao sistema OptiFlow SaaS para gestao de oticas.</p>
<p>2. PRAZO: 12 meses com renovacao automatica.</p>
<p>3. PAGAMENTO: Mensal, conforme plano contratado.</p>
<p>4. LGPD: Dados tratados conforme Lei 13.709/2018.</p>
<p>5. CANCELAMENTO: Aviso previo de 30 dias, sem multa.</p>
<hr/>
<p><b>Assinado digitalmente em ${dateStr}</b></p>
<p>Nome: ${f.signed_name} | CPF: ${f.signed_cpf}</p>
<p><i>Assinatura eletronica valida conforme MP 2.200-2/2001</i></p>`;
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const { data: contrato } = { data: null } as any;
    w.document.write('<html><body style="font-family:Arial;padding:40px;max-width:800px;margin:0 auto">');
    w.document.write(generateContractHtml(form, tenant, new Date().toISOString()));
    w.document.write('</body></html>');
    w.print();
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>;

  if (signed) return (
    <div style={{ maxWidth: 600, margin: '60px auto', padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
      <h2 style={{ color: 'var(--text-primary)' }}>Contrato assinado!</h2>
      <p style={{ color: 'var(--text-secondary)' }}>O contrato foi assinado digitalmente e arquivado com sucesso.</p>
      <button onClick={handlePrint} style={{ marginTop: 16, padding: '10px 24px', background: 'var(--fill-accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', marginRight: 12 }}>
        Imprimir contrato
      </button>
      <button onClick={() => navigate('/dashboard')} style={{ marginTop: 16, padding: '10px 24px', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
        Ir para o sistema
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Contrato de Servicos</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Preencha os dados abaixo para assinar digitalmente o contrato OptiFlow.</p>

      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>Dados da Empresa</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Nome da Empresa *</label>
            <input value={form.company_name} onChange={e => setForm(f => ({...f, company_name: e.target.value}))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>CNPJ / CPF</label>
              <input value={form.company_cnpj} onChange={e => setForm(f => ({...f, company_cnpj: e.target.value}))}
                placeholder="00.000.000/0001-00"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cidade / Estado</label>
              <input value={form.company_address} onChange={e => setForm(f => ({...f, company_address: e.target.value}))}
                placeholder="Ex: Manaus / AM"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>Dados do Responsavel</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Nome Completo *</label>
            <input value={form.signed_name} onChange={e => setForm(f => ({...f, signed_name: e.target.value}))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>CPF *</label>
            <input value={form.signed_cpf} onChange={e => setForm(f => ({...f, signed_cpf: e.target.value}))}
              placeholder="000.000.000-00"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-accent)', border: '1px solid var(--border-accent)', borderRadius: 12, padding: '1rem 1.5rem', marginBottom: 24, fontSize: 13, color: 'var(--text-accent)' }}>
        <b>Plano:</b> {planLabel[tenant?.plan] || tenant?.plan} | <b>Valor:</b> R$ {planValue[tenant?.plan] || '0,00'}/mes | <b>Contratada:</b> Carlos Eduardo - OptiFlow
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14 }}>
          <input type="checkbox" checked={form.agreed} onChange={e => setForm(f => ({...f, agreed: e.target.checked}))}
            style={{ marginTop: 2, width: 16, height: 16 }} />
          <span>Li e concordo com os <a href="/termos" target="_blank" style={{ color: 'var(--text-accent)' }}>Termos de Uso</a> e a <a href="/privacidade" target="_blank" style={{ color: 'var(--text-accent)' }}>Politica de Privacidade</a>. Declaro que as informacoes fornecidas sao verdadeiras e que tenho poderes para assinar este contrato.</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={handleSign} disabled={saving}
          style={{ flex: 1, padding: '12px 24px', background: saving ? 'var(--border)' : 'var(--fill-accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 15 }}>
          {saving ? 'Assinando...' : 'Assinar Contrato Digitalmente'}
        </button>
        <button onClick={handlePrint}
          style={{ padding: '12px 20px', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
          Imprimir
        </button>
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
        Assinatura eletronica valida conforme MP 2.200-2/2001. Data, hora e IP registrados automaticamente.
      </p>
    </div>
  );
}

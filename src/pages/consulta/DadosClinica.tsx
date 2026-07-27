import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Building2, Clock, Save, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const DIAS = [
  { v: 0, l: 'Dom' }, { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' }, { v: 3, l: 'Qua' },
  { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' },
];

interface ClinicSettings {
  id?: string;
  tenant_id: string;
  clinic_name: string;
  clinic_document: string;
  responsavel: string;
  clinic_phone: string;
  clinic_email: string;
  clinic_address: string;
  clinic_city: string;
  clinic_state: string;
  clinic_zip: string;
  logo_url: string;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: number[];
  possui_intervalo: boolean;
  intervalo_inicio: string;
  intervalo_fim: string;
}

const DEFAULT_FORM: ClinicSettings = {
  tenant_id: '', clinic_name: '', clinic_document: '', responsavel: '',
  clinic_phone: '', clinic_email: '', clinic_address: '', clinic_city: '',
  clinic_state: '', clinic_zip: '', logo_url: '',
  horario_inicio: '08:00', horario_fim: '18:00',
  dias_semana: [1, 2, 3, 4, 5], possui_intervalo: false,
  intervalo_inicio: '12:00', intervalo_fim: '13:00',
};

// Colunas jsonb (ajustes_financeiro/pacientes/lentes, ficha_layout) existem na tabela
// mas não são tocadas aqui — resquício de um plano anterior, substituído pelas
// tabelas relacionais clinic_accounts/clinic_payment_methods/etc.

export default function DadosClinica() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ClinicSettings>(DEFAULT_FORM);

  useEffect(() => {
    if (!tenantId) return;
    setForm(f => ({ ...f, tenant_id: tenantId }));
    supabase.from('clinic_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error('Erro ao carregar: ' + error.message);
        if (data) {
          setForm({
            ...DEFAULT_FORM,
            ...data,
            horario_inicio: (data.horario_inicio || '08:00:00').slice(0, 5),
            horario_fim: (data.horario_fim || '18:00:00').slice(0, 5),
            intervalo_inicio: (data.intervalo_inicio || '12:00:00').slice(0, 5),
            intervalo_fim: (data.intervalo_fim || '13:00:00').slice(0, 5),
            dias_semana: data.dias_semana ?? [1, 2, 3, 4, 5],
          });
        }
        setLoading(false);
      });
  }, [tenantId]);

  const set = (k: keyof ClinicSettings, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleDia = (d: number) => setForm(f => ({
    ...f,
    dias_semana: f.dias_semana.includes(d) ? f.dias_semana.filter(x => x !== d) : [...f.dias_semana, d].sort(),
  }));

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set('logo_url', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, tenant_id: tenantId };
      const { error } = form.id
        ? await supabase.from('clinic_settings').update(payload).eq('id', form.id)
        : await supabase.from('clinic_settings').insert([payload]);
      if (error) throw error;
      toast.success('Dados da clínica salvos!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="empty-state"><p>Carregando...</p></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={15} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Logo */}
        <div className="card" style={{ padding: 24, gridColumn: '1/-1' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} style={{ color: '#6366f1' }} /> Logo da Clínica
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 96, height: 96, borderRadius: 12, background: 'rgba(99,102,241,.1)',
              border: '2px dashed rgba(99,102,241,.3)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
            }}>
              {form.logo_url ? <img src={form.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <Building2 size={32} style={{ color: 'rgba(99,102,241,.4)' }} />}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
                background: 'rgba(99,102,241,.15)', color: '#6366f1', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', border: '1px solid rgba(99,102,241,.3)',
              }}>
                <Upload size={15} /> Importar Logo
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
              </label>
              {form.logo_url && (
                <button onClick={() => set('logo_url', '')} style={{
                  padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(248,113,113,.3)',
                  background: 'rgba(248,113,113,.1)', color: '#f87171', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                }}><X size={14} /> Remover</button>
              )}
            </div>
          </div>
        </div>

        {/* Identificação */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Identificação</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">Nome da Clínica *</label>
              <input className="form-input" value={form.clinic_name} onChange={e => set('clinic_name', e.target.value)} placeholder="Ex: Clínica Visão Clara" />
            </div>
            <div>
              <label className="form-label">CNPJ</label>
              <input className="form-input" value={form.clinic_document} onChange={e => set('clinic_document', e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className="form-label">Responsável</label>
              <input className="form-input" value={form.responsavel} onChange={e => set('responsavel', e.target.value)} placeholder="Nome do responsável / Dr(a)." />
            </div>
          </div>
        </div>

        {/* Contato e Endereço */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Contato e Endereço</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label">Telefone</label>
                <input className="form-input" value={form.clinic_phone} onChange={e => set('clinic_phone', e.target.value)} placeholder="(92) 99999-0000" />
              </div>
              <div>
                <label className="form-label">E-mail</label>
                <input className="form-input" type="email" value={form.clinic_email} onChange={e => set('clinic_email', e.target.value)} placeholder="contato@clinica.com" />
              </div>
            </div>
            <div>
              <label className="form-label">Endereço</label>
              <input className="form-input" value={form.clinic_address} onChange={e => set('clinic_address', e.target.value)} placeholder="Rua, número, bairro" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label">Cidade</label>
                <input className="form-input" value={form.clinic_city} onChange={e => set('clinic_city', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Estado</label>
                <select className="form-input" value={form.clinic_state} onChange={e => set('clinic_state', e.target.value)}>
                  <option value="">...</option>
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">CEP</label>
                <input className="form-input" value={form.clinic_zip} onChange={e => set('clinic_zip', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* Agenda embutida */}
        <div className="card" style={{ padding: 24, gridColumn: '1/-1' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} style={{ color: '#f59e0b' }} /> Horário de Funcionamento (Agenda)
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Padrão da clínica — no futuro, cada profissional poderá ter horário próprio.
          </p>

          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {DIAS.map(d => (
              <button key={d.v} onClick={() => toggleDia(d.v)} style={{
                padding: '8px 14px', borderRadius: 8,
                border: '1px solid ' + (form.dias_semana.includes(d.v) ? '#6366f1' : 'var(--border)'),
                background: form.dias_semana.includes(d.v) ? 'rgba(99,102,241,.14)' : 'transparent',
                color: form.dias_semana.includes(d.v) ? '#6366f1' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>{d.l}</button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            <div>
              <label className="form-label">Início</label>
              <input type="time" className="form-input" value={form.horario_inicio} onChange={e => set('horario_inicio', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Fim</label>
              <input type="time" className="form-input" value={form.horario_fim} onChange={e => set('horario_fim', e.target.value)} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: form.possui_intervalo ? 14 : 0 }}>
            <div onClick={() => set('possui_intervalo', !form.possui_intervalo)} style={{
              width: 40, height: 22, borderRadius: 12, background: form.possui_intervalo ? '#22c55e' : 'var(--border)',
              position: 'relative', transition: 'all .2s',
            }}>
              <div style={{ position: 'absolute', top: 2, left: form.possui_intervalo ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'all .2s' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Possui intervalo?</span>
          </label>

          {form.possui_intervalo && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <div>
                <label className="form-label">Intervalo início</label>
                <input type="time" className="form-input" value={form.intervalo_inicio} onChange={e => set('intervalo_inicio', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Intervalo fim</label>
                <input type="time" className="form-input" value={form.intervalo_fim} onChange={e => set('intervalo_fim', e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

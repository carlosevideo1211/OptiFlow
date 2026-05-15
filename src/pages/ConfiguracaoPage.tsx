import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Settings, Save, Store, Phone, Mail, MapPin, Key, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface StoreSettings {
  id?: string; tenant_id: string; name: string; cnpj: string;
  phone: string; email: string; address: string; city: string; state: string;
  pix_key: string; wa_token: string; wa_phone_id: string; wa_number: string;
}

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function ConfiguracaoPage() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState<'loja'|'integrações'>('loja');
  const [form, setForm]       = useState<StoreSettings>({
    tenant_id: tenantId||'', name:'', cnpj:'', phone:'', email:'',
    address:'', city:'', state:'', pix_key:'', wa_token:'', wa_phone_id:'', wa_number:''
  });

  useEffect(() => {
    if (!tenantId) return;
    setForm(f => ({...f, tenant_id: tenantId}));
    supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single()
      .then(({ data }) => {
        if (data) setForm(data as StoreSettings);
        setLoading(false);
      });
  }, [tenantId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = form.id
        ? await supabase.from('store_settings').update(form).eq('id', form.id)
        : await supabase.from('store_settings').insert([form]);
      if (error) throw error;
      toast.success('Configurações salvas!');
    } catch (err: any) { toast.error(err.message||'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const set = (k: string, v: string) => setForm(p => ({...p,[k]:v}));

  if (loading) return <div className="empty-state"><p>Carregando...</p></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Settings size={22}/> Configuração
          </h1>
          <p className="page-sub">Dados da loja e integrações</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={15}/> {saving?'Salvando...':'Salvar Configurações'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--border)' }}>
        {[{k:'loja',l:'🏪 Dados da Loja'},{k:'integrações',l:'🔗 Integrações'}].map(t => (
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer',
              fontSize:14, fontWeight:600,
              color: tab===t.k ? '#6366f1' : 'var(--text-muted)',
              borderBottom: tab===t.k ? '2px solid #6366f1' : '2px solid transparent' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── DADOS DA LOJA ── */}
      {tab === 'loja' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

          {/* Informações básicas */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              <Store size={16}/> Informações da Loja
            </h3>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div><label className="form-label">Nome da Loja</label><input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Ex: Ótica Central"/></div>
              <div><label className="form-label">CNPJ</label><input className="form-input" value={form.cnpj} onChange={e=>set('cnpj',e.target.value)} placeholder="00.000.000/0000-00"/></div>
              <div><label className="form-label"><Phone size={13} style={{ display:'inline', marginRight:4 }}/>Telefone</label><input className="form-input" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="(92) 99999-0000"/></div>
              <div><label className="form-label"><Mail size={13} style={{ display:'inline', marginRight:4 }}/>E-mail</label><input className="form-input" type="email" value={form.email} onChange={e=>set('email',e.target.value)}/></div>
            </div>
          </div>

          {/* Endereço */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              <MapPin size={16}/> Endereço
            </h3>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div><label className="form-label">Endereço completo</label><input className="form-input" value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Rua, número, bairro"/></div>
              <div><label className="form-label">Cidade</label><input className="form-input" value={form.city} onChange={e=>set('city',e.target.value)}/></div>
              <div><label className="form-label">Estado</label>
                <select className="form-input" value={form.state} onChange={e=>set('state',e.target.value)}>
                  <option value="">Selecione...</option>
                  {ESTADOS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="form-label"><Key size={13} style={{ display:'inline', marginRight:4 }}/>Chave PIX</label><input className="form-input" value={form.pix_key} onChange={e=>set('pix_key',e.target.value)} placeholder="CPF, CNPJ, e-mail ou telefone"/></div>
            </div>
          </div>
        </div>
      )}

      {/* ── INTEGRAÇÕES ── */}
      {tab === 'integrações' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:20, maxWidth:600 }}>
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
              <MessageCircle size={16} style={{ color:'#22c55e' }}/> WhatsApp Business API
            </h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
              Configure para enviar mensagens automáticas de cobrança e lembretes.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div><label className="form-label">Token de Acesso</label><input className="form-input" value={form.wa_token} onChange={e=>set('wa_token',e.target.value)} placeholder="EAAxxxxxxx..."/></div>
              <div><label className="form-label">Phone ID</label><input className="form-input" value={form.wa_phone_id} onChange={e=>set('wa_phone_id',e.target.value)} placeholder="1234567890"/></div>
              <div><label className="form-label">Número WhatsApp</label><input className="form-input" value={form.wa_number} onChange={e=>set('wa_number',e.target.value)} placeholder="5592999990000"/></div>
            </div>
          </div>

          <div className="card" style={{ padding:24, opacity:.6 }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>📧 E-mail SMTP</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)' }}>Envio de recibos por e-mail — em breve.</p>
          </div>

          <div className="card" style={{ padding:24, opacity:.6 }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>💳 Gateway de Pagamento</h3>
            <p style={{ fontSize:13, color:'var(--text-muted)' }}>Integração com Mercado Pago / Stripe — em breve.</p>
          </div>
        </div>
      )}
    </div>
  );
}

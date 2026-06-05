import { useState, useEffect } from 'react';
import { useTheme, THEMES } from '../hooks/useTheme';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Settings, Save, Store, Phone, Mail, MapPin, Key,
  MessageCircle, Camera, Upload, X, Eye, EyeOff, Building2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface StoreSettings {
  id?: string; tenant_id: string; name: string; cnpj: string;
  phone: string; email: string; address: string; city: string; state: string;
  logo_url: string; pix_key: string; wa_token: string; wa_phone_id: string; wa_number: string;
}

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function ConfiguracaoPage() {
  const { tenantId } = useAuth();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [tab, setTab]             = useState<'loja'|'integracoes'|'tema'>('loja');
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState<StoreSettings>({
    tenant_id: tenantId||'', name:'', cnpj:'', phone:'', email:'',
    address:'', city:'', state:'', logo_url:'',
    pix_key:'', wa_token:'', wa_phone_id:'', wa_number:''
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

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set('logo_url', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

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
          <Save size={15}/> {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--border)' }}>
        {[{k:'loja',l:'🏪 Dados da Loja'},{k:'integracoes',l:'🔗 Integrações'},{k:'tema',l:'🎨 Aparência'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer',
              fontSize:14, fontWeight:600,
              color: tab===t.k ? '#6366f1' : 'var(--text-muted)',
              borderBottom: tab===t.k ? '2px solid #6366f1' : '2px solid transparent' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── TEMA ── */}
      {tab === 'tema' && (
        <div>
          <div className="card" style={{padding:24,marginBottom:20}}>
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:6,display:'flex',alignItems:'center',gap:8}}>
              🎨 Personalização Visual
            </h3>
            <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:24}}>Escolha o tema que melhor se adapta ao seu estilo de trabalho.</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16}}>
              {THEMES.map(t => (
                <div key={t.id} onClick={()=>setTheme(t.id as any)}
                  style={{cursor:'pointer',border:'2px solid',borderColor:theme===t.id?'var(--primary)':'var(--border)',borderRadius:12,overflow:'hidden',transition:'all 0.2s',transform:theme===t.id?'scale(1.02)':'scale(1)'}}>
                  <div style={{height:80,background:t.id==='dark'?'#0B1120':t.id==='light'?'#F1F5F9':t.id==='purple'?'#0D0A1E':t.id==='ocean'?'#0A1628':t.id==='emerald'?'#071A12':'#1A0A0A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32}}>
                    {t.icon}
                  </div>
                  <div style={{padding:'12px 14px',background:'var(--bg2)'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:700}}>{t.name}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{t.desc}</div>
                      </div>
                      {theme===t.id && <div style={{width:20,height:20,borderRadius:'50%',background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'white'}}>✓</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{padding:24}}>
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:6}}>👁️ Preview do Tema Atual</h3>
            <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>Tema selecionado: <strong style={{color:'var(--primary)'}}>{THEMES.find(t=>t.id===theme)?.name}</strong></p>
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              <div style={{padding:'8px 16px',background:'var(--primary)',borderRadius:8,color:'white',fontSize:13,fontWeight:600}}>Botão Primário</div>
              <div style={{padding:'8px 16px',background:'var(--accent)',borderRadius:8,color:'white',fontSize:13,fontWeight:600}}>Destaque</div>
              <div style={{padding:'8px 16px',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,fontSize:13}}>Card</div>
              <div style={{padding:'8px 16px',background:'var(--success)',borderRadius:8,color:'white',fontSize:13,fontWeight:600}}>Sucesso</div>
              <div style={{padding:'8px 16px',background:'var(--danger)',borderRadius:8,color:'white',fontSize:13,fontWeight:600}}>Erro</div>
            </div>
          </div>
        </div>
      )}
      {/* ── DADOS DA LOJA ── */}
      {tab === 'loja' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

          {/* Logo */}
          <div className="card" style={{ padding:24, gridColumn:'1/-1' }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <Building2 size={16} style={{color:'#6366f1'}}/> Logo da Empresa
            </h3>
            <div style={{ display:'flex', alignItems:'center', gap:20 }}>
              <div style={{ width:96, height:96, borderRadius:12, background:'rgba(99,102,241,.1)',
                border:'2px dashed rgba(99,102,241,.3)', display:'flex', alignItems:'center',
                justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
                {form.logo_url ? (
                  <img src={form.logo_url} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }}/>
                ) : (
                  <Building2 size={32} style={{ color:'rgba(99,102,241,.4)' }}/>
                )}
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8,
                  background:'rgba(99,102,241,.15)', color:'#6366f1', fontSize:13, fontWeight:600,
                  cursor:'pointer', border:'1px solid rgba(99,102,241,.3)' }}>
                  <Upload size={15}/> Importar Logo
                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogo}/>
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8,
                  background:'rgba(255,255,255,.06)', color:'var(--text-muted)', fontSize:13, fontWeight:600,
                  cursor:'pointer', border:'1px solid rgba(255,255,255,.1)' }}>
                  <Camera size={15}/> Câmera
                  <input type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleLogo}/>
                </label>
                {form.logo_url && (
                  <button onClick={() => set('logo_url','')}
                    style={{ padding:'8px 12px', borderRadius:8, border:'1px solid rgba(248,113,113,.3)',
                      background:'rgba(248,113,113,.1)', color:'#f87171', cursor:'pointer',
                      display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
                    <X size={14}/> Remover
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:12 }}>
              A logo aparece nos comprovantes, carnês e documentos impressos. Formatos: JPG, PNG. Tamanho recomendado: 200x200px.
            </p>
          </div>

          {/* Dados básicos */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <Store size={16} style={{color:'#6366f1'}}/> Dados da Empresa
            </h3>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="form-label">Nome da Empresa *</label>
                <input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Nome da sua ótica"/>
              </div>
              <div>
                <label className="form-label">CNPJ</label>
                <input className="form-input" value={form.cnpj} onChange={e=>set('cnpj',e.target.value)} placeholder="00.000.000/0000-00"/>
              </div>
              <div>
                <label className="form-label">E-mail</label>
                <input className="form-input" type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="contato@empresa.com"/>
              </div>
              <div>
                <label className="form-label">Telefone</label>
                <input className="form-input" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="(92) 99999-0000"/>
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <MapPin size={16} style={{color:'#22c55e'}}/> Endereço
            </h3>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="form-label">Endereço</label>
                <input className="form-input" value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Rua, número, bairro"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label className="form-label">Cidade</label>
                  <input className="form-input" value={form.city} onChange={e=>set('city',e.target.value)}/>
                </div>
                <div>
                  <label className="form-label">Estado</label>
                  <select className="form-input" value={form.state} onChange={e=>set('state',e.target.value)}>
                    <option value="">Selecione...</option>
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">Chave PIX</label>
                <input className="form-input" value={form.pix_key} onChange={e=>set('pix_key',e.target.value)} placeholder="CPF, CNPJ, e-mail ou telefone"/>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="card" style={{ padding:24, gridColumn:'1/-1' }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              👁 Preview — Como aparece nos documentos
            </h3>
            <div style={{ background:'#fff', borderRadius:8, padding:20, color:'#333', maxWidth:500 }}>
              <div style={{ display:'flex', alignItems:'center', gap:16, borderBottom:'2px solid #1a56db', paddingBottom:12, marginBottom:12 }}>
                {form.logo_url ? (
                  <img src={form.logo_url} alt="logo" style={{ width:56, height:56, objectFit:'contain', borderRadius:6 }}/>
                ) : (
                  <div style={{ width:56, height:56, background:'#e5e7eb', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#9ca3af' }}>LOGO</div>
                )}
                <div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#1a56db' }}>{form.name||'Nome da Empresa'}</div>
                  {form.cnpj && <div style={{ fontSize:12, color:'#666' }}>CNPJ: {form.cnpj}</div>}
                  {form.address && <div style={{ fontSize:12, color:'#666' }}>{form.address}{form.city?', '+form.city:''}{form.state?' - '+form.state:''}</div>}
                  {form.phone && <div style={{ fontSize:12, color:'#666' }}>Tel: {form.phone}</div>}
                  {form.pix_key && <div style={{ fontSize:12, color:'#666' }}>PIX: {form.pix_key}</div>}
                </div>
              </div>
              <div style={{ fontSize:11, color:'#9ca3af', textAlign:'center' }}>Este é o cabeçalho que aparece nos comprovantes e carnês</div>
            </div>
          </div>
        </div>
      )}

      {/* ── INTEGRAÇÕES ── */}
      {tab === 'integracoes' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

          {/* WhatsApp Normal */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
              <MessageCircle size={16} style={{color:'#22c55e'}}/> WhatsApp Normal
            </h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>
              Envio via link direto. Sem necessidade de API ou configuração extra. Funciona em qualquer número.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="form-label">Número WhatsApp da Loja</label>
                <input className="form-input" value={form.wa_number} onChange={e=>set('wa_number',e.target.value)} placeholder="5592999990000"/>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>DDD + número sem espaços ou caracteres especiais</div>
              </div>
            </div>
            <div style={{ marginTop:16, padding:'12px 16px', borderRadius:8, background:'rgba(34,197,94,.08)', fontSize:13, color:'var(--text-muted)' }}>
              ✅ Abre o WhatsApp do operador com a mensagem pré-preenchida. Não requer API.
            </div>
            {form.wa_number && (
              <div style={{ marginTop:12 }}>
                <button type="button"
                  onClick={() => window.open('https://wa.me/'+form.wa_number+'?text=Teste+do+OptiFlow', '_blank')}
                  style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#22c55e',
                    color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer',
                    display:'flex', alignItems:'center', gap:6 }}>
                  <MessageCircle size={14}/> Testar WhatsApp
                </button>
              </div>
            )}
          </div>

          {/* WhatsApp Business API */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
              <MessageCircle size={16} style={{color:'#6366f1'}}/> WhatsApp Business API
            </h3>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:16 }}>
              Envio automático e em massa. Requer conta Meta Business verificada.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="form-label">Phone ID</label>
                <input className="form-input" value={form.wa_phone_id} onChange={e=>set('wa_phone_id',e.target.value)} placeholder="ID do número no Meta"/>
              </div>
              <div>
                <label className="form-label">Token de Acesso</label>
                <div style={{ position:'relative' }}>
                  <input className="form-input" type={showToken?'text':'password'}
                    value={form.wa_token} onChange={e=>set('wa_token',e.target.value)}
                    placeholder="Token da API do WhatsApp Business"
                    style={{ paddingRight:44 }}/>
                  <button type="button" onClick={() => setShowToken(s=>!s)}
                    style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                      background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}>
                    {showToken ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="form-label">Chave PIX (QR Code nos carnês)</label>
                <input className="form-input" value={form.pix_key} onChange={e=>set('pix_key',e.target.value)} placeholder="CPF, CNPJ, e-mail ou telefone"/>
              </div>
            </div>
            <div style={{ marginTop:16, padding:'12px 16px', borderRadius:8, background:'rgba(99,102,241,.08)', fontSize:13, color:'var(--text-muted)' }}>
              💡 Acesse <strong>developers.facebook.com</strong> e crie um app com o produto WhatsApp para obter as credenciais.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

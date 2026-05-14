import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Customer } from '../../types/index';
import { Search, X, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props { initial?: any; onClose: () => void; onSaved: () => void; }

const RxInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <input className="rx-input" value={value} onChange={e => onChange(e.target.value)} />
);

export default function NovaConsultaModal({ initial, onClose, onSaved }: Props) {
  const { tenantId, user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchCustomer, setSearchCustomer] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'rx'|'obs'>('rx');

  const [rx, setRx] = useState({
    // Longe
    re_esf_longe:'', re_cil_longe:'', re_eixo_longe:'', re_av_longe:'',
    le_esf_longe:'', le_cil_longe:'', le_eixo_longe:'', le_av_longe:'',
    // Perto
    re_esf_perto:'', re_cil_perto:'', re_eixo_perto:'',
    le_esf_perto:'', le_cil_perto:'', le_eixo_perto:'',
    // DNP e Altura
    re_dnp:'', le_dnp:'', re_altura:'', le_altura:'',
    // Adição e DP
    adicao:'', dp_longe:'', dp_perto:'',
    // Data e obs
    date: new Date().toISOString().split('T')[0],
    notes:'',
    status:'realizada',
  });

  useEffect(() => {
    loadCustomers();
    if (initial) {
      setRx({
        re_esf_longe: initial.re_esf_longe ?? '', re_cil_longe: initial.re_cil_longe ?? '',
        re_eixo_longe: initial.re_eixo_longe ?? '', re_av_longe: initial.re_av_longe ?? '',
        le_esf_longe: initial.le_esf_longe ?? '', le_cil_longe: initial.le_cil_longe ?? '',
        le_eixo_longe: initial.le_eixo_longe ?? '', le_av_longe: initial.le_av_longe ?? '',
        re_esf_perto: initial.re_esf_perto ?? '', re_cil_perto: initial.re_cil_perto ?? '',
        re_eixo_perto: initial.re_eixo_perto ?? '',
        le_esf_perto: initial.le_esf_perto ?? '', le_cil_perto: initial.le_cil_perto ?? '',
        le_eixo_perto: initial.le_eixo_perto ?? '',
        re_dnp: initial.re_dnp ?? '', le_dnp: initial.le_dnp ?? '',
        re_altura: initial.re_altura ?? '', le_altura: initial.le_altura ?? '',
        adicao: initial.adicao ?? '', dp_longe: initial.dp_longe ?? '', dp_perto: initial.dp_perto ?? '',
        date: initial.date ?? new Date().toISOString().split('T')[0],
        notes: initial.notes ?? '', status: initial.status ?? 'realizada',
      });
    }
  }, []);

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, name, phone').eq('tenant_id', tenantId).eq('active', true).order('name');
    setCustomers(data as Customer[] ?? []);
  };

  const filteredCustomers = customers.filter(c =>
    !searchCustomer || c.name.toLowerCase().includes(searchCustomer.toLowerCase())
  );

  const set = (k: string, v: string) => setRx(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!selectedCustomer && !initial) { toast.error('Selecione um cliente'); return; }
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        customer_id: selectedCustomer?.id ?? initial?.customer_id,
        customer_name: selectedCustomer?.name ?? initial?.customer_name,
        professional_id: user?.id,
        professional_name: user?.full_name,
        ...Object.fromEntries(Object.entries(rx).map(([k,v]) => [k, v === '' ? null : isNaN(Number(v)) ? v : Number(v)])),
        date: rx.date,
        notes: rx.notes,
        status: rx.status,
      };

      if (initial) {
        await supabase.from('consultations').update(payload).eq('id', initial.id);
        toast.success('Consulta atualizada!');
      } else {
        await supabase.from('consultations').insert([payload]);
        toast.success('Consulta salva!');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateOS = async () => {
    if (!initial) return;
    toast.success('OS gerada a partir da consulta!');
    await supabase.from('consultations').update({ generated_os: true }).eq('id', initial.id);
    onSaved();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3>{initial ? 'Ver / Editar Consulta' : 'Nova Consulta'}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {/* Seleção de cliente */}
          {!initial && (
            <div className="form-group">
              <label className="form-label">Cliente *</label>
              {selectedCustomer ? (
                <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--bg3)', padding:'10px 14px', borderRadius:'var(--radius)', border:'1px solid var(--primary)' }}>
                  <strong style={{ flex:1 }}>{selectedCustomer.name}</strong>
                  <button className="btn-icon" onClick={() => setSelectedCustomer(null)}><X size={14} /></button>
                </div>
              ) : (
                <div>
                  <div className="search-bar" style={{ marginBottom:8 }}>
                    <Search size={14} />
                    <input className="form-input" placeholder="Buscar cliente..." value={searchCustomer} onChange={e => setSearchCustomer(e.target.value)} />
                  </div>
                  {searchCustomer && (
                    <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', border:'1px solid var(--border)', maxHeight:160, overflowY:'auto' }}>
                      {filteredCustomers.slice(0,8).map(c => (
                        <div key={c.id} onClick={() => { setSelectedCustomer(c); setSearchCustomer(''); }}
                          style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:13 }}
                          onMouseEnter={e => (e.currentTarget.style.background='var(--bg4)')}
                          onMouseLeave={e => (e.currentTarget.style.background='')}>
                          {c.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="form-row form-row-2" style={{ marginBottom:16 }}>
            <div className="form-group"><label className="form-label">Data</label><input className="form-input" type="date" value={rx.date} onChange={e => set('date',e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-select" value={rx.status} onChange={e => set('status',e.target.value)}>
                <option value="realizada">Realizada</option>
                <option value="agendada">Agendada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs">
            <button className={`tab ${tab==='rx'?'active':''}`} onClick={() => setTab('rx')}>👁️ Receituário</button>
            <button className={`tab ${tab==='obs'?'active':''}`} onClick={() => setTab('obs')}>📝 Observações</button>
          </div>

          {tab === 'rx' && (
            <div>
              {/* Longe */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>🔵 Visão Longe</div>
                <div className="rx-grid">
                  <div></div>
                  {['ESF','CIL','EIXO','AV',''].map(h => <div key={h} className="rx-header">{h}</div>)}
                  <div className="rx-label">OD</div>
                  <RxInput value={rx.re_esf_longe}  onChange={v => set('re_esf_longe',v)} />
                  <RxInput value={rx.re_cil_longe}  onChange={v => set('re_cil_longe',v)} />
                  <RxInput value={rx.re_eixo_longe} onChange={v => set('re_eixo_longe',v)} />
                  <RxInput value={rx.re_av_longe}   onChange={v => set('re_av_longe',v)} />
                  <div></div>
                  <div className="rx-label">OE</div>
                  <RxInput value={rx.le_esf_longe}  onChange={v => set('le_esf_longe',v)} />
                  <RxInput value={rx.le_cil_longe}  onChange={v => set('le_cil_longe',v)} />
                  <RxInput value={rx.le_eixo_longe} onChange={v => set('le_eixo_longe',v)} />
                  <RxInput value={rx.le_av_longe}   onChange={v => set('le_av_longe',v)} />
                  <div></div>
                </div>
              </div>

              {/* Perto */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--warning)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>🟡 Visão Perto</div>
                <div className="rx-grid">
                  <div></div>
                  {['ESF','CIL','EIXO','',''].map(h => <div key={h} className="rx-header">{h}</div>)}
                  <div className="rx-label">OD</div>
                  <RxInput value={rx.re_esf_perto}  onChange={v => set('re_esf_perto',v)} />
                  <RxInput value={rx.re_cil_perto}  onChange={v => set('re_cil_perto',v)} />
                  <RxInput value={rx.re_eixo_perto} onChange={v => set('re_eixo_perto',v)} />
                  <div></div><div></div>
                  <div className="rx-label">OE</div>
                  <RxInput value={rx.le_esf_perto}  onChange={v => set('le_esf_perto',v)} />
                  <RxInput value={rx.le_cil_perto}  onChange={v => set('le_cil_perto',v)} />
                  <RxInput value={rx.le_eixo_perto} onChange={v => set('le_eixo_perto',v)} />
                  <div></div><div></div>
                </div>
              </div>

              {/* DNP, Altura, Adição, DP */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                {[
                  { label:'DNP OD', k:'re_dnp' }, { label:'DNP OE', k:'le_dnp' },
                  { label:'Altura OD', k:'re_altura' }, { label:'Altura OE', k:'le_altura' },
                  { label:'Adição', k:'adicao' }, { label:'DP Longe', k:'dp_longe' },
                  { label:'DP Perto', k:'dp_perto' },
                ].map(({ label, k }) => (
                  <div key={k} className="form-group">
                    <label className="form-label">{label}</label>
                    <input className="form-input" style={{ textAlign:'center' }} value={(rx as any)[k]} onChange={e => set(k, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'obs' && (
            <div className="form-group">
              <label className="form-label">Observações clínicas</label>
              <textarea className="form-textarea" rows={6} placeholder="Observações sobre a consulta, recomendações, diagnóstico..." value={rx.notes} onChange={e => set('notes',e.target.value)} />
            </div>
          )}
        </div>
        <div className="modal-footer">
          {initial && !initial.generated_os && (
            <button className="btn btn-success btn-sm" onClick={handleGenerateOS}>
              <ClipboardList size={14} /> Gerar OS
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : initial ? 'Salvar' : 'Registrar Consulta'}
          </button>
        </div>
      </div>
    </div>
  );
}

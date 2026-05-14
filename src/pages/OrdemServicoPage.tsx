import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Edit2, Eye, ClipboardList,
  Clock, CheckCircle, Truck, Package, X, Save,
  Download, Printer, Trash2, Circle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL, formatDate } from '../types/index';

const STATUS_LIST = [
  { value:'orcamento',  label:'Orçamento',        color:'#94a3b8', bg:'rgba(148,163,184,.15)' },
  { value:'confirmada', label:'Confirmada',        color:'#6366f1', bg:'rgba(99,102,241,.15)'  },
  { value:'lab',        label:'No Laboratório',    color:'#f59e0b', bg:'rgba(245,158,11,.15)'  },
  { value:'montagem',   label:'Em Montagem',       color:'#06b6d4', bg:'rgba(6,182,212,.15)'   },
  { value:'pronta',     label:'Pronta p/ Entrega', color:'#22c55e', bg:'rgba(34,197,94,.15)'   },
  { value:'entregue',   label:'Entregue',          color:'#a855f7', bg:'rgba(168,85,247,.15)'  },
  { value:'cancelada',  label:'Cancelada',         color:'#f87171', bg:'rgba(248,113,113,.15)' },
];
function getStatus(v: string) { return STATUS_LIST.find(s => s.value===v)||STATUS_LIST[0]; }

function emptyForm() {
  return { customer_id:'', customer_name:'', lens_type:'', lens_brand:'', lens_material:'',
    frame_brand:'', frame_model:'', frame_color:'', frame_price:0,
    lens_price:0, discount:0, status:'orcamento', lab_name:'', delivery_date:'', notes:'' };
}

interface OS {
  id:string; os_number:number; tenant_id:string; customer_id?:string; customer_name:string;
  lens_type?:string; lens_brand?:string; lens_material?:string; frame_brand?:string;
  frame_model?:string; frame_color?:string; frame_price:number; lens_price:number;
  total:number; discount:number; status:string; lab_name?:string;
  delivery_date?:string; notes?:string; created_at:string;
}
interface Customer { id:string; name:string; }

export default function OrdemServicoPage() {
  const { tenantId } = useAuth();
  const [orders, setOrders]       = useState<OS[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing]     = useState<OS | null>(null);
  const [editing, setEditing]     = useState<OS | null>(null);
  const [form, setForm]           = useState(emptyForm());
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data:os },{ data:cli }] = await Promise.all([
      supabase.from('service_orders').select('*').eq('tenant_id', tenantId).order('created_at', { ascending:false }),
      supabase.from('customers').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name')
    ]);
    setOrders((os as OS[])||[]); setCustomers((cli as Customer[])||[]);
    setLoading(false);
  };
  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const emAberto  = orders.filter(o => !['entregue','cancelada'].includes(o.status)).length;
  const prontas   = orders.filter(o => o.status==='pronta').length;
  const entregues = orders.filter(o => o.status==='entregue').length;

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter) list = list.filter(o => o.status===statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(o => o.customer_name.toLowerCase().includes(s) || String(o.os_number).includes(s));
    }
    return list;
  }, [orders, search, statusFilter]);

  const openNew  = () => { setEditing(null); setViewing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (o: OS) => {
    setViewing(null); setEditing(o);
    setForm({ customer_id:o.customer_id||'', customer_name:o.customer_name,
      lens_type:o.lens_type||'', lens_brand:o.lens_brand||'', lens_material:o.lens_material||'',
      frame_brand:o.frame_brand||'', frame_model:o.frame_model||'', frame_color:o.frame_color||'',
      frame_price:o.frame_price, lens_price:o.lens_price, discount:o.discount,
      status:o.status, lab_name:o.lab_name||'', delivery_date:o.delivery_date||'', notes:o.notes||'' });
    setShowModal(true);
  };
  const openView = (o: OS) => { setEditing(null); setViewing(o); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name.trim()) { toast.error('Cliente obrigatório'); return; }
    setSaving(true);
    try {
      const total = (form.frame_price + form.lens_price) - form.discount;
      const payload = { ...form, total, delivery_date:form.delivery_date||null,
        customer_id:form.customer_id||null, tenant_id:tenantId };
      if (editing) {
        const { error } = await supabase.from('service_orders').update(payload).eq('id', editing.id);
        if (error) throw error; toast.success('OS atualizada!');
      } else {
        const { error } = await supabase.from('service_orders').insert([payload]);
        if (error) throw error; toast.success('OS criada!');
      }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message||'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('service_orders').update({ status }).eq('id', id);
    toast.success('Status atualizado!'); load();
  };

  const deleteOS = async (o: OS) => {
    if (!confirm('Excluir OS #'+String(o.os_number).padStart(4,'0')+'?')) return;
    await supabase.from('service_orders').delete().eq('id', o.id);
    toast.success('OS excluída'); load();
  };

  const printOS = (o: OS) => {
    const st = getStatus(o.status);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write('<html><head><title>OS #'+String(o.os_number).padStart(4,'0')+'</title><style>body{font-family:sans-serif;padding:24px;color:#111}h2{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 12px;border:1px solid #ddd;font-size:14px}th{background:#f5f5f5;padding:8px 12px;border:1px solid #ddd;text-align:left}.status{display:inline-block;padding:3px 10px;border-radius:12px;font-size:13px;font-weight:600}</style></head><body>');
    win.document.write('<h2>Ordem de Serviço #'+String(o.os_number).padStart(4,'0')+'</h2>');
    win.document.write('<p>Cliente: <strong>'+o.customer_name+'</strong> | Status: <span class="status">'+st.label+'</span></p>');
    win.document.write('<table><tr><th>Item</th><th>Detalhe</th></tr>');
    const rows = [
      ['Armação', ((o.frame_brand||'')+(o.frame_model?' '+o.frame_model:'')+(o.frame_color?' '+o.frame_color:'')).trim()||'—'],
      ['Tipo de Lente', o.lens_type||'—'],['Marca da Lente', o.lens_brand||'—'],
      ['Material', o.lens_material||'—'],['Laboratório', o.lab_name||'—'],
      ['Entrega prevista', o.delivery_date ? formatDate(o.delivery_date) : '—'],
      ['Valor Armação', formatBRL(o.frame_price)],['Valor Lente', formatBRL(o.lens_price)],
      ['Desconto', formatBRL(o.discount)],['TOTAL', formatBRL(o.total)],
    ];
    rows.forEach(([k,v]) => win.document.write('<tr><td>'+k+'</td><td>'+v+'</td></tr>'));
    if (o.notes) win.document.write('<tr><td>Observações</td><td>'+o.notes+'</td></tr>');
    win.document.write('</table></body></html>');
    win.document.close(); win.print();
  };

  const exportCSV = () => {
    const header = 'OS,Cliente,Status,Laboratório,Entrega,Total';
    const rows = filtered.map(o =>
      [o.os_number, o.customer_name, getStatus(o.status).label, o.lab_name, o.delivery_date, o.total]
        .map(v => '"'+(v??'')+'"').join(','));
    const blob = new Blob([header+'\n'+rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'ordens-servico.csv'; a.click(); toast.success('Exportado!');
  };

  const total = form.frame_price + form.lens_price - form.discount;
  const set   = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const IconBtn = ({ onClick, title, color, children }: any) => (
    <button onClick={onClick} title={title}
      style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
        borderRadius:7, padding:'5px 8px', cursor:'pointer', color:color||'var(--text-muted)',
        display:'flex', alignItems:'center', transition:'all .15s' }}
      onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,.12)')}
      onMouseLeave={e => (e.currentTarget.style.background='rgba(255,255,255,.06)')}>
      {children}
    </button>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <ClipboardList size={22}/> Controle de Ordens de Serviço
          </h1>
          <p className="page-sub">Acompanhamento de laboratório e montagem em tempo real</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Nova OS</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { icon:<Clock size={22}/>, val:emAberto, label:'Ordens em Aberto', color:'#f59e0b' },
          { icon:<CheckCircle size={22}/>, val:prontas, label:'Prontas p/ Entrega', color:'#22c55e' },
          { icon:<Truck size={22}/>, val:entregues, label:'Entregues (Total)', color:'#a855f7' },
          { icon:<Package size={22}/>, val:orders.length, label:'Total de OS', color:'#6366f1' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:28, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Pesquisar por cliente ou número da OS..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{ width:200 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos os Status</option>
          {STATUS_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Tabela */}
      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><ClipboardList size={40}/></div>
          <h3>Nenhuma OS aberta ainda.</h3>
          <button className="btn btn-primary" onClick={openNew}><Plus size={15}/> Abrir primeira OS</button>
        </div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>OS#</th><th>Cliente</th><th>Status</th><th>Laboratório</th><th>Entrega Prevista</th><th>Total</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const st = getStatus(o.status);
                  return (
                    <tr key={o.id}>
                      <td>
                        <div style={{ fontWeight:700, color:'#6366f1' }}>#{String(o.os_number).padStart(4,'0')}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date(o.created_at).toLocaleDateString('pt-BR')}</div>
                      </td>
                      <td style={{ fontWeight:500 }}>{o.customer_name}</td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
                          padding:'4px 10px', borderRadius:20, background:st.bg, color:st.color }}>
                          <Circle size={7} style={{ fill:st.color }}/> {st.label}
                        </span>
                      </td>
                      <td style={{ fontSize:13, color:'var(--text-muted)' }}>{o.lab_name||'—'}</td>
                      <td style={{ fontSize:13 }}>{o.delivery_date ? formatDate(o.delivery_date) : '—'}</td>
                      <td style={{ fontWeight:600, color:'#6366f1' }}>{formatBRL(o.total)}</td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <IconBtn onClick={() => openView(o)} title="Ver detalhes" color="#94a3b8"><Eye size={14}/></IconBtn>
                          <IconBtn onClick={() => {
                            const next = STATUS_LIST[(STATUS_LIST.findIndex(s=>s.value===o.status)+1)%STATUS_LIST.length];
                            updateStatus(o.id, next.value);
                          }} title="Avançar status" color="#22c55e"><Circle size={14}/></IconBtn>
                          <IconBtn onClick={() => printOS(o)} title="Imprimir OS" color="#06b6d4"><Printer size={14}/></IconBtn>
                          <IconBtn onClick={() => openEdit(o)} title="Editar" color="#6366f1"><Edit2 size={14}/></IconBtn>
                          <IconBtn onClick={() => deleteOS(o)} title="Excluir" color="#f87171"><Trash2 size={14}/></IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
       )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth:660, width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {viewing ? 'OS #'+String(viewing.os_number).padStart(4,'0')+' — '+viewing.customer_name
                  : editing ? 'Editar OS #'+String(editing.os_number).padStart(4,'0')
                  : 'Nova Ordem de Serviço'}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18}/></button>
            </div>

            {viewing ? (
              <div className="modal-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    ['Cliente', viewing.customer_name],
                    ['Status', getStatus(viewing.status).label],
                    ['Armação', ((viewing.frame_brand||'')+(viewing.frame_model?' '+viewing.frame_model:'')+(viewing.frame_color?' '+viewing.frame_color:'')).trim()||'—'],
                    ['Tipo de Lente', viewing.lens_type||'—'],
                    ['Marca da Lente', viewing.lens_brand||'—'],
                    ['Material', viewing.lens_material||'—'],
                    ['Laboratório', viewing.lab_name||'—'],
                    ['Entrega', viewing.delivery_date ? formatDate(viewing.delivery_date) : '—'],
                    ['Armação', formatBRL(viewing.frame_price)],
                    ['Lente', formatBRL(viewing.lens_price)],
                    ['Desconto', '-'+formatBRL(viewing.discount)],
                    ['TOTAL', formatBRL(viewing.total)],
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ padding:'10px 14px', background:'var(--bg-card)', borderRadius:8 }}>
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>{label}</div>
                      <div style={{ fontSize:14, fontWeight:label==='TOTAL'?700:500, color:label==='TOTAL'?'#6366f1':'inherit' }}>{val}</div>
                    </div>
                  ))}
                  {viewing.notes && (
                    <div style={{ gridColumn:'1/-1', padding:'10px 14px', background:'var(--bg-card)', borderRadius:8 }}>
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>Observações</div>
                      <div style={{ fontSize:14 }}>{viewing.notes}</div>
                    </div>
                  )}
                </div>
                <div className="modal-footer" style={{ marginTop:16 }}>
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Fechar</button>
                  <button className="btn btn-secondary" onClick={() => printOS(viewing)} style={{ color:'#06b6d4' }}><Printer size={15}/> Imprimir</button>
                  <button className="btn btn-primary" onClick={() => openEdit(viewing)}><Edit2 size={15}/> Editar</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label className="form-label">Cliente *</label>
                      <select className="form-input" value={form.customer_id}
                        onChange={e => { const c = customers.find(c => c.id===e.target.value); set('customer_id', e.target.value); set('customer_name', c?.name||''); }} required>
                        <option value="">Selecione o cliente...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div><label className="form-label">Marca da Armação</label><input className="form-input" value={form.frame_brand} onChange={e => set('frame_brand', e.target.value)}/></div>
                    <div><label className="form-label">Modelo</label><input className="form-input" value={form.frame_model} onChange={e => set('frame_model', e.target.value)}/></div>
                    <div><label className="form-label">Cor</label><input className="form-input" value={form.frame_color} onChange={e => set('frame_color', e.target.value)}/></div>
                    <div><label className="form-label">Valor da Armação (R$)</label><input className="form-input" type="number" step="0.01" min="0" value={form.frame_price} onChange={e => set('frame_price', parseFloat(e.target.value)||0)}/></div>
                    <div><label className="form-label">Tipo de Lente</label>
                      <select className="form-input" value={form.lens_type} onChange={e => set('lens_type', e.target.value)}>
                        <option value="">Selecione...</option>
                        {['Monofocal','Bifocal','Progressiva','Lente de Contato','Solar','Anti-reflexo'].map(l=><option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div><label className="form-label">Marca da Lente</label><input className="form-input" value={form.lens_brand} onChange={e => set('lens_brand', e.target.value)}/></div>
                    <div><label className="form-label">Material</label>
                      <select className="form-input" value={form.lens_material} onChange={e => set('lens_material', e.target.value)}>
                        <option value="">Selecione...</option>
                        {['CR-39','Policarbonato','Trivex','Alto Índice 1.60','Alto Índice 1.67','Alto Índice 1.74'].map(m=><option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div><label className="form-label">Valor da Lente (R$)</label><input className="form-input" type="number" step="0.01" min="0" value={form.lens_price} onChange={e => set('lens_price', parseFloat(e.target.value)||0)}/></div>
                    <div><label className="form-label">Desconto (R$)</label><input className="form-input" type="number" step="0.01" min="0" value={form.discount} onChange={e => set('discount', parseFloat(e.target.value)||0)}/></div>
                    <div><label className="form-label">Laboratório</label><input className="form-input" value={form.lab_name} onChange={e => set('lab_name', e.target.value)}/></div>
                    <div><label className="form-label">Data de Entrega</label><input className="form-input" type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)}/></div>
                    <div><label className="form-label">Status</label>
                      <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                        {STATUS_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn:'1/-1', padding:'12px 16px', borderRadius:8, background:'rgba(99,102,241,.1)',
                      display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                      <span style={{ fontSize:14 }}>Armação: <strong>{formatBRL(form.frame_price)}</strong></span>
                      <span style={{ fontSize:14 }}>Lente: <strong>{formatBRL(form.lens_price)}</strong></span>
                      <span style={{ fontSize:14 }}>Desconto: <strong style={{ color:'#f87171' }}>-{formatBRL(form.discount)}</strong></span>
                      <span style={{ fontSize:16, fontWeight:700, color:'#6366f1' }}>Total: {formatBRL(total)}</span>
                    </div>
                    <div style={{ gridColumn:'1/-1' }}><label className="form-label">Observações</label><textarea className="form-input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}/></div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}><Save size={15}/> {saving?'Salvando...':'Salvar OS'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

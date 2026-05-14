import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Search, Edit2, Eye, ChevronRight } from 'lucide-react';
import { formatBRL, formatDate, OS_STATUS_LABELS, OS_STATUS_COLORS } from '../types/index';
import type { ServiceOrder, Customer } from '../types/index';
import toast from 'react-hot-toast';

const STATUS_LIST = ['orcamento','aprovada','em_producao','pronta','entregue','cancelada'];

const emptyForm = () => ({
  customer_name:'', customer_id:'',
  lens_type:'', lens_brand:'', lens_material:'',
  frame_brand:'', frame_model:'', frame_color:'', frame_price:'',
  lens_price:'', total:'', discount:'0',
  status:'orcamento', lab_name:'', delivery_date:'', notes:''
});

export default function OrdemServicoPage() {
  const { tenantId } = useAuth();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ServiceOrder | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchCustomer, setSearchCustomer] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => { if (tenantId) { load(); loadCustomers(); } }, [tenantId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('service_orders').select('*').eq('tenant_id', tenantId).order('created_at', { ascending:false });
    setOrders(data as ServiceOrder[] ?? []);
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, name, phone').eq('tenant_id', tenantId).eq('active', true).order('name');
    setCustomers(data as Customer[] ?? []);
  };

  const filtered = useMemo(() => {
    let o = orders;
    if (search) o = o.filter(x => x.customer_name.toLowerCase().includes(search.toLowerCase()) || String(x.os_number).includes(search));
    if (statusFilter) o = o.filter(x => x.status === statusFilter);
    return o;
  }, [orders, search, statusFilter]);

  const filteredCustomers = customers.filter(c => !searchCustomer || c.name.toLowerCase().includes(searchCustomer.toLowerCase()));

  const openNew = () => { setEditing(null); setForm(emptyForm()); setSelectedCustomer(null); setSearchCustomer(''); setShowModal(true); };
  const openEdit = (o: ServiceOrder) => {
    setEditing(o);
    setForm({
      customer_name:o.customer_name, customer_id:o.customer_id||'',
      lens_type:o.lens_type||'', lens_brand:o.lens_brand||'', lens_material:o.lens_material||'',
      frame_brand:o.frame_brand||'', frame_model:o.frame_model||'', frame_color:o.frame_color||'', frame_price:String(o.frame_price||0),
      lens_price:String(o.lens_price||0), total:String(o.total||0), discount:String(o.discount||0),
      status:o.status, lab_name:o.lab_name||'', delivery_date:o.delivery_date||'', notes:o.notes||''
    });
    setSelectedCustomer(null);
    setShowModal(true);
  };

  const calcTotal = (fp: string, lp: string, disc: string) => {
    const t = (parseFloat(fp)||0) + (parseFloat(lp)||0) - (parseFloat(disc)||0);
    return Math.max(0, t).toFixed(2);
  };

  const set = (k: string, v: string) => {
    setForm(p => {
      const updated = { ...p, [k]: v };
      if (k === 'frame_price' || k === 'lens_price' || k === 'discount') {
        updated.total = calcTotal(
          k === 'frame_price' ? v : p.frame_price,
          k === 'lens_price' ? v : p.lens_price,
          k === 'discount' ? v : p.discount
        );
      }
      return updated;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const customerName = selectedCustomer?.name || form.customer_name;
    if (!customerName.trim()) { toast.error('Informe o cliente'); return; }
    setSaving(true);
    try {
      const payload = {
        customer_name: customerName,
        customer_id: selectedCustomer?.id || form.customer_id || null,
        lens_type: form.lens_type || null,
        lens_brand: form.lens_brand || null,
        lens_material: form.lens_material || null,
        frame_brand: form.frame_brand || null,
        frame_model: form.frame_model || null,
        frame_color: form.frame_color || null,
        frame_price: parseFloat(form.frame_price) || 0,
        lens_price: parseFloat(form.lens_price) || 0,
        total: parseFloat(form.total) || 0,
        discount: parseFloat(form.discount) || 0,
        status: form.status,
        lab_name: form.lab_name || null,
        delivery_date: form.delivery_date || null,
        notes: form.notes || null,
      };
      if (editing) {
        await supabase.from('service_orders').update(payload).eq('id', editing.id);
        toast.success('OS atualizada!');
      } else {
        await supabase.from('service_orders').insert([{ ...payload, tenant_id: tenantId }]);
        toast.success('OS criada!');
      }
      setShowModal(false);
      load();
    } catch (err: any) { toast.error('Erro: ' + err.message); } finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('service_orders').update({ status }).eq('id', id);
    setOrders(p => p.map(o => o.id === id ? { ...o, status: status as any } : o));
    toast.success('Status atualizado!');
  };

  const stats = {
    total: orders.length,
    orcamento: orders.filter(o => o.status === 'orcamento').length,
    producao: orders.filter(o => o.status === 'em_producao').length,
    pronta: orders.filter(o => o.status === 'pronta').length,
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Ordens de Serviço</h1><p className="page-sub">{orders.length} ordens</p></div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Nova OS</button>
      </div>

      {/* Stats rápidas */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Total', value:stats.total, color:'var(--primary)' },
          { label:'Orçamento', value:stats.orcamento, color:'var(--text2)' },
          { label:'Em produção', value:stats.producao, color:'var(--warning)' },
          { label:'Prontas', value:stats.pronta, color:'var(--success)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ textAlign:'center', padding:14 }}>
            <div style={{ fontSize:22, fontWeight:800, color }}>{value}</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:200 }}>
          <Search size={15} />
          <input className="form-input" placeholder="Buscar por cliente ou nº OS..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width:170 }}>
          <option value="">Todos os status</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{OS_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📋</div><h3>Nenhuma OS encontrada</h3><p>Crie uma nova ordem de serviço</p></div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nº OS</th><th>Cliente</th><th>Armação</th><th>Lente</th><th>Total</th><th>Entrega</th><th>Status</th><th>Ação</th></tr></thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id}>
                    <td><strong>#{o.os_number ?? '—'}</strong></td>
                    <td>{o.customer_name}</td>
                    <td style={{ color:'var(--text2)', fontSize:12 }}>{[o.frame_brand, o.frame_model].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ color:'var(--text2)', fontSize:12 }}>{o.lens_brand || o.lens_type || '—'}</td>
                    <td style={{ fontWeight:700, color:'var(--success)' }}>{formatBRL(o.total)}</td>
                    <td style={{ color:'var(--text2)', fontSize:12 }}>{o.delivery_date ? formatDate(o.delivery_date) : '—'}</td>
                    <td>
                      <select
                        className="form-select"
                        value={o.status}
                        onChange={e => updateStatus(o.id, e.target.value)}
                        style={{ fontSize:12, padding:'4px 8px', width:'auto', background:`${OS_STATUS_COLORS[o.status]}15`, color:OS_STATUS_COLORS[o.status], borderColor:OS_STATUS_COLORS[o.status]+'40' }}
                      >
                        {STATUS_LIST.map(s => <option key={s} value={s}>{OS_STATUS_LABELS[s]}</option>)}
                      </select>
                    </td>
                    <td><button className="btn-icon" onClick={() => openEdit(o)}><Edit2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
       )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>{editing ? `Editar OS #${editing.os_number}` : 'Nova Ordem de Serviço'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {/* Cliente */}
                <div className="form-group">
                  <label className="form-label">Cliente *</label>
                  {selectedCustomer ? (
                    <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--bg3)', padding:'10px 14px', borderRadius:'var(--radius)', border:'1px solid var(--primary)' }}>
                      <strong style={{ flex:1 }}>{selectedCustomer.name}</strong>
                      <button type="button" className="btn-icon" onClick={() => setSelectedCustomer(null)}>✕</button>
                    </div>
                  ) : editing ? (
                    <input className="form-input" value={form.customer_name} onChange={e => set('customer_name',e.target.value)} />
                  ) : (
                    <div>
                      <div className="search-bar" style={{ marginBottom:6 }}>
                        <Search size={14} />
                        <input className="form-input" placeholder="Buscar cliente..." value={searchCustomer} onChange={e => setSearchCustomer(e.target.value)} />
                      </div>
                      {searchCustomer && (
                        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', border:'1px solid var(--border)', maxHeight:140, overflowY:'auto' }}>
                          {filteredCustomers.slice(0,6).map(c => (
                            <div key={c.id} onClick={() => { setSelectedCustomer(c); setSearchCustomer(''); }}
                              style={{ padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:13 }}
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

                {/* Status e Entrega */}
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Status</label>
                    <select className="form-select" value={form.status} onChange={e => set('status',e.target.value)}>
                      {STATUS_LIST.map(s => <option key={s} value={s}>{OS_STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Previsão de entrega</label><input className="form-input" type="date" value={form.delivery_date} onChange={e => set('delivery_date',e.target.value)} /></div>
                </div>

                {/* Armação */}
                <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:14, marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)', marginBottom:10, textTransform:'uppercase' }}>🕶️ Armação</div>
                  <div className="form-row form-row-3">
                    <div className="form-group"><label className="form-label">Marca</label><input className="form-input" value={form.frame_brand} onChange={e => set('frame_brand',e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Modelo</label><input className="form-input" value={form.frame_model} onChange={e => set('frame_model',e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Cor</label><input className="form-input" value={form.frame_color} onChange={e => set('frame_color',e.target.value)} /></div>
                  </div>
                  <div className="form-group"><label className="form-label">Valor armação (R$)</label><input className="form-input" type="number" step="0.01" value={form.frame_price} onChange={e => set('frame_price',e.target.value)} /></div>
                </div>

                {/* Lente */}
                <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:14, marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--primary)', marginBottom:10, textTransform:'uppercase' }}>🔍 Lente</div>
                  <div className="form-row form-row-3">
                    <div className="form-group"><label className="form-label">Tipo</label><input className="form-input" placeholder="Ex: Multifocal" value={form.lens_type} onChange={e => set('lens_type',e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Marca</label><input className="form-input" value={form.lens_brand} onChange={e => set('lens_brand',e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Material</label><input className="form-input" placeholder="Ex: Policarbonato" value={form.lens_material} onChange={e => set('lens_material',e.target.value)} /></div>
                  </div>
                  <div className="form-row form-row-2">
                    <div className="form-group"><label className="form-label">Valor lente (R$)</label><input className="form-input" type="number" step="0.01" value={form.lens_price} onChange={e => set('lens_price',e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Laboratório</label><input className="form-input" value={form.lab_name} onChange={e => set('lab_name',e.target.value)} /></div>
                  </div>
                </div>

                {/* Totais */}
                <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:14, marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--success)', marginBottom:10, textTransform:'uppercase' }}>💰 Valores</div>
                  <div className="form-row form-row-3">
                    <div className="form-group"><label className="form-label">Desconto (R$)</label><input className="form-input" type="number" step="0.01" value={form.discount} onChange={e => set('discount',e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Total (R$)</label>
                      <input className="form-input" type="number" step="0.01" value={form.total} onChange={e => set('total',e.target.value)} style={{ fontWeight:700, color:'var(--success)' }} />
                    </div>
                  </div>
                </div>

                <div className="form-group"><label className="form-label">Observações</label><textarea className="form-textarea" value={form.notes} onChange={e => set('notes',e.target.value)} rows={3} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar OS'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Edit2, Phone, Download, Upload,
  Trash2, Users, Gift, DollarSign, Wifi, X, Save,
  Eye, MessageCircle, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Customer } from '../types/index';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function emptyForm() {
  return { name:'', cpf:'', phone:'', whatsapp:'', email:'', birth_date:'', address:'', city:'', state:'', notes:'', active:true };
}

export default function ClientesPage() {
  const { tenantId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showBirthMonth, setShowBirthMonth] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing]     = useState<Customer | null>(null);
  const [editing, setEditing]     = useState<Customer | null>(null);
  const [form, setForm]           = useState(emptyForm());
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').eq('tenant_id', tenantId).order('name');
    setCustomers((data as Customer[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const hoje          = new Date();
  const semanaFim     = new Date(hoje); semanaFim.setDate(hoje.getDate() + 7);
  const totalAtivos   = customers.filter(c => c.active).length;
  const aniversSemana = customers.filter(c => {
    if (!c.birth_date) return false;
    const d = new Date(c.birth_date + 'T00:00:00');
    const aniv = new Date(hoje.getFullYear(), d.getMonth(), d.getDate());
    return aniv >= hoje && aniv <= semanaFim;
  }).length;
  const aniversMes = customers.filter(c => {
    if (!c.birth_date) return false;
    return new Date(c.birth_date + 'T00:00:00').getMonth() === hoje.getMonth();
  }).length;

  const filtered = useMemo(() => {
    let list = customers;
    if (!showInactive) list = list.filter(c => c.active);
    if (showBirthMonth) list = list.filter(c => {
      if (!c.birth_date) return false;
      return new Date(c.birth_date + 'T00:00:00').getMonth() === new Date().getMonth();
    });
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(s) || c.cpf?.includes(s) || c.phone?.includes(s));
    }
    if (cityFilter.trim()) list = list.filter(c => c.city?.toLowerCase().includes(cityFilter.toLowerCase()));
    if (dateFrom) list = list.filter(c => c.created_at && c.created_at >= dateFrom);
    if (dateTo)   list = list.filter(c => c.created_at && c.created_at <= dateTo + 'T23:59:59');
    return list;
  }, [customers, search, cityFilter, dateFrom, dateTo, showInactive, showBirthMonth]);

  const openNew  = () => { setEditing(null); setViewing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (c: Customer) => {
    setViewing(null); setEditing(c);
    setForm({ name:c.name, cpf:c.cpf||'', phone:c.phone||'', whatsapp:c.whatsapp||'',
              email:c.email||'', birth_date:c.birth_date||'', address:c.address||'',
              city:c.city||'', state:c.state||'', notes:c.notes||'', active:c.active });
    setShowModal(true);
  };
  const openView = (c: Customer) => { setEditing(null); setViewing(c); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try {
      const payload = { ...form, birth_date: form.birth_date || null, tenant_id: tenantId };
      if (editing) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Cliente atualizado!');
      } else {
        const { error } = await supabase.from('customers').insert([payload]);
        if (error) throw error;
        toast.success('Cliente cadastrado!');
      }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (c: Customer) => {
    await supabase.from('customers').update({ active: !c.active }).eq('id', c.id);
    toast.success(c.active ? 'Cliente inativado' : 'Cliente reativado');
    load();
  };

  const openWhatsApp = (c: Customer) => {
    const num = (c.whatsapp || c.phone || '').replace(/\D/g, '');
    if (!num) { toast.error('Nenhum número cadastrado'); return; }
    window.open('https://wa.me/55' + num, '_blank');
  };

  const exportCSV = () => {
    const header = 'Nome,CPF,Telefone,WhatsApp,Email,Nascimento,Endereço,Cidade,Estado';
    const rows = filtered.map(c =>
      [c.name,c.cpf,c.phone,c.whatsapp,c.email,c.birth_date,c.address,c.city,c.state]
        .map(v => '"'+(v||'')+'"').join(','));
    const blob = new Blob([header+'\n'+rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'clientes.csv'; a.click(); toast.success('Exportado!');
  };

  const downloadModelo = () => {
    const csv = 'Nome,CPF,Telefone,WhatsApp,Email,Nascimento (AAAA-MM-DD),Endereço,Cidade,Estado\nJoão Silva,123.456.789-00,(92) 99999-0000,(92) 99999-0000,joao@email.com,1985-03-15,Rua das Flores 123,Manaus,AM';
    const blob = new Blob([csv], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'modelo-clientes.csv'; a.click();
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const lines = (ev.target?.result as string).split('\n').slice(1).filter(l => l.trim());
      let ok = 0, fail = 0;
      for (const line of lines) {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g,'').trim());
        if (!cols[0]) continue;
        const { error } = await supabase.from('customers').insert([{
          tenant_id: tenantId, name:cols[0], cpf:cols[1]||null, phone:cols[2]||null,
          whatsapp:cols[3]||null, email:cols[4]||null, birth_date:cols[5]||null,
          address:cols[6]||null, city:cols[7]||null, state:cols[8]||null, active:true
        }]);
        error ? fail++ : ok++;
      }
      toast.success('Importados: '+ok+' | Erros: '+fail); load();
    };
    reader.readAsText(file); e.target.value = '';
  };

  const zerarClientes = async () => {
    if (!confirm('Inativar TODOS os clientes?')) return;
    await supabase.from('customers').update({ active: false }).eq('tenant_id', tenantId);
    toast.success('Todos inativados'); load();
  };

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const IconBtn = ({ onClick, title, color, children }: any) => (
    <button onClick={onClick} title={title}
      style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
        borderRadius:7, padding:'5px 8px', cursor:'pointer', color: color||'var(--text-muted)',
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
            <Users size={22}/> Gestão de Clientes
          </h1>
          <p className="page-sub">Base de dados sincronizada com o Supabase Cloud</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
          <button className="btn btn-secondary" onClick={downloadModelo}><Download size={15}/> Modelo</button>
          <label className="btn btn-secondary" style={{ cursor:'pointer' }}>
            <Upload size={15}/> Importar
            <input type="file" accept=".csv" style={{ display:'none' }} onChange={importCSV}/>
          </label>
          <button className="btn btn-secondary" onClick={zerarClientes} style={{ color:'#f87171' }}>
            <Trash2 size={15}/> Zerar
          </button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Novo Cliente</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { icon:<Users size={22}/>, val: totalAtivos, label:'Total de Clientes', sub:'cadastrados', color:'#6366f1' },
          { icon:<Gift size={22}/>, val: aniversSemana, label:'Aniversariantes', sub:'próximos 7 dias', color:'#ec4899' },
          { icon:<DollarSign size={22}/>, val:'R$ 0,00', label:'Crédito em Aberto', sub:'em crediário ativo', color:'#f59e0b' },
          { icon:<Wifi size={22}/>, val:'Ativo', label:'Status do Cloud', sub:'Supabase conectado', color:'#22c55e' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize: typeof s.val==='number'?28:20, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{s.label}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Pesquisar por nome, CPF ou telefone..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <input className="form-input" style={{ width:160 }} placeholder="Filtrar cidade..." value={cityFilter} onChange={e => setCityFilter(e.target.value)}/>
        <input className="form-input" type="date" style={{ width:150 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
        <input className="form-input" type="date" style={{ width:150 }} value={dateTo} onChange={e => setDateTo(e.target.value)}/>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <button className={'btn '+(showBirthMonth?'btn-primary':'btn-secondary')} style={{ fontSize:12, padding:'6px 14px' }} onClick={() => setShowBirthMonth(v=>!v)}>
          <Gift size={13}/> Aniversariantes do mês ({aniversMes})
        </button>
        <button className={'btn '+(showInactive?'btn-primary':'btn-secondary')} style={{ fontSize:12, padding:'6px 14px' }} onClick={() => setShowInactive(v=>!v)}>
          Incluir inativos
        </button>
      </div>

      {/* Tabela */}
      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Users size={40}/></div>
          <h3>Nenhum cliente cadastrado ainda.</h3>
          <button className="btn btn-primary" onClick={openNew}><Plus size={15}/> Cadastrar primeiro cliente</button>
        </div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Cliente</th><th>Contato</th><th>CPF</th><th>Cidade</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                          display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                          {c.name.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight:500 }}>{c.name}</div>
                          {c.email && <div style={{ fontSize:12, color:'var(--text-muted)' }}>{c.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize:13 }}>
                      {c.phone ? <span style={{ display:'flex', alignItems:'center', gap:4 }}><Phone size={13}/>{c.phone}</span> : '—'}
                    </td>
                    <td style={{ fontSize:13, color:'var(--text-muted)' }}>{c.cpf||'—'}</td>
                    <td style={{ fontSize:13 }}>{c.city ? c.city+'/'+c.state : '—'}</td>
                    <td>
                      <span style={{ padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600,
                        background: c.active?'rgba(34,197,94,.15)':'rgba(248,113,113,.15)',
                        color: c.active?'#22c55e':'#f87171' }}>
                        {c.active?'Ativo':'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:5 }}>
                        <IconBtn onClick={() => openView(c)} title="Ver detalhes" color="#94a3b8"><Eye size={14}/></IconBtn>
                        <IconBtn onClick={() => openEdit(c)} title="Editar" color="#6366f1"><Edit2 size={14}/></IconBtn>
                        <IconBtn onClick={() => openWhatsApp(c)} title="WhatsApp" color="#22c55e"><MessageCircle size={14}/></IconBtn>
                        <IconBtn onClick={() => openView(c)} title="Histórico" color="#f59e0b"><Clock size={14}/></IconBtn>
                        <IconBtn onClick={() => toggleActive(c)} title={c.active?'Inativar':'Reativar'} color="#f87171"><Trash2 size={14}/></IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
            {filtered.length} cliente(s) exibido(s)
          </div>
        </div>
       )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth:620, width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {viewing ? 'Detalhes — '+viewing.name : editing ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18}/></button>
            </div>

            {viewing ? (
              <div className="modal-body">
                <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
                  <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, color:'#fff' }}>
                    {viewing.name.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize:18, fontWeight:700 }}>{viewing.name}</div>
                    <div style={{ fontSize:13, color:'var(--text-muted)' }}>{viewing.email||'Sem e-mail'}</div>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    ['CPF', viewing.cpf],
                    ['Telefone', viewing.phone],
                    ['WhatsApp', viewing.whatsapp],
                    ['Nascimento', viewing.birth_date ? new Date(viewing.birth_date+'T00:00:00').toLocaleDateString('pt-BR') : null],
                    ['Endereço', viewing.address],
                    ['Cidade/Estado', viewing.city ? viewing.city+'/'+viewing.state : null],
                    ['Observações', viewing.notes],
                  ].map(([label, val]) => val ? (
                    <div key={label as string} style={{ padding:'10px 14px', background:'var(--bg-card)', borderRadius:8 }}>
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>{label}</div>
                      <div style={{ fontSize:14, fontWeight:500 }}>{val}</div>
                    </div>
                  ) : null)}
                </div>
                <div className="modal-footer" style={{ marginTop:16 }}>
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Fechar</button>
                  <button className="btn btn-secondary" onClick={() => openWhatsApp(viewing)} style={{ color:'#22c55e' }}>
                    <MessageCircle size={15}/> WhatsApp
                  </button>
                  <button className="btn btn-primary" onClick={() => openEdit(viewing)}><Edit2 size={15}/> Editar</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label className="form-label">Nome completo *</label>
                      <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} required/>
                    </div>
                    <div><label className="form-label">CPF</label><input className="form-input" value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00"/></div>
                    <div><label className="form-label">Data de nascimento</label><input className="form-input" type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)}/></div>
                    <div><label className="form-label">Telefone</label><input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(92) 99999-0000"/></div>
                    <div><label className="form-label">WhatsApp</label><input className="form-input" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="(92) 99999-0000"/></div>
                    <div style={{ gridColumn:'1/-1' }}><label className="form-label">E-mail</label><input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)}/></div>
                    <div style={{ gridColumn:'1/-1' }}><label className="form-label">Endereço</label><input className="form-input" value={form.address} onChange={e => set('address', e.target.value)}/></div>
                    <div><label className="form-label">Cidade</label><input className="form-input" value={form.city} onChange={e => set('city', e.target.value)}/></div>
                    <div><label className="form-label">Estado</label>
                      <select className="form-input" value={form.state} onChange={e => set('state', e.target.value)}>
                        <option value="">Selecione...</option>
                        {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn:'1/-1' }}><label className="form-label">Observações</label><textarea className="form-input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}/></div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input type="checkbox" id="active" checked={form.active} onChange={e => set('active', e.target.checked)}/>
                      <label htmlFor="active" style={{ fontSize:14 }}>Cliente ativo</label>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}><Save size={15}/> {saving?'Salvando...':'Salvar'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

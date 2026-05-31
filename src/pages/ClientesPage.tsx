import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Edit2, Phone, Download, Upload, Camera,
  Trash2, Users, Gift, DollarSign, Wifi, X, Save,
  Eye, MessageCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import type { Customer } from '../types/index';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function emptyForm() {
  return { name:'', cpf:'', phone:'', whatsapp:'', email:'', birth_date:'', address:'', city:'', state:'', notes:'', active:true, photo_url:'' };
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

  const [rankings, setRankings] = useState<Record<string, string|null>>({});

  // Calcular ranking de cada cliente baseado no historico de parcelas
  const calcRankings = async (ids: string[], tid: string) => {
    if (!ids.length) return;
    // Buscar crediarios dos clientes
    const { data: creds } = await supabase
      .from('crediario')
      .select('id, customer_id')
      .eq('tenant_id', tid)
      .in('customer_id', ids);
    if (!creds || !creds.length) return;
    const credMap: Record<string, string> = {};
    creds.forEach((c: any) => { credMap[c.id] = c.customer_id; });
    const credIds = creds.map((c: any) => c.id);
    // Buscar parcelas desses crediarios
    const { data } = await supabase
      .from('crediario_parcelas')
      .select('crediario_id, due_date, status, paid_at')
      .in('crediario_id', credIds);
    if (!data) return;
    const map: Record<string, string[]> = {};
    data.forEach((p: any) => {
      const cid = credMap[p.crediario_id];
      if (!cid) return;
      if (!map[cid]) map[cid] = [];
      map[cid].push(JSON.stringify({ due_date: p.due_date, status: p.status, paid_at: p.paid_at }));
    });
    const nr: Record<string, string|null> = {};
    ids.forEach(id => {
      const parcelas = (map[id] || []).map((s: string) => JSON.parse(s));
      const pagas = parcelas.filter((p: any) => p.status === 'paga' || p.status === 'pago');
      const vencidas = parcelas.filter((p: any) => p.status === 'vencida' || p.status === 'vencido');
      const comAtraso = pagas.filter((p: any) => {
        if (!p.due_date || !p.paid_at) return false;
        return new Date(p.paid_at) > new Date(p.due_date);
      }).length;
      if (vencidas.length > 0) nr[id] = 'bronze';
      else if (comAtraso > 0) nr[id] = 'prata';
      else if (pagas.length > 0) nr[id] = 'ouro';
      else nr[id] = null;
    });
    setRankings(nr);
  };

  const rankBadge = (tier: string|null) => {
    if (!tier) return null;
    const styles: Record<string, {bg: string, color: string, label: string}> = {
      ouro:   { bg: 'rgba(234,179,8,.2)',  color: '#eab308', label: '★ Ouro' },
      prata:  { bg: 'rgba(148,163,184,.2)', color: '#94a3b8', label: '● Prata' },
      bronze: { bg: 'rgba(180,83,9,.2)',   color: '#b45309', label: '◆ Bronze' },
    };
    const s = styles[tier];
    return (
      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10,
        background: s.bg, color: s.color, marginLeft:6 }}>
        {s.label}
      </span>
    );
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').eq('tenant_id', tenantId).order('name');
    const list = (data as Customer[]) || [];
    setCustomers(list);
    setLoading(false);
    if (list.length && tenantId) calcRankings(list.map(c => c.id), tenantId);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const totalAtivos = customers.filter(c => c.active).length;
  const aniversariantes = customers.filter(c => {
    if (!c.birth_date) return false;
    const hoje = new Date();
    const nasc = new Date(c.birth_date + 'T00:00:00');
    const diff = Math.ceil((new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate()).getTime() - hoje.getTime()) / (1000*60*60*24));
    return diff >= 0 && diff <= 7;
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
              city:c.city||'', state:c.state||'', notes:c.notes||'', active:c.active,
              photo_url:(c as any).photo_url||'' });
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
    } catch (err: any) { toast.error(err.message||'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (c: Customer) => {
    await supabase.from('customers').update({ active: !c.active }).eq('id', c.id);
    toast.success(c.active ? 'Cliente inativado' : 'Cliente reativado'); load();
  };

  const openWhatsApp = (c: Customer) => {
    const num = (c.whatsapp||c.phone||'').replace(/\D/g,'');
    if (!num) { toast.error('Sem número cadastrado'); return; }
    window.open('https://wa.me/55'+num, '_blank');
  };

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const dados = [
      ['Nome','CPF','Telefone','WhatsApp','Email','Nascimento','Endereço','Cidade','Estado'],
      ...filtered.map(c => [c.name,c.cpf||'',c.phone||'',c.whatsapp||'',c.email||'',c.birth_date||'',c.address||'',c.city||'',c.state||''])
    ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, 'clientes.xlsx');
    toast.success('Exportado!');
  };

  const downloadModelo = () => {
    const wb = XLSX.utils.book_new();
    const dados = [
      ['Nome','CPF','Telefone','WhatsApp','Email','Nascimento','Endereço','Cidade','Estado'],
      ['Maria da Silva','000.000.000-00','(92) 99999-0000','(92) 99999-0000','maria@email.com','1990-01-15','Rua A, 123','Manaus','AM'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, 'modelo_clientes.xlsx');
    toast.success('Modelo baixado!');
  };

  const importXLSX = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      let ok = 0, fail = 0;
      for (const row of rows.slice(1)) {
        if (!row[0]) continue;
        const { error } = await supabase.from('customers').insert([{
          tenant_id: tenantId, name: row[0], cpf: row[1]||null, phone: row[2]||null,
          whatsapp: row[3]||null, email: row[4]||null, birth_date: row[5]||null,
          address: row[6]||null, city: row[7]||null, state: row[8]||null, active: true
        }]);
        error ? fail++ : ok++;
      }
      toast.success('Importados: '+ok+' | Erros: '+fail); load();
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const zerarClientes = async () => {
    if (!confirm('Zerar TODOS os clientes?')) return;
    await supabase.from('customers').delete().eq('tenant_id', tenantId);
    toast.success('Clientes zerados!'); load();
  };

  const set = (k: string, v: any) => setForm(p => ({...p,[k]:v}));

  const IconBtn = ({ onClick, title, color, children }: any) => (
    <button onClick={onClick} title={title}
      style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
        borderRadius:7, padding:'5px 8px', cursor:'pointer', color: color||'var(--text-muted)',
        display:'flex', alignItems:'center' }}>
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
          <button className="btn btn-secondary" onClick={exportXLSX}><Download size={15}/> Exportar</button>
          <button className="btn btn-secondary" onClick={downloadModelo}><Download size={15}/> Modelo</button>
          <label className="btn btn-secondary" style={{ cursor:'pointer' }}>
            <Upload size={15}/> Importar
            <input type="file" accept=".xlsx,.csv" style={{ display:'none' }} onChange={importXLSX}/>
          </label>
          <button className="btn btn-secondary" onClick={zerarClientes} style={{ color:'#f87171' }}>
            <Trash2 size={15}/> Zerar
          </button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Novo Cliente</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        {[
          { icon:<Users size={20}/>,      val: totalAtivos,     label:'Total de Clientes',     color:'#6366f1' },
          { icon:<Gift size={20}/>,       val: aniversariantes, label:'Aniversariantes 7 dias', color:'#f59e0b' },
          { icon:<DollarSign size={20}/>, val: 'R$ 0,00',       label:'Crédito em Aberto',      color:'#22c55e' },
          { icon:<Wifi size={20}/>,       val: 'Ativo',         label:'Status do Cloud',        color:'#06b6d4' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:18, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:typeof s.val==='number'?24:16, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Pesquisar por nome, CPF ou telefone..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <input className="form-input" style={{ width:140 }} placeholder="Filtrar cidade..." value={cityFilter} onChange={e=>setCityFilter(e.target.value)}/>
        <input className="form-input" type="date" style={{ width:145 }} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
        <input className="form-input" type="date" style={{ width:145 }} value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
        <button className="btn btn-secondary" onClick={() => setShowBirthMonth(v=>!v)}
          style={{ background: showBirthMonth?'rgba(245,158,11,.15)':'', color: showBirthMonth?'#f59e0b':'' }}>
          <Gift size={15}/> Aniversariantes do mês ({customers.filter(c=>c.birth_date&&new Date(c.birth_date+'T00:00:00').getMonth()===new Date().getMonth()).length})
        </button>
        <button className="btn btn-secondary" onClick={() => setShowInactive(v=>!v)}
          style={{ background: showInactive?'rgba(99,102,241,.15)':'', color: showInactive?'#6366f1':'' }}>
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
                  <tr key={c.id} onClick={() => openView(c)} style={{ cursor:'pointer' }}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        {(c as any).photo_url ? (
                          <img src={(c as any).photo_url} alt="foto" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                        ) : (
                          <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {c.name.slice(0,2).toUpperCase()}
                          </div>
                        )}
                        <span style={{ fontWeight:500 }}>{c.name}</span>
                        {rankBadge(rankings[c.id] || null)}
                      </div>
                    </td>
                    <td style={{ fontSize:13 }}>
                      {c.phone && <div style={{ display:'flex', alignItems:'center', gap:4 }}><Phone size={12}/> {c.phone}</div>}
                    </td>
                    <td style={{ fontSize:13, color:'var(--text-muted)' }}>{c.cpf||'—'}</td>
                    <td style={{ fontSize:13, color:'var(--text-muted)' }}>{c.city ? c.city+(c.state?'/'+c.state:'') : '—'}</td>
                    <td>
                      <span style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20,
                        background: c.active?'rgba(34,197,94,.15)':'rgba(248,113,113,.15)',
                        color: c.active?'#22c55e':'#f87171' }}>
                        {c.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:5 }}>
                        <IconBtn onClick={() => openView(c)} title="Ver detalhes" color="#6366f1"><Eye size={14}/></IconBtn>
                        <IconBtn onClick={() => openEdit(c)} title="Editar" color="#06b6d4"><Edit2 size={14}/></IconBtn>
                        <IconBtn onClick={() => openWhatsApp(c)} title="WhatsApp" color="#22c55e"><MessageCircle size={14}/></IconBtn>
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
          <div className="modal" style={{ maxWidth:860, width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {viewing ? 'Detalhes — '+viewing.name : editing ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18}/></button>
            </div>

            {viewing ? (
              <div className="modal-body" style={{ display:'flex', gap:24, alignItems:'flex-start' }}>
                {/* Dados lado esquerdo */}
                <div style={{ flex:1 }}>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:20, fontWeight:700 }}>{viewing.name}</div>
                    <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>{viewing.email||'Sem e-mail'}</div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                    {[
                      ['CPF', viewing.cpf],
                      ['Telefone', viewing.phone],
                      ['WhatsApp', viewing.whatsapp],
                      ['Nascimento', viewing.birth_date ? new Date(viewing.birth_date+'T00:00:00').toLocaleDateString('pt-BR') : null],
                      ['Endereço', viewing.address],
                      ['Cidade/Estado', viewing.city ? viewing.city+(viewing.state?'/'+viewing.state:'') : null],
                      ['Observações', viewing.notes],
                    ].map(([label, val]) => val ? (
                      <div key={label as string} style={{ padding:'10px 14px', background:'var(--bg-card)', borderRadius:8 }}>
                        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>{label}</div>
                        <div style={{ fontSize:14, fontWeight:500 }}>{val}</div>
                      </div>
                    ) : null)}
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Fechar</button>
                    <button className="btn btn-secondary" onClick={() => openWhatsApp(viewing)} style={{ color:'#22c55e' }}>
                      <MessageCircle size={15}/> WhatsApp
                    </button>
                    <button className="btn btn-primary" onClick={() => openEdit(viewing)}><Edit2 size={15}/> Editar</button>
                  </div>
                </div>
                {/* Foto grande lado direito */}
                <div style={{ flexShrink:0, display:'flex', flexDirection:'column', gap:10, alignItems:'center' }}>
                  {(viewing as any).photo_url ? (
                    <img src={(viewing as any).photo_url} alt="foto"
                      style={{ width:220, height:280, borderRadius:12, objectFit:'cover',
                        border:'3px solid #6366f1', boxShadow:'0 4px 24px rgba(99,102,241,.3)' }}/>
                  ) : (
                    <div style={{ width:220, height:280, borderRadius:12,
                      background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:64, fontWeight:700, color:'#fff',
                      boxShadow:'0 4px 24px rgba(99,102,241,.3)' }}>
                      {viewing.name.slice(0,2).toUpperCase()}
                    </div>
                  )}
                  <div style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>Foto do cliente</div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  {/* Foto no form */}
                  <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
                    <div style={{ width:72, height:72, borderRadius:'50%', overflow:'hidden', flexShrink:0,
                      background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {form.photo_url ? (
                        <img src={form.photo_url} alt="foto" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                      ) : (
                        <span style={{ fontSize:22, fontWeight:700, color:'#fff' }}>
                          {form.name ? form.name.slice(0,2).toUpperCase() : '?'}
                        </span>
                      )}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <label style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, background:'rgba(99,102,241,.15)', color:'#6366f1', fontSize:13, fontWeight:600, cursor:'pointer', border:'1px solid rgba(99,102,241,.3)' }}>
                        <Camera size={15}/> Câmera
                        <input type="file" accept="image/*" capture="user" style={{ display:'none' }} onChange={e => { const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>set('photo_url',ev.target?.result as string); r.readAsDataURL(f); }}/>
                      </label>
                      <label style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, background:'rgba(255,255,255,.06)', color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:'pointer', border:'1px solid rgba(255,255,255,.1)' }}>
                        <Upload size={15}/> Importar
                        <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>set('photo_url',ev.target?.result as string); r.readAsDataURL(f); }}/>
                      </label>
                      {form.photo_url && <button type="button" onClick={() => set('photo_url','')} style={{ padding:'7px 10px', borderRadius:8, background:'rgba(248,113,113,.1)', color:'#f87171', border:'1px solid rgba(248,113,113,.3)', cursor:'pointer' }}><X size={14}/></button>}
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    <div style={{ gridColumn:'1/-1' }}>
                      <label className="form-label">Nome completo *</label>
                      <input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} required/>
                    </div>
                    <div><label className="form-label">CPF</label><input className="form-input" value={form.cpf} onChange={e=>set('cpf',e.target.value)} placeholder="000.000.000-00"/></div>
                    <div><label className="form-label">Data de nascimento</label><input className="form-input" type="date" value={form.birth_date} onChange={e=>set('birth_date',e.target.value)}/></div>
                    <div><label className="form-label">Telefone</label><input className="form-input" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="(92) 99999-0000"/></div>
                    <div><label className="form-label">WhatsApp</label><input className="form-input" value={form.whatsapp} onChange={e=>set('whatsapp',e.target.value)} placeholder="(92) 99999-0000"/></div>
                    <div style={{ gridColumn:'1/-1' }}><label className="form-label">E-mail</label><input className="form-input" type="email" value={form.email} onChange={e=>set('email',e.target.value)}/></div>
                    <div style={{ gridColumn:'1/-1' }}><label className="form-label">Endereço</label><input className="form-input" value={form.address} onChange={e=>set('address',e.target.value)}/></div>
                    <div><label className="form-label">Cidade</label><input className="form-input" value={form.city} onChange={e=>set('city',e.target.value)}/></div>
                    <div><label className="form-label">Estado</label>
                      <select className="form-input" value={form.state} onChange={e=>set('state',e.target.value)}>
                        <option value="">Selecione...</option>
                        {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn:'1/-1' }}><label className="form-label">Observações</label><textarea className="form-input" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></div>
                    <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:8 }}>
                      <input type="checkbox" id="active" checked={form.active} onChange={e=>set('active',e.target.checked)}/>
                      <label htmlFor="active" style={{ fontSize:14 }}>Cliente ativo</label>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    <Save size={15}/> {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

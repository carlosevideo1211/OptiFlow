import { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Edit2, Phone, Download, Upload, Camera,
  Trash2, Users, Gift, DollarSign, Wifi, X, Save,
  Eye, MessageCircle, Paperclip
} from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { formatCPF, maskCPF } from '../utils/format';
import type { Customer } from '../types/index';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function emptyForm() {
  return { name:'', cpf:'', phone:'', whatsapp:'', email:'', birth_date:'', address:'', city:'', state:'', notes:'', active:true, photo_url:'' };
}

function fmtGrau(v: any): string {
  if (v === null || v === undefined || v === '') return '--';
  const n = parseFloat(v);
  if (isNaN(n)) return '--';
  const s = n >= 0 ? '+' : '';
  return s + n.toFixed(2).replace('.', ',');
}

export default function ClientesPage() {
  const { tenantId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 50;
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
  const [viewTab, setViewTab] = useState('dados');
  const [viewHist, setViewHist] = useState<any>({v:[],o:[],c:[],cr:[]});

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
    let all: Customer[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase.from('customers').select('*').eq('tenant_id', tenantId).order('name').range(from, from + pageSize - 1);
      const chunk = (data as Customer[]) || [];
      all = all.concat(chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
    setCustomers(all);
    setLoading(false);
    if (all.length && tenantId) calcRankings(all.map(c => c.id), tenantId);
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
      list = list.filter(c => c.name.toLowerCase().includes(s) || c.cpf?.includes(s) || c.cpf?.replace(/[^0-9]/g,'').includes(s.replace(/[^0-9]/g,'')) || c.phone?.includes(s));
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
  const openView = (c: Customer) => {
    setEditing(null);
    setViewing(c);
    setViewTab('dados');
    setViewHist({v:[],o:[],c:[],cr:[]});
    if (tenantId) Promise.all([
      supabase.from('sales').select('sale_number,total,subtotal,discount,payment_method,installments,created_at,status,entrada,sale_items(description,quantity,unit_price,total)').eq('tenant_id',tenantId).eq('customer_id',c.id).order('created_at',{ascending:false}).limit(15),
      supabase.from('service_orders').select('os_number,status,total,discount,created_at,delivery_date,frame_brand,frame_model,lens_type,lens_brand,od_esf,od_cil,od_eixo,od_adicao,od_dnp,oe_esf,oe_cil,oe_eixo,oe_adicao,oe_dnp,entrada,notes,sales(id,sale_items(description,quantity,unit_price,total))').eq('tenant_id',tenantId).eq('customer_id',c.id).order('created_at',{ascending:false}).limit(15),
      supabase.from('consultations').select('id,date,professional_name,notes,rx_re_esf,rx_re_cil,rx_re_eixo,rx_re_dnp,rx_le_esf,rx_le_cil,rx_le_eixo,rx_le_dnp,rx_adicao').eq('tenant_id',tenantId).eq('customer_id',c.id).order('date',{ascending:false}).limit(15),
      supabase.from('crediario').select('total_amount,installments,status,created_at,crediario_parcelas(installment_number,due_date,amount,paid_amount,status)').eq('tenant_id',tenantId).eq('customer_id',c.id).order('created_at',{ascending:false}).limit(15),
    ]).then(([v,o,co,cr])=>setViewHist({v:v.data||[],o:o.data||[],c:co.data||[],cr:cr.data||[]}));
    setShowModal(true);
  };

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

  const [anexoCliente,setAnexoCliente]=useState<any>(null);
  const [anexos,setAnexos]=useState<any[]>([]);
  const [uploadingAnexo,setUploadingAnexo]=useState(false);
  const openAnexos=async(cli:any)=>{setAnexoCliente(cli);document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';const al=document.querySelector('.app-layout') as HTMLElement;if(al){al.style.overflow='visible';al.classList.add('modal-open');}document.documentElement.style.overflow='hidden';const{data}=await supabase.from('customer_attachments').select('*').eq('customer_id',cli.id).order('created_at',{ascending:false});setAnexos(data||[]);};
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
                {filtered.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA).map(c => (
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
                        <IconBtn onClick={() => openAnexos(c)} title="Receitas" color="#f59e0b"><Paperclip size={14}/></IconBtn>
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
            {filtered.length} cliente(s) no total — Pag. {pagina}/{Math.ceil(filtered.length/POR_PAGINA)}
            <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
              <button onClick={() => setPagina(p => Math.max(1,p-1))} disabled={pagina===1}
                style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:pagina===1?'transparent':'var(--primary)', color:pagina===1?'var(--text-muted)':'#fff', cursor:pagina===1?'not-allowed':'pointer', fontSize:12 }}>← Ant</button>
              {Array.from({length:Math.ceil(filtered.length/POR_PAGINA)},(_,i)=>i+1).filter(n=>Math.abs(n-pagina)<=2).map(n=>(
                <button key={n} onClick={()=>setPagina(n)}
                  style={{ padding:'3px 8px', borderRadius:6, border:'1px solid var(--border)', background:n===pagina?'var(--primary)':'transparent', color:n===pagina?'#fff':'var(--text-muted)', cursor:'pointer', fontWeight:n===pagina?700:400, fontSize:12 }}>{n}</button>
              ))}
              <button onClick={() => setPagina(p => Math.min(Math.ceil(filtered.length/POR_PAGINA),p+1))} disabled={pagina===Math.ceil(filtered.length/POR_PAGINA)}
                style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:pagina===Math.ceil(filtered.length/POR_PAGINA)?'transparent':'var(--primary)', color:pagina===Math.ceil(filtered.length/POR_PAGINA)?'var(--text-muted)':'#fff', cursor:pagina===Math.ceil(filtered.length/POR_PAGINA)?'not-allowed':'pointer', fontSize:12 }}>Prox →</button>
            </div>
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
              <div className="modal-body">
                <div style={{display:'flex',gap:0,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
                  {[['dados','👤 Dados'],['vendas','🛒 Vendas ('+viewHist.v.length+')'],['os','📋 OS ('+viewHist.o.length+')'],['consultas','👁️ Consultas ('+viewHist.c.length+')'],['crediario','💳 Crediário ('+viewHist.cr.length+')']].map(([k,l])=>(
                    <button key={k} onClick={()=>setViewTab(k as string)} style={{padding:'8px 12px',background:'none',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,color:viewTab===k?'var(--primary)':'var(--text-muted)',borderBottom:viewTab===k?'2px solid var(--primary)':'2px solid transparent',marginBottom:-1,whiteSpace:'nowrap'}}>{l}</button>
                  ))}
                </div>
                {viewTab==='dados' && <div style={{ display:'flex', gap:24, alignItems:'flex-start' }}>
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
              </div>}
              {viewTab==='vendas' && <div style={{overflowX:'auto'}}>
                {viewHist.v.length===0?<p style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>Nenhuma venda encontrada</p>:<div>{viewHist.v.map((v:any,i:number)=>(
                  <div key={i} style={{marginBottom:16,padding:14,background:'var(--bg3)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <div style={{fontWeight:700,fontSize:14}}>Venda #{String(v.sale_number||'').padStart(4,'0')}</div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <span style={{fontSize:12,color:'var(--text-muted)'}}>{v.created_at?new Date(v.created_at).toLocaleDateString('pt-BR'):'--'}</span>
                        <span style={{padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'rgba(34,197,94,.15)',color:'#22c55e'}}>{v.payment_method||'--'}{v.installments>1?' ('+v.installments+'x)':''}</span>
                      </div>
                    </div>
                    {v.sale_items && v.sale_items.length > 0 && (
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:8}}>
                        <thead><tr style={{borderBottom:'1px solid var(--border)'}}><th style={{padding:'3px 6px',textAlign:'left',color:'var(--text-muted)'}}>Produto</th><th style={{padding:'3px 6px',textAlign:'center',color:'var(--text-muted)'}}>Qtde</th><th style={{padding:'3px 6px',textAlign:'right',color:'var(--text-muted)'}}>Unit.</th><th style={{padding:'3px 6px',textAlign:'right',color:'var(--text-muted)'}}>Total</th></tr></thead>
                        <tbody>{v.sale_items.map((it:any,j:number)=>(
                          <tr key={j} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}><td style={{padding:'3px 6px'}}>{it.description}</td><td style={{padding:'3px 6px',textAlign:'center'}}>{it.quantity}</td><td style={{padding:'3px 6px',textAlign:'right'}}>{Number(it.unit_price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td style={{padding:'3px 6px',textAlign:'right',fontWeight:700,color:'#22c55e'}}>{Number(it.total||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td></tr>
                        ))}</tbody>
                      </table>
                    )}
                    <div style={{display:'flex',flexDirection:'column',fontSize:12,borderTop:'1px solid var(--border)',paddingTop:6}}>
                      {v.discount>0 && <div style={{display:'flex',justifyContent:'space-between',color:'#f87171',fontSize:12}}><span>Desconto:</span><span>-{Number(v.discount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>}
                      {v.entrada>0 && <div style={{display:'flex',justifyContent:'space-between',color:'var(--text-muted)',fontSize:12}}><span>Entrada:</span><span>-{Number(v.entrada).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>}
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:13,marginTop:4,borderTop:'1px solid var(--border)',paddingTop:4}}><span>Total:</span><span style={{color:'#22c55e'}}>{Number(v.total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>
                      
                    </div>
                  </div>
                ))}</div>}
              </div>}
              {viewTab==='os' && <div style={{overflowX:'auto'}}>
                {viewHist.o.length===0?<p style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>Nenhuma OS encontrada</p>:<div>{viewHist.o.map((o:any,i:number)=>(
                  <div key={i} style={{marginBottom:16,padding:14,background:'var(--bg3)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <div style={{fontWeight:700,fontSize:14}}>OS #{String(o.os_number||'').padStart(4,'0')}</div>
                      <span style={{padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:o.status==='entregue'?'rgba(34,197,94,.15)':o.status==='pronta'?'rgba(99,102,241,.15)':'rgba(251,191,36,.15)',color:o.status==='entregue'?'#22c55e':o.status==='pronta'?'#6366f1':'#fbbf24'}}>{o.status||'--'}</span>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10,fontSize:12}}>
                      {o.frame_brand && <div><span style={{color:'var(--text-muted)'}}>Armação: </span><b>{o.frame_brand}{o.frame_model?' — '+o.frame_model:''}</b></div>}
                      {o.lens_type && <div><span style={{color:'var(--text-muted)'}}>Lente: </span><b>{o.lens_type}{o.lens_brand?' — '+o.lens_brand:''}</b></div>}
                      {o.delivery_date && <div><span style={{color:'var(--text-muted)'}}>Entrega: </span><b>{new Date(o.delivery_date+'T00:00:00').toLocaleDateString('pt-BR')}</b></div>}
                      
                    </div>
                    
                    {o.notes && <div style={{marginTop:6,fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>{o.notes}</div>}
                    {o.sales && o.sales.length > 0 && o.sales[0].sale_items && o.sales[0].sale_items.length > 0 && (
                      <div style={{marginTop:8}}>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4,fontWeight:600}}>PRODUTOS/SERVIÇOS</div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                          <thead><tr style={{borderBottom:'1px solid var(--border)'}}><th style={{padding:'3px 6px',textAlign:'left',color:'var(--text-muted)'}}>Produto</th><th style={{padding:'3px 6px',textAlign:'center',color:'var(--text-muted)'}}>Qtde</th><th style={{padding:'3px 6px',textAlign:'right',color:'var(--text-muted)'}}>Unit.</th><th style={{padding:'3px 6px',textAlign:'right',color:'var(--text-muted)'}}>Total</th></tr></thead>
                          <tbody>{o.sales[0].sale_items.map((it:any,j:number)=>(
                            <tr key={j} style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}><td style={{padding:'3px 6px'}}>{it.description}</td><td style={{padding:'3px 6px',textAlign:'center'}}>{it.quantity}</td><td style={{padding:'3px 6px',textAlign:'right'}}>{Number(it.unit_price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td style={{padding:'3px 6px',textAlign:'right',fontWeight:700,color:'#22c55e'}}>{Number(it.total||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td></tr>
                          ))}</tbody>
                        </table>
                        <div style={{display:'flex',flexDirection:'column',fontSize:12,borderTop:'1px solid var(--border)',paddingTop:6,marginTop:6}}>

{o.discount>0 && <div style={{display:'flex',justifyContent:'space-between',color:'#f87171',fontSize:12}}><span>Desconto:</span><span>-{Number(o.discount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>}
{o.entrada>0 && <div style={{display:'flex',justifyContent:'space-between',color:'var(--text-muted)',fontSize:12}}><span>Entrada:</span><span>-{Number(o.entrada).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>}
<div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:13,marginTop:4,borderTop:'1px solid var(--border)',paddingTop:4}}><span>Total:</span><span style={{color:'#22c55e'}}>{Number(o.total||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>
</div>
                      </div>
                    )}
                  </div>
                ))}</div>}
              </div>}
              {viewTab==='consultas' && <div style={{overflowX:'auto'}}>
                {viewHist.c.length===0?<p style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>Nenhuma consulta encontrada</p>:<div>{viewHist.c.map((co:any,i:number)=>(
                  <div key={i} style={{marginBottom:16,padding:14,background:'var(--bg3)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <div style={{fontWeight:700,fontSize:14}}>{co.date?new Date(co.date+'T00:00:00').toLocaleDateString('pt-BR'):'--'}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)'}}>{co.professional_name||'--'}</div>
                    </div>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead><tr style={{background:'rgba(99,102,241,0.1)'}}>
                        <th style={{padding:'4px 8px',textAlign:'center',color:'var(--text-muted)',fontWeight:600}}></th>
                        <th style={{padding:'4px 8px',textAlign:'center',color:'var(--primary)',fontWeight:600}}>ESF</th>
                        <th style={{padding:'4px 8px',textAlign:'center',color:'var(--primary)',fontWeight:600}}>CIL</th>
                        <th style={{padding:'4px 8px',textAlign:'center',color:'var(--primary)',fontWeight:600}}>EIXO</th>
                        <th style={{padding:'4px 8px',textAlign:'center',color:'var(--primary)',fontWeight:600}}>DNP</th>
                      </tr></thead>
                      <tbody>
                        <tr style={{borderBottom:'1px solid var(--border)'}}>
                          <td style={{padding:'4px 8px',fontWeight:700,color:'#06b6d4'}}>OD</td>
                          <td style={{padding:'4px 8px',textAlign:'center'}}>{fmtGrau(co.rx_re_esf)}</td>
                          <td style={{padding:'4px 8px',textAlign:'center'}}>{fmtGrau(co.rx_re_cil)}</td>
                          <td style={{padding:'4px 8px',textAlign:'center'}}>{fmtGrau(co.rx_re_eixo)}</td>
                          <td style={{padding:'4px 8px',textAlign:'center'}}>{fmtGrau(co.rx_re_dnp)}</td>
                        </tr>
                        <tr style={{borderBottom:'1px solid var(--border)'}}>
                          <td style={{padding:'4px 8px',fontWeight:700,color:'#f87171'}}>OE</td>
                          <td style={{padding:'4px 8px',textAlign:'center'}}>{fmtGrau(co.rx_le_esf)}</td>
                          <td style={{padding:'4px 8px',textAlign:'center'}}>{fmtGrau(co.rx_le_cil)}</td>
                          <td style={{padding:'4px 8px',textAlign:'center'}}>{fmtGrau(co.rx_le_eixo)}</td>
                          <td style={{padding:'4px 8px',textAlign:'center'}}>{fmtGrau(co.rx_le_dnp)}</td>
                        </tr>
                      </tbody>
                    </table>
                    {co.rx_adicao && <div style={{marginTop:6,fontSize:12,color:'var(--text-muted)'}}>Adição: <span style={{fontWeight:700,color:'var(--primary)'}}>{fmtGrau(co.rx_adicao)}</span></div>}
                    {co.notes && <div style={{marginTop:6,fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>{co.notes}</div>}
                  </div>
                ))}</div>}
              </div>}
              {viewTab==='crediario' && <div>
                {viewHist.cr.length===0?<p style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>Nenhum crediário encontrado</p>:<div>{viewHist.cr.slice().sort((a:any,b:any)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime()).map((cr:any,i:number)=>{
            const parcelas = cr.crediario_parcelas || [];
            const isRenego = cr.notes?.startsWith('Renegociacao:');
            const abertas = parcelas.filter((p:any)=>p.status!=='pago');
            const totalAberto = abertas.reduce((s:number,p:any)=>s+(p.amount||0),0);
            const hoje = new Date();
            return <div key={i} style={{marginBottom:16,padding:14,background:isRenego?'rgba(99,102,241,.06)':'var(--bg3)',borderRadius:10,border:isRenego?'1px solid rgba(99,102,241,.3)':'1px solid var(--border)',borderLeft:isRenego?'4px solid #6366f1':'4px solid #888'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div>
                  {isRenego?<div style={{fontSize:11,fontWeight:700,color:'#6366f1',marginBottom:4}}>🔄 RENEGOCIAÇÃO</div>:<div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',marginBottom:4}}>📋 CARNÊ ORIGINAL</div>}
                  <div style={{fontWeight:700,fontSize:14}}>{cr.installments}x de {Number((cr.total_amount||0)/cr.installments).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
                  <div style={{fontSize:12,color:'var(--text-muted)'}}>{new Date(cr.created_at).toLocaleDateString('pt-BR')} — Total: {Number(cr.total_amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <span style={{padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:cr.status==='quitado'?'rgba(34,197,94,.15)':cr.status==='cancelado'?'rgba(107,114,128,.15)':'rgba(248,113,113,.15)',color:cr.status==='quitado'?'#22c55e':cr.status==='cancelado'?'#9ca3af':'#f87171'}}>{cr.status}</span>
                  {totalAberto>0&&<div style={{fontSize:12,color:'#f87171',marginTop:4,fontWeight:700}}>Em aberto: {Number(totalAberto).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>}
                </div>
              </div>
              {parcelas.length>0&&<table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{borderBottom:'1px solid var(--border)'}}><th style={{padding:'3px 6px',textAlign:'center',color:'var(--text-muted)'}}>Parc.</th><th style={{padding:'3px 6px',textAlign:'left',color:'var(--text-muted)'}}>Vencimento</th><th style={{padding:'3px 6px',textAlign:'right',color:'var(--text-muted)'}}>Valor</th><th style={{padding:'3px 6px',textAlign:'center',color:'var(--text-muted)'}}>Status</th></tr></thead>
                <tbody>{parcelas.sort((a:any,b:any)=>a.installment_number-b.installment_number).map((p:any,j:number)=>{
                  const venc=new Date(p.due_date+'T00:00:00');
                  const atrasada=p.status!=='pago'&&venc<hoje;
                  return <tr key={j} style={{borderBottom:'1px solid rgba(255,255,255,0.05)',background:atrasada?'rgba(248,113,113,.05)':'transparent'}}><td style={{padding:'3px 6px',textAlign:'center',fontWeight:600}}>{p.installment_number}/{cr.installments}</td><td style={{padding:'3px 6px',color:atrasada?'#f87171':'var(--text-muted)'}}>{venc.toLocaleDateString('pt-BR')}{atrasada?' ⚠️':''}</td><td style={{padding:'3px 6px',textAlign:'right'}}>{Number(p.paid_amount||p.amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td style={{padding:'3px 6px',textAlign:'center'}}><span style={{padding:'1px 8px',borderRadius:20,fontSize:10,fontWeight:700,background:p.status==='pago'?'rgba(34,197,94,.15)':atrasada?'rgba(248,113,113,.15)':'rgba(251,191,36,.15)',color:p.status==='pago'?'#22c55e':atrasada?'#f87171':'#fbbf24'}}>{p.status==='pago'?'Pago':atrasada?'Atrasada':'Aberta'}</span></td></tr>;
                })}</tbody>
              </table>}
            </div>;
        })}</div>}
              </div>}
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
                    <div><label className="form-label">CPF</label><input className="form-input" value={form.cpf} onChange={e=>set('cpf',maskCPF(e.target.value))} placeholder="000.000.000-00"/></div>
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
    {anexoCliente && ReactDOM.createPortal(<div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.97)',zIndex:999999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => {setAnexoCliente(null);document.body.style.overflow='';document.documentElement.style.overflow='';const al=document.querySelector('.app-layout') as HTMLElement;if(al){al.style.overflow='hidden';al.classList.remove('modal-open');}}}><div style={{background:'var(--bg-card)',borderRadius:16,padding:32,width:'100%',maxWidth:560,maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}} onClick={e => e.stopPropagation()}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24,paddingBottom:16,borderBottom:'1px solid var(--border)'}}><div style={{display:'flex',alignItems:'center',gap:12}}><div style={{background:'rgba(245,158,11,0.15)',borderRadius:10,padding:10}}><Paperclip size={22} color='#f59e0b'/></div><div><h3 style={{margin:0,fontSize:18}}>Receitas Médicas</h3><p style={{margin:0,fontSize:13,color:'var(--text-muted)',marginTop:2}}>{anexoCliente.name}</p></div></div><button onClick={() => setAnexoCliente(null)} style={{background:'var(--bg)',border:'1px solid var(--border)',cursor:'pointer',color:'var(--text-muted)',borderRadius:8,padding:'6px 10px'}}><X size={18}/></button></div><div style={{marginBottom:24}}><p style={{margin:'0 0 12px',fontSize:13,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Anexar nova receita</p><label style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:24,border:'2px dashed var(--border)',borderRadius:12,cursor:'pointer',background:'var(--bg)',transition:'all 0.2s'}}><Paperclip size={28} color='#f59e0b'/><span style={{fontSize:14,color:'var(--text-muted)'}}>Clique para selecionar PDF ou imagem</span><input type='file' accept='image/*,.pdf' disabled={uploadingAnexo} onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploadingAnexo(true); const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_'); const path = 'receitas/'+anexoCliente.id+'/'+Date.now()+'_'+safeName; const {error:upErr} = await supabase.storage.from('attachments').upload(path,file); console.log('upload result:', upErr); if (!upErr) { await supabase.from('customer_attachments').insert([{customer_id:anexoCliente.id,tenant_id:tenantId,file_name:file.name,file_path:path}]); const {data} = await supabase.from('customer_attachments').select('*').eq('customer_id',anexoCliente.id).order('created_at',{ascending:false}); setAnexos(data||[]); } setUploadingAnexo(false); }} style={{display:'none'}}/></label>{uploadingAnexo && <p style={{color:'var(--primary)',fontSize:13,marginTop:8,textAlign:'center'}}>Enviando arquivo...</p>}</div><div><p style={{margin:'0 0 12px',fontSize:13,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Receitas anexadas</p>{anexos.length===0 ? <div style={{textAlign:'center',padding:32,color:'var(--text-muted)',fontSize:14,background:'var(--bg)',borderRadius:12,border:'1px solid var(--border)'}}><Paperclip size={32} style={{marginBottom:8,opacity:0.3}}/><p style={{margin:0}}>Nenhuma receita anexada</p></div> : <div style={{display:'flex',flexDirection:'column',gap:8}}>{anexos.map((a:any) => (<div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',background:'var(--bg)',borderRadius:10,border:'1px solid var(--border)'}}><div style={{display:'flex',alignItems:'center',gap:10}}><Paperclip size={16} color='#f59e0b'/><span style={{fontSize:14}}>{a.file_name}</span></div><div style={{display:'flex',gap:8}}><button onClick={async () => { const {data}=await supabase.storage.from('attachments').createSignedUrl(a.file_path,60); if(data) window.open(data.signedUrl,'_blank'); }} style={{background:'var(--primary)',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>Ver</button><button onClick={async () => { await supabase.storage.from('attachments').remove([a.file_path]); await supabase.from('customer_attachments').delete().eq('id',a.id); setAnexos(prev=>prev.filter((x:any)=>x.id!==a.id)); }} style={{background:'rgba(248,113,113,0.15)',color:'#f87171',border:'1px solid #f87171',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>Excluir</button></div></div>))}</div>}</div></div></div>, document.getElementById('modal-root')||document.body)}
    </div>
  );
}

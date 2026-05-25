import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatBRL } from '../../types/index';
import {
  LogOut, RefreshCw, Search, Users, TrendingUp, Shield,
  AlertTriangle, DollarSign, X, Save, Edit2, CheckCircle,
  XCircle, Clock, Ban, Calendar, Plus, Download, Bell,
  Activity, BarChart2, ChevronUp, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';

type Plan = 'trial' | 'basico' | 'profissional' | 'clinica' | 'cancelado';

interface Tenant {
  id: string;
  company_name: string;
  email: string;
  phone?: string;
  plan: Plan;
  status: string;
  trial_end_date?: string;
  next_billing?: string;
  mrr_value?: number;
  city?: string;
  state?: string;
  created_at: string;
}

const PLANS: Plan[] = ['trial','basico','profissional','clinica','cancelado'];
const PLAN_LABELS: Record<Plan,string> = {
  trial:'Trial', basico:'Basico', profissional:'Profissional',
  clinica:'Clinica', cancelado:'Cancelado'
};
const PLAN_PRICES: Record<Plan,number> = {
  trial:0, basico:97, profissional:197, clinica:397, cancelado:0
};
const STATUS_LIST = [
  { value:'trial',        label:'Trial',        color:'#f59e0b', bg:'rgba(245,158,11,.15)' },
  { value:'ativo',        label:'Ativo',         color:'#22c55e', bg:'rgba(34,197,94,.15)'  },
  { value:'inadimplente', label:'Inadimplente',  color:'#f87171', bg:'rgba(248,113,113,.15)'},
  { value:'bloqueado',    label:'Bloqueado',     color:'#94a3b8', bg:'rgba(148,163,184,.15)'},
  { value:'cancelado',    label:'Cancelado',     color:'#475569', bg:'rgba(71,85,105,.15)'  },
];
function getStatus(v: string) { return STATUS_LIST.find(s=>s.value===v)||STATUS_LIST[0]; }

function fmtDate(d?: string) {
  if (!d) return '--';
  const dt = d.includes('T') ? new Date(d) : new Date(d+'T00:00:00');
  return isNaN(dt.getTime()) ? '--' : dt.toLocaleDateString('pt-BR');
}

function diasRestantes(d?: string): number | null {
  if (!d) return null;
  const diff = new Date(d+'T00:00:00').getTime() - new Date().setHours(0,0,0,0);
  return Math.ceil(diff / (1000*60*60*24));
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value/max)*100) : 0;
  return (
    <div style={{ height:4, background:'rgba(255,255,255,.1)', borderRadius:2, marginTop:4 }}>
      <div style={{ width:pct+'%', height:'100%', background:color, borderRadius:2, transition:'width .3s' }}/>
    </div>
  );
}

export default function AdminPanelPage() {
  const navigate = useNavigate();
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [planFilter, setPlanFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [updating, setUpdating] = useState<string|null>(null);
  const [editing, setEditing]   = useState<Tenant|null>(null);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('desc');
  const [showAlerts, setShowAlerts] = useState(false);
  const [form, setForm] = useState<Partial<Tenant>>({});
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => {
      if (!session) navigate('/admin-login');
      else load();
    });
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending:false });
    setTenants((data as Tenant[]) ?? []);
    setLoading(false);
  };

  const hoje = new Date().toISOString().split('T')[0];
  const mesAtual = new Date().toISOString().slice(0,7);

  // Stats
  const stats = useMemo(() => {
    const ativos    = tenants.filter(t=>t.status==='ativo');
    const trials    = tenants.filter(t=>t.status==='trial');
    const novosmes  = tenants.filter(t=>t.created_at?.startsWith(mesAtual));
    const expirando = trials.filter(t=>{ const d=diasRestantes(t.trial_end_date); return d!==null && d<=7 && d>=0; });
    const expirados = trials.filter(t=>{ const d=diasRestantes(t.trial_end_date); return d!==null && d<0; });
    const mrr       = ativos.reduce((s,t)=>s+(t.mrr_value||0),0);
    const mrrTotal  = tenants.reduce((s,t)=>s+(t.mrr_value||0),0);
    const conversao = tenants.length > 0 ? Math.round((ativos.length/tenants.length)*100) : 0;
    return { total:tenants.length, ativos:ativos.length, trial:trials.length,
      inadimp:tenants.filter(t=>t.status==='inadimplente').length,
      mrr, mrrTotal, novosmes:novosmes.length, expirando:expirando.length,
      expirados:expirados.length, conversao };
  }, [tenants]);

  // Grafico de crescimento por mes (ultimos 6 meses)
  const crescimento = useMemo(() => {
    const meses: {label:string; total:number}[] = [];
    for (let i=5; i>=0; i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i);
      const key = d.toISOString().slice(0,7);
      const label = d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
      const total = tenants.filter(t=>t.created_at?.startsWith(key)).length;
      meses.push({label, total});
    }
    return meses;
  }, [tenants]);

  const maxCres = Math.max(...crescimento.map(m=>m.total), 1);

  const filtered = useMemo(() => {
    let list = tenants;
    if (planFilter)    list = list.filter(t=>t.plan===planFilter);
    if (statusFilter)  list = list.filter(t=>t.status===statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(t => t.company_name?.toLowerCase().includes(s) || t.email?.toLowerCase().includes(s) || t.city?.toLowerCase().includes(s));
    }
    list = [...list].sort((a:any,b:any) => {
      const va = a[sortField]||''; const vb = b[sortField]||'';
      return sortDir==='asc' ? (va>vb?1:-1) : (va<vb?1:-1);
    });
    return list;
  }, [tenants, search, planFilter, statusFilter, sortField, sortDir]);

  const mrrFiltrado = filtered.filter(t=>t.status==='ativo').reduce((s,t)=>s+(t.mrr_value||0),0);

  const alertas = tenants.filter(t => {
    if (t.status !== 'trial') return false;
    const d = diasRestantes(t.trial_end_date);
    return d !== null && d <= 5;
  }).sort((a,b) => (diasRestantes(a.trial_end_date)||0) - (diasRestantes(b.trial_end_date)||0));

  const PLAN_PRICES_MAP: Record<string,number> = {
    trial:0, basico:97, profissional:197, clinica:397, cancelado:0
  };
  const updateField = async (id: string, field: string, value: any) => {
    setUpdating(id);
    const updates: any = { [field]: value };
    // Ao mudar plano, atualiza MRR automaticamente
    if (field === 'plan') {
      updates.mrr_value = PLAN_PRICES_MAP[value] || 0;
    }
    // Ao ativar, seta next_billing para 30 dias
    if (field === 'status' && value === 'ativo') {
      const nb = new Date(); nb.setDate(nb.getDate()+30);
      updates.next_billing = nb.toISOString().split('T')[0];
    }
    await supabase.from('tenants').update(updates).eq('id', id);
    setTenants(prev => prev.map(t => t.id===id ? {...t, ...updates} : t));
    setUpdating(null);
    toast.success('Atualizado!');
  };

  const estenderTrial = async (t: Tenant, dias: number) => {
    const base = t.trial_end_date ? new Date(t.trial_end_date+'T00:00:00') : new Date();
    base.setDate(base.getDate()+dias);
    const nova = base.toISOString().split('T')[0];
    await updateField(t.id, 'trial_end_date', nova);
  };

  const excluir = async (t: Tenant) => {
    if (!confirm('Excluir '+t.company_name+'? Isso nao pode ser desfeito.')) return;
    await supabase.from('tenants').delete().eq('id', t.id);
    setTenants(prev=>prev.filter(x=>x.id!==t.id));
    toast.success('Tenant excluido');
  };

  const salvar = async () => {
    if (!form.company_name || !form.email) { toast.error('Preencha nome e email'); return; }
    if (editing) {
      const { error } = await supabase.from('tenants').update(form).eq('id', editing.id);
      if (error) { toast.error('Erro: '+error.message); return; }
      toast.success('Salvo!');
    } else {
      const { error } = await supabase.from('tenants').insert([{...form, mrr_value:form.mrr_value||0}]);
      if (error) { toast.error('Erro: '+error.message); return; }
      toast.success('Tenant criado!');
    }
    setEditing(null);
    setForm({});
    setShowModal(false);
    load();
  };

  const exportCSV = () => {
    const rows = [['Empresa','Email','Plano','Status','Trial Ate','MRR','Cidade','Estado','Criado em']];
    filtered.forEach(t=>rows.push([t.company_name,t.email,t.plan,t.status,t.trial_end_date||'',String(t.mrr_value||0),t.city||'',t.state||'',fmtDate(t.created_at)]));
    const csv=rows.map(r=>r.join(';')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv); a.download='tenants.csv'; a.click();
  };

  const thStyle = (field: string): React.CSSProperties => ({
    cursor:'pointer', userSelect:'none', display:'flex', alignItems:'center', gap:4,
    color: sortField===field ? '#6366f1' : 'var(--text-muted)'
  });

  const SortIcon = ({field}:{field:string}) => sortField===field
    ? (sortDir==='asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)
    : null;

  const doSort = (field: string) => {
    if (sortField===field) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', padding:24 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Shield size={20} color="white"/>
          </div>
          <div>
            <div style={{ fontSize:18, fontWeight:800 }}>OptiFlow <span style={{ color:'#6366f1' }}>Admin</span></div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>Painel de gestao SaaS</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ position:'relative' }}>
            <button onClick={()=>setShowAlerts(!showAlerts)}
              style={{ background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.2)', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'#f59e0b', display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600 }}>
              <Bell size={15}/> Alertas
              {alertas.length > 0 && <span style={{ background:'#f87171', color:'white', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{alertas.length}</span>}
            </button>
            {showAlerts && alertas.length > 0 && (
              <div style={{ position:'absolute', top:'110%', right:0, width:320, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.4)', zIndex:100, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Trials expirando em breve</div>
                {alertas.map(t => {
                  const d = diasRestantes(t.trial_end_date);
                  return (
                    <div key={t.id} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{t.company_name}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.email}</div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                        <span style={{ fontSize:12, fontWeight:700, color: (d||0)<=0?'#f87171':(d||0)<=3?'#f59e0b':'#22c55e' }}>
                          {(d||0)<=0 ? 'Expirado' : d+'d restantes'}
                        </span>
                        <button onClick={()=>{ estenderTrial(t,7); setShowAlerts(false); }}
                          style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, border:'1px solid rgba(99,102,241,.3)', background:'rgba(99,102,241,.1)', color:'#6366f1', cursor:'pointer' }}>
                          +7 dias
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button onClick={()=>{setEditing(null);setForm({plan:'trial',status:'trial',trial_end_date:new Date(Date.now()+14*86400000).toISOString().split('T')[0]});setShowModal(true);}}
            style={{ background:'linear-gradient(135deg,#6366f1,#06b6d4)', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', color:'white', display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600 }}>
            <Plus size={15}/> Novo Tenant
          </button>
          <button onClick={load} style={{ background:'rgba(255,255,255,.06)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
            <RefreshCw size={15}/>
          </button>
          <button onClick={exportCSV} style={{ background:'rgba(255,255,255,.06)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
            <Download size={15}/>
          </button>
          <button onClick={()=>{ supabase.auth.signOut(); navigate('/admin-login'); }}
            style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
            <LogOut size={14}/> Sair
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:20 }}>
        {[
          { icon:<Users size={18}/>,       label:'Total Clientes',    val:stats.total,      sub:'+'+stats.novosmes+' este mes',  color:'#6366f1' },
          { icon:<CheckCircle size={18}/>, label:'Ativos',            val:stats.ativos,     sub:'Conversao: '+stats.conversao+'%', color:'#22c55e' },
          { icon:<Clock size={18}/>,       label:'Em Trial',          val:stats.trial,      sub:stats.expirando+' expirando',    color:'#f59e0b' },
          { icon:<AlertTriangle size={18}/>,label:'Inadimplentes',    val:stats.inadimp,    sub:'Requer atencao',                 color:'#f87171' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ color:s.color }}>{s.icon}</span>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>{s.label}</span>
            </div>
            <div style={{ fontSize:28, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{s.sub}</div>
            <MiniBar value={s.val} max={stats.total} color={s.color}/>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.2fr', gap:16, marginBottom:20 }}>
        {/* MRR */}
        <div className="card" style={{ padding:20, borderTop:'3px solid #22c55e' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <DollarSign size={18} style={{ color:'#22c55e' }}/>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>MRR (Ativos)</span>
          </div>
          <div style={{ fontSize:28, fontWeight:800, color:'#22c55e' }}>{formatBRL(stats.mrr)}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>MRR Total: {formatBRL(stats.mrrTotal)}</div>
        </div>
        {/* Conversao */}
        <div className="card" style={{ padding:20, borderTop:'3px solid #a855f7' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <TrendingUp size={18} style={{ color:'#a855f7' }}/>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>Taxa de Conversao</span>
          </div>
          <div style={{ fontSize:28, fontWeight:800, color:'#a855f7' }}>{stats.conversao}%</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>trial para pago</div>
          <MiniBar value={stats.conversao} max={100} color="#a855f7"/>
        </div>
        {/* Grafico crescimento */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <BarChart2 size={16} style={{ color:'#6366f1' }}/>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>Novos Tenants (6 meses)</span>
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:50 }}>
            {crescimento.map((m,i) => (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ width:'100%', background:i===5?'#6366f1':'rgba(99,102,241,.3)', borderRadius:'3px 3px 0 0', height: m.total>0 ? Math.max(6,(m.total/maxCres)*44) : 4, transition:'height .3s' }}/>
                <span style={{ fontSize:9, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <div className="search-bar" style={{ flex:1 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Buscar por nome, email ou cidade..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{ width:160 }} value={planFilter} onChange={e=>setPlanFilter(e.target.value)}>
          <option value="">Todos os Planos</option>
          {PLANS.map(p=><option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
        </select>
        <select className="form-input" style={{ width:160 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">Todos os Status</option>
          {STATUS_LIST.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
          MRR filtrado: <strong style={{ color:'#22c55e' }}>{formatBRL(mrrFiltrado)}</strong>
        </div>
      </div>

      {/* Tabela */}
      {loading ? <div className="empty-state"><p>Carregando...</p></div> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th onClick={()=>doSort('company_name')}><div style={thStyle('company_name')}>Empresa <SortIcon field="company_name"/></div></th>
                  <th>Email</th>
                  <th style={{ textAlign:'center' }}>Plano</th>
                  <th style={{ textAlign:'center' }}>Status</th>
                  <th style={{ textAlign:'center' }} onClick={()=>doSort('trial_end_date')}><div style={{...thStyle('trial_end_date'), justifyContent:'center'}}>Trial / Vencimento <SortIcon field="trial_end_date"/></div></th>
                  <th style={{ textAlign:'right' }} onClick={()=>doSort('mrr_value')}><div style={{...thStyle('mrr_value'), justifyContent:'flex-end'}}>MRR <SortIcon field="mrr_value"/></div></th>
                  <th style={{ textAlign:'center' }} onClick={()=>doSort('created_at')}><div style={{...thStyle('created_at'), justifyContent:'center'}}>Criado <SortIcon field="created_at"/></div></th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const st = getStatus(t.status);
                  const dias = diasRestantes(t.trial_end_date);
                  const trialColor = dias===null ? 'var(--text-muted)' : dias<=0 ? '#f87171' : dias<=3 ? '#f59e0b' : '#22c55e';
                  return (
                    <tr key={t.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'white', flexShrink:0 }}>
                            {(t.company_name||'?').slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight:700 }}>{t.company_name}</div>
                            {t.city && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.city}{t.state?' - '+t.state:''}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize:12 }}>{t.email}</div>
                        {t.phone && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.phone}</div>}
                      </td>
                      <td style={{ textAlign:'center' }}>
                        <select value={t.plan} onChange={e=>updateField(t.id,'plan',e.target.value)}
                          disabled={updating===t.id}
                          style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:20, border:'none', background:'rgba(99,102,241,.15)', color:'#6366f1', cursor:'pointer', outline:'none' }}>
                          {PLANS.map(p=><option key={p} value={p}>{PLAN_LABELS[p]} - R$ {PLAN_PRICES[p]}/mes</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign:'center' }}>
                        <select value={t.status} onChange={e=>updateField(t.id,'status',e.target.value)}
                          disabled={updating===t.id}
                          style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, border:'none', background:st.bg, color:st.color, cursor:'pointer', outline:'none' }}>
                          {STATUS_LIST.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign:'center' }}>
                        {t.status==='trial' && dias!==null ? (
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:trialColor }}>
                              {dias<=0 ? 'Expirado '+Math.abs(dias)+'d atras' : dias+'d restantes'}
                            </div>
                            <div style={{ fontSize:10, color:'var(--text-muted)' }}>{fmtDate(t.trial_end_date)}</div>
                            <div style={{ display:'flex', gap:4, justifyContent:'center', marginTop:4 }}>
                              {[7,14,30].map(d=>(
                                <button key={d} onClick={()=>estenderTrial(t,d)}
                                  style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, border:'1px solid rgba(99,102,241,.3)', background:'rgba(99,102,241,.1)', color:'#6366f1', cursor:'pointer' }}>
                                  +{d}d
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : t.next_billing ? (
                          <div style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(t.next_billing)}</div>
                        ) : <span style={{ color:'var(--text-muted)' }}>--</span>}
                      </td>
                      <td style={{ textAlign:'right' }}>
                        <div style={{ fontWeight:700, color:'#22c55e' }}>{formatBRL(t.mrr_value||0)}</div>
                        <div style={{ fontSize:10, color:'var(--text-muted)' }}>/mes</div>
                      </td>
                      <td style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)' }}>
                        {fmtDate(t.created_at)}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={()=>{ setEditing(t); setForm({...t}); setShowModal(true); }} title="Editar"
                            style={{ background:'rgba(99,102,241,.1)', border:'1px solid rgba(99,102,241,.2)', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#6366f1', display:'flex', alignItems:'center' }}>
                            <Edit2 size={13}/>
                          </button>
                          <button onClick={()=>excluir(t)} title="Excluir"
                            style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}>
                            <X size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
            <span>{filtered.length} tenant(s) | Total: {tenants.length}</span>
            <span>MRR filtrado: <strong style={{ color:'#22c55e' }}>{formatBRL(mrrFiltrado)}</strong></span>
          </div>
        </div>
      )}

      {/* Modal editar/criar */}
      {showModal && (
        <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget){setEditing(null);setForm({});setShowModal(false);} }}>
          <div className="modal" style={{ maxWidth:560, width:'95%' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Editar: '+editing.company_name : 'Novo Tenant'}</h2>
              <button onClick={()=>{setEditing(null);setForm({});setShowModal(false);}}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Nome da Empresa *</label>
                  <input className="form-input" value={form.company_name||''} onChange={e=>setForm(f=>({...f,company_name:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Telefone</label>
                  <input className="form-input" value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Plano</label>
                  <select className="form-input" value={form.plan||'trial'} onChange={e=>{ const p=e.target.value as Plan; setForm(f=>({...f,plan:p,mrr_value:PLAN_PRICES[p]||0})); }}>
                    {PLANS.map(p=><option key={p} value={p}>{PLAN_LABELS[p]} - R$ {PLAN_PRICES[p]}/mes</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select className="form-input" value={form.status||'trial'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                    {STATUS_LIST.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Trial Ate</label>
                  <input className="form-input" type="date" value={form.trial_end_date||''} onChange={e=>setForm(f=>({...f,trial_end_date:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Proxima Cobranca</label>
                  <input className="form-input" type="date" value={form.next_billing||''} onChange={e=>setForm(f=>({...f,next_billing:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">MRR (R$/mes)</label>
                  <input className="form-input" type="number" value={form.mrr_value||0} onChange={e=>setForm(f=>({...f,mrr_value:parseFloat(e.target.value)||0}))}/>
                </div>
                <div>
                  <label className="form-label">Cidade</label>
                  <input className="form-input" value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Estado (UF)</label>
                  <input className="form-input" value={form.state||''} onChange={e=>setForm(f=>({...f,state:e.target.value}))} placeholder="AM"/>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'16px 24px', borderTop:'1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={()=>{setEditing(null);setForm({});setShowModal(false);}}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar}><Save size={14}/> Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

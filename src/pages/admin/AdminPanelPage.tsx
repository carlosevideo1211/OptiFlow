import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatBRL } from '../../types/index';
import type { Tenant, Plan } from '../../types/index';
import {
  LogOut, RefreshCw, Search, Users, TrendingUp, Shield,
  AlertTriangle, DollarSign, X, Save, Edit2, CheckCircle,
  XCircle, Clock, Ban, Calendar, Mail
} from 'lucide-react';
import toast from 'react-hot-toast';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
const PLANS: Plan[] = ['trial','basico','profissional','clinica','cancelado'];
const PLAN_LABELS: Record<Plan,string> = {
  trial:'Trial', basico:'Básico', profissional:'Profissional',
  clinica:'Clínica', cancelado:'Cancelado'
};
const PLAN_PRICES: Record<Plan,number> = {
  trial:0, basico:97, profissional:197, clinica:397, cancelado:0
};
const STATUS_LIST = [
  { value:'trial',       label:'Trial',        color:'#f59e0b', bg:'rgba(245,158,11,.15)' },
  { value:'ativo',       label:'Ativo',         color:'#22c55e', bg:'rgba(34,197,94,.15)'  },
  { value:'inadimplente',label:'Inadimplente',  color:'#f87171', bg:'rgba(248,113,113,.15)'},
  { value:'bloqueado',   label:'Bloqueado',     color:'#94a3b8', bg:'rgba(148,163,184,.15)'},
  { value:'cancelado',   label:'Cancelado',     color:'#475569', bg:'rgba(71,85,105,.15)'  },
];
function getStatus(v: string) { return STATUS_LIST.find(s=>s.value===v)||STATUS_LIST[0]; }

export default function AdminPanelPage() {
  const navigate  = useNavigate();
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [planFilter, setPlanFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [updating, setUpdating] = useState<string|null>(null);
  const [editing, setEditing]   = useState<Tenant|null>(null);
  const [editMRR, setEditMRR]   = useState(0);
  const [editPlan, setEditPlan] = useState<Plan>('trial');
  const [editStatus, setEditStatus] = useState('trial');
  const [editTrial, setEditTrial]   = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => {
      if (!session) navigate('/admin-login');
      else loadTenants();
    });
  }, []);

  const loadTenants = async () => {
    setLoading(true);
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending:false });
    setTenants((data as Tenant[]) ?? []);
    setLoading(false);
  };

  // Stats
  const stats = {
    total:     tenants.length,
    ativos:    tenants.filter(t=>t.status==='ativo').length,
    trial:     tenants.filter(t=>t.status==='trial').length,
    inadimp:   tenants.filter(t=>t.status==='inadimplente').length,
    mrr:       tenants.filter(t=>t.status==='ativo').reduce((s,t)=>s+(t.mrr_value||0),0),
    mrrTotal:  tenants.reduce((s,t)=>s+(t.mrr_value||0),0),
  };

  const filtered = useMemo(() => {
    let list = tenants;
    if (planFilter)   list = list.filter(t=>t.plan===planFilter);
    if (statusFilter) list = list.filter(t=>t.status===statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(t => t.company_name.toLowerCase().includes(s) || t.email?.toLowerCase().includes(s));
    }
    return list;
  }, [tenants, search, planFilter, statusFilter]);

  const openEdit = (t: Tenant) => {
    setEditing(t); setEditMRR(t.mrr_value||0);
    setEditPlan(t.plan); setEditStatus(t.status);
    setEditTrial(t.trial_end_date||'');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setUpdating(editing.id);
    await supabase.from('tenants').update({
      plan: editPlan, status: editStatus,
      mrr_value: editMRR,
      trial_end_date: editTrial||null,
    }).eq('id', editing.id);
    setTenants(p=>p.map(t=>t.id===editing.id
      ? {...t, plan:editPlan, status:editStatus as any, mrr_value:editMRR, trial_end_date:editTrial}
      : t));
    toast.success('Tenant atualizado!');
    setEditing(null); setUpdating(null);
  };

  const quickStatus = async (id: string, status: string) => {
    setUpdating(id);
    await supabase.from('tenants').update({ status }).eq('id', id);
    setTenants(p=>p.map(t=>t.id===id?{...t,status:status as any}:t));
    toast.success('Status atualizado!'); setUpdating(null);
  };

  const extendTrial = async (t: Tenant) => {
    const end = new Date(); end.setDate(end.getDate()+14);
    const date = end.toISOString().split('T')[0];
    await supabase.from('tenants').update({ trial_end_date:date, status:'trial' }).eq('id',t.id);
    setTenants(p=>p.map(x=>x.id===t.id?{...x,trial_end_date:date,status:'trial' as any}:x));
    toast.success('Trial estendido por 14 dias!');
  };

  const IconBtn = ({ onClick, title, color, children }: any) => (
    <button onClick={onClick} title={title}
      style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
        borderRadius:7, padding:'5px 8px', cursor:'pointer', color:color||'var(--text-muted)',
        display:'flex', alignItems:'center', transition:'all .15s' }}
      onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.12)')}
      onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,.06)')}>
      {children}
    </button>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', padding:32 }}>
      <div style={{ maxWidth:1300, margin:'0 auto' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="10" fill="url(#adm)"/>
              <ellipse cx="16" cy="16" rx="10" ry="6" stroke="white" strokeWidth="1.8" fill="none"/>
              <circle cx="16" cy="16" r="3.5" fill="white"/>
              <circle cx="16" cy="16" r="1.5" fill="url(#adm)"/>
              <defs><linearGradient id="adm" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1"/><stop offset="1" stopColor="#06b6d4"/>
              </linearGradient></defs>
            </svg>
            <div>
              <div style={{ fontSize:22, fontWeight:800, color:'white', letterSpacing:'-0.5px' }}>
                Opti<span style={{ color:'#06b6d4' }}>Flow</span> <span style={{ fontSize:14, color:'#6366f1', fontWeight:600 }}>Admin</span>
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.4)' }}>Painel de gestão SaaS</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={loadTenants}
              style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.1)',
                borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'rgba(255,255,255,.7)',
                display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
              <RefreshCw size={14}/> Atualizar
            </button>
            <button onClick={async()=>{ await supabase.auth.signOut(); navigate('/admin-login'); }}
              style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)',
                borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'#f87171',
                display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
              <LogOut size={14}/> Sair
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:14, marginBottom:28 }}>
          {[
            { icon:<Users size={18}/>,        val:stats.total,          label:'Total Clientes', color:'#6366f1' },
            { icon:<CheckCircle size={18}/>,   val:stats.ativos,         label:'Ativos',          color:'#22c55e' },
            { icon:<Clock size={18}/>,         val:stats.trial,          label:'Em Trial',        color:'#f59e0b' },
            { icon:<AlertTriangle size={18}/>, val:stats.inadimp,        label:'Inadimplentes',   color:'#f87171' },
            { icon:<DollarSign size={18}/>,    val:formatBRL(stats.mrr), label:'MRR (Ativos)',    color:'#06b6d4' },
            { icon:<TrendingUp size={18}/>,    val:formatBRL(stats.mrrTotal), label:'MRR Total',  color:'#a855f7' },
          ].map((s,i) => (
            <div key={i} style={{ background:'var(--bg-card)', borderRadius:12, padding:16,
              borderTop:'3px solid '+s.color, border:'1px solid rgba(255,255,255,.07)' }}>
              <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
              <div style={{ fontSize:typeof s.val==='number'?22:15, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:220, display:'flex', alignItems:'center', gap:8,
            background:'var(--bg-card)', border:'1px solid rgba(255,255,255,.1)',
            borderRadius:8, padding:'0 12px' }}>
            <Search size={14} style={{ color:'rgba(255,255,255,.4)' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar por nome ou email..."
              style={{ background:'none', border:'none', outline:'none', color:'white',
                fontSize:13, padding:'10px 0', flex:1 }}/>
          </div>
          <select value={planFilter} onChange={e=>setPlanFilter(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, background:'var(--bg-card)',
              border:'1px solid rgba(255,255,255,.1)', color:'white', fontSize:13 }}>
            <option value="">Todos os Planos</option>
            {PLANS.map(p=><option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
          </select>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, background:'var(--bg-card)',
              border:'1px solid rgba(255,255,255,.1)', color:'white', fontSize:13 }}>
            <option value="">Todos os Status</option>
            {STATUS_LIST.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Tabela */}
        <div style={{ background:'var(--bg-card)', borderRadius:14, border:'1px solid rgba(255,255,255,.07)', overflow:'hidden' }}>
          {loading ? (
            <div style={{ padding:48, textAlign:'center', color:'rgba(255,255,255,.4)' }}>Carregando...</div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid rgba(255,255,255,.07)' }}>
                    {['Empresa','Email','Plano','Status','Trial até','MRR','Criado em','Ações'].map(h => (
                      <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11,
                        fontWeight:700, color:'rgba(255,255,255,.4)', textTransform:'uppercase',
                        letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t,i) => {
                    const st = getStatus(t.status);
                    const trialEnd = t.trial_end_date ? new Date(t.trial_end_date+'T12:00') : null;
                    const trialExp = trialEnd && trialEnd < new Date();
                    return (
                      <tr key={t.id} style={{ borderBottom:'1px solid rgba(255,255,255,.05)',
                        background: i%2===0?'transparent':'rgba(255,255,255,.02)',
                        transition:'background .1s' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='rgba(99,102,241,.05)')}
                        onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?'transparent':'rgba(255,255,255,.02)')}>
                        <td style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
                              background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:12, fontWeight:700, color:'white' }}>
                              {t.company_name.slice(0,2).toUpperCase()}
                            </div>
                            <span style={{ fontWeight:600, color:'white', fontSize:13 }}>{t.company_name}</span>
                          </div>
                        </td>
                        <td style={{ padding:'12px 16px', fontSize:12, color:'rgba(255,255,255,.5)' }}>
                          {t.email||'—'}
                        </td>
                        <td style={{ padding:'12px 16px' }}>
                          <span style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20,
                            background:'rgba(99,102,241,.15)', color:'#6366f1' }}>
                            {PLAN_LABELS[t.plan]} — {formatBRL(PLAN_PRICES[t.plan])}/mês
                          </span>
                        </td>
                        <td style={{ padding:'12px 16px' }}>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12,
                            fontWeight:600, padding:'4px 10px', borderRadius:20,
                            background:st.bg, color:st.color }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding:'12px 16px', fontSize:12,
                          color: trialExp?'#f87171':'rgba(255,255,255,.5)' }}>
                          {trialEnd ? (trialExp?'⚠️ ':'')+trialEnd.toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td style={{ padding:'12px 16px', fontWeight:700,
                          color: t.mrr_value?'#22c55e':'rgba(255,255,255,.3)' }}>
                          {t.mrr_value ? formatBRL(t.mrr_value) : '—'}
                        </td>
                        <td style={{ padding:'12px 16px', fontSize:12, color:'rgba(255,255,255,.4)' }}>
                          {new Date(t.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex', gap:4 }}>
                            <IconBtn onClick={()=>openEdit(t)} title="Editar" color="#6366f1"><Edit2 size={13}/></IconBtn>
                            <IconBtn onClick={()=>extendTrial(t)} title="Estender trial 14 dias" color="#f59e0b"><Calendar size={13}/></IconBtn>
                            <IconBtn onClick={()=>quickStatus(t.id,'ativo')} title="Ativar" color="#22c55e"><CheckCircle size={13}/></IconBtn>
                            <IconBtn onClick={()=>quickStatus(t.id,'bloqueado')} title="Bloquear" color="#f87171"><Ban size={13}/></IconBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding:'10px 16px', fontSize:12, color:'rgba(255,255,255,.3)',
                borderTop:'1px solid rgba(255,255,255,.07)' }}>
                {filtered.length} tenant(s) exibido(s)
              </div>
            </div>
          )}
        </div>

        {/* Modal edição */}
        {editing && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:1000,
            display:'flex', alignItems:'center', justifyContent:'center' }}
            onClick={()=>setEditing(null)}>
            <div style={{ background:'var(--bg-card)', borderRadius:16, padding:28, width:480,
              border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 24px 60px rgba(0,0,0,.5)' }}
              onClick={e=>e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <h2 style={{ fontSize:16, fontWeight:700, color:'white' }}>Editar — {editing.company_name}</h2>
                <button onClick={()=>setEditing(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.5)' }}><X size={18}/></button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.5)', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Plano</label>
                  <select value={editPlan} onChange={e=>setEditPlan(e.target.value as Plan)}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:8, background:'var(--bg)',
                      border:'1px solid rgba(255,255,255,.1)', color:'white', fontSize:14 }}>
                    {PLANS.map(p=><option key={p} value={p}>{PLAN_LABELS[p]} — {formatBRL(PLAN_PRICES[p])}/mês</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.5)', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Status</label>
                  <select value={editStatus} onChange={e=>setEditStatus(e.target.value)}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:8, background:'var(--bg)',
                      border:'1px solid rgba(255,255,255,.1)', color:'white', fontSize:14 }}>
                    {STATUS_LIST.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.5)', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>MRR (R$)</label>
                  <input type="number" step="0.01" min="0" value={editMRR||''}
                    onChange={e=>setEditMRR(parseFloat(e.target.value)||0)}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:8, background:'var(--bg)',
                      border:'1px solid rgba(255,255,255,.1)', color:'white', fontSize:14, boxSizing:'border-box' }}/>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.5)', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Trial até</label>
                  <input type="date" value={editTrial}
                    onChange={e=>setEditTrial(e.target.value)}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:8, background:'var(--bg)',
                      border:'1px solid rgba(255,255,255,.1)', color:'white', fontSize:14, boxSizing:'border-box' }}/>
                </div>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:24 }}>
                <button onClick={()=>setEditing(null)}
                  style={{ flex:1, padding:'10px', borderRadius:8, background:'rgba(255,255,255,.08)',
                    border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.7)', cursor:'pointer', fontSize:14 }}>
                  Cancelar
                </button>
                <button onClick={saveEdit}
                  style={{ flex:2, padding:'10px', borderRadius:8, border:'none', cursor:'pointer',
                    background:'linear-gradient(135deg,#6366f1,#06b6d4)', color:'white', fontSize:14, fontWeight:700,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <Save size={15}/> Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

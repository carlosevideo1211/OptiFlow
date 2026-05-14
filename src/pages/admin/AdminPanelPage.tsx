import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatBRL } from '../../types/index';
import type { Tenant, Plan } from '../../types/index';
import { LogOut, RefreshCw, Search, Users, TrendingUp, Shield, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
const PLANS: Plan[] = ['trial','basico','profissional','clinica','cancelado'];
const PLAN_LABELS: Record<Plan,string> = { trial:'Trial', basico:'Básico', profissional:'Profissional', clinica:'Clínica', cancelado:'Cancelado' };

export default function AdminPanelPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string|null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || session.user.email !== ADMIN_EMAIL) navigate('/admin-login');
      else loadTenants();
    });
  }, []);

  const loadTenants = async () => {
    setLoading(true);
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending:false });
    setTenants(data as Tenant[] ?? []);
    setLoading(false);
  };

  const updatePlan = async (id: string, plan: Plan) => {
    setUpdating(id);
    await supabase.from('tenants').update({ plan }).eq('id', id);
    setTenants(p => p.map(t => t.id === id ? { ...t, plan } : t));
    setUpdating(null);
    toast.success('Plano atualizado!');
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('tenants').update({ status }).eq('id', id);
    setTenants(p => p.map(t => t.id === id ? { ...t, status: status as any } : t));
    toast.success('Status atualizado!');
  };

  const filtered = tenants.filter(t =>
    !search || t.company_name.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: tenants.length,
    ativos: tenants.filter(t => t.status === 'ativo').length,
    trial: tenants.filter(t => t.status === 'trial').length,
    mrr: tenants.filter(t => t.status === 'ativo').reduce((s,t) => s + (t.mrr_value||0), 0),
  };

  const statusColor: Record<string,string> = { trial:'var(--info)', ativo:'var(--success)', inadimplente:'var(--warning)', bloqueado:'var(--danger)', cancelado:'var(--text2)' };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', padding:32 }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:32 }}>👁️</div>
            <div>
              <div style={{ fontSize:20, fontWeight:800, color:'var(--text)' }}>OptiFlow Admin</div>
              <div style={{ fontSize:12, color:'var(--text2)' }}>Painel de gestão SaaS</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-secondary btn-sm" onClick={loadTenants}><RefreshCw size={14} /></button>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await supabase.auth.signOut(); navigate('/admin-login'); }}><LogOut size={14} /> Sair</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
          {[
            { label:'Total', value:stats.total, icon:Users, color:'primary' },
            { label:'Ativos', value:stats.ativos, icon:Shield, color:'success' },
            { label:'Trial', value:stats.trial, icon:AlertTriangle, color:'warning' },
            { label:'MRR', value:formatBRL(stats.mrr), icon:TrendingUp, color:'accent' },
          ].map(({ label, value, icon:Icon, color }) => (
            <div key={label} className={`stat-card ${color}`}>
              <div className="stat-label"><Icon size={13} style={{ display:'inline', marginRight:4 }} />{label}</div>
              <div className="stat-value">{value}</div>
            </div>
          ))}
        </div>

        {/* Tenants table */}
        <div className="card">
          <div style={{ display:'flex', gap:12, marginBottom:20 }}>
            <div className="search-bar" style={{ flex:1 }}>
              <Search size={14} />
              <input className="form-input" placeholder="Buscar por nome ou email..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {loading ? <div className="empty-state"><p>Carregando...</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Empresa</th><th>Email</th><th>Plano</th><th>Status</th><th>Trial até</th><th>MRR</th><th>Ação</th></tr></thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id}>
                      <td><strong>{t.company_name}</strong></td>
                      <td style={{ color:'var(--text2)', fontSize:12 }}>{t.email}</td>
                      <td>
                        <select className="form-select" value={t.plan} onChange={e => updatePlan(t.id, e.target.value as Plan)} disabled={updating===t.id} style={{ fontSize:12, padding:'5px 8px', width:'auto' }}>
                          {PLANS.map(p => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
                        </select>
                      </td>
                      <td><span className="badge" style={{ background:`${statusColor[t.status]}20`, color:statusColor[t.status] }}>{t.status}</span></td>
                      <td style={{ color:'var(--text2)', fontSize:12 }}>{t.trial_end_date ? new Date(t.trial_end_date+'T12:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td style={{ color:'var(--success)', fontWeight:700 }}>{t.mrr_value ? formatBRL(t.mrr_value) : '—'}</td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="btn btn-success btn-sm" onClick={() => updateStatus(t.id,'ativo')} style={{ fontSize:11 }}>Ativar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => updateStatus(t.id,'bloqueado')} style={{ fontSize:11 }}>Bloquear</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

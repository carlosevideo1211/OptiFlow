import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Search, Clock, RotateCcw, Trash2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

// Tela separada pra listar so os trials ja vencidos (pedido pelo Carlos,
// 01/09/2026), tirados da tabela principal do Admin pra ela ficar limpa —
// so com ativos/inadimplentes/bloqueados/cancelados e trials que ainda nao
// venceram. Nenhum tenant e apagado do banco so por aparecer aqui; a acao
// de excluir continua manual, um por um.
interface TenantVencido {
  id: string;
  company_name: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  status: string;
  trial_end_date?: string;
  created_at: string;
}

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

export default function TrialsVencidosPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantVencido[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string|null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => {
      if (!session) navigate('/admin-login');
      else load();
    });
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('tenants').select('*').eq('status', 'trial').order('trial_end_date', { ascending: true });
    setTenants((data as TenantVencido[]) ?? []);
    setLoading(false);
  };

  // So os que realmente ja venceram (dias < 0) — filtro defensivo aqui
  // tambem, mesmo a query ja pegando so status='trial'.
  const vencidos = useMemo(() => {
    let list = tenants.filter(t => {
      const d = diasRestantes(t.trial_end_date);
      return d !== null && d < 0;
    });
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(t => t.company_name?.toLowerCase().includes(s) || t.email?.toLowerCase().includes(s) || t.city?.toLowerCase().includes(s));
    }
    return list;
  }, [tenants, search]);

  // Reativa o trial por +14 dias a partir de hoje — volta a aparecer na
  // tabela principal do Admin automaticamente.
  const reativarTrial = async (t: TenantVencido) => {
    if (!confirm('Reativar o trial de ' + t.company_name + ' por mais 14 dias?')) return;
    const nova = new Date(); nova.setDate(nova.getDate()+14);
    const novaData = nova.toISOString().split('T')[0];
    setUpdating(t.id);
    const { error } = await supabase.from('tenants').update({ trial_end_date: novaData }).eq('id', t.id);
    setUpdating(null);
    if (error) { toast.error('Erro ao reativar: '+error.message); return; }
    setTenants(prev => prev.filter(x => x.id !== t.id));
    toast.success(t.company_name + ' reativado ate ' + fmtDate(novaData) + '. Ja volta a aparecer no Painel.');
  };

  const excluir = async (t: TenantVencido) => {
    if (!confirm('Excluir ' + t.company_name + ' definitivamente? Isso nao pode ser desfeito.')) return;
    setUpdating(t.id);
    const { error } = await supabase.from('tenants').delete().eq('id', t.id);
    setUpdating(null);
    if (error) { toast.error('Erro ao excluir: '+error.message); return; }
    setTenants(prev => prev.filter(x => x.id !== t.id));
    toast.success('Tenant excluido');
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', padding:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={()=>navigate('/admin')}
            style={{ background:'rgba(255,255,255,.06)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
            <ArrowLeft size={15}/> Voltar ao Painel
          </button>
          <div style={{ width:40, height:40, borderRadius:10, background:'rgba(148,163,184,.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Clock size={20} color="#94a3b8"/>
          </div>
          <div>
            <div style={{ fontSize:18, fontWeight:800 }}>Trials Vencidos</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{vencidos.length} trial(s) que passaram do prazo de teste e nunca viraram cliente pagante</div>
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <div className="search-bar" style={{ flex:1, maxWidth:360 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Buscar por nome, email ou cidade..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      </div>

      {loading ? <div className="empty-state"><p>Carregando...</p></div> : vencidos.length === 0 ? (
        <div className="empty-state" style={{ padding:40, textAlign:'center' }}>
          <p style={{ color:'var(--text-muted)' }}>Nenhum trial vencido pendente. Tudo limpo por aqui.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Email</th>
                  <th style={{ textAlign:'center' }}>Venceu em</th>
                  <th style={{ textAlign:'center' }}>Criado em</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {vencidos.map(t => {
                  const d = diasRestantes(t.trial_end_date);
                  return (
                    <tr key={t.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#94a3b8,#64748b)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'white', flexShrink:0 }}>
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
                        <div style={{ fontSize:12, fontWeight:700, color:'#f87171' }}>
                          {d!==null ? 'Expirado ha '+Math.abs(d)+'d' : '--'}
                        </div>
                        <div style={{ fontSize:10, color:'var(--text-muted)' }}>{fmtDate(t.trial_end_date)}</div>
                      </td>
                      <td style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)' }}>
                        {fmtDate(t.created_at)}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={()=>reativarTrial(t)} title="Reativar trial por mais 14 dias"
                            disabled={updating===t.id}
                            style={{ background:'rgba(99,102,241,.1)', border:'1px solid rgba(99,102,241,.2)', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#6366f1', display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700 }}>
                            <RotateCcw size={13}/> Reativar
                          </button>
                          <button onClick={()=>{ localStorage.setItem('admin_viewing_tenant', t.id); window.location.href = '/dashboard'; }} title="Acessar Loja"
                            style={{background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.2)',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#22c55e',display:'flex',alignItems:'center'}}>
                            <ExternalLink size={13}/>
                          </button>
                          <button onClick={()=>excluir(t)} title="Excluir definitivamente"
                            disabled={updating===t.id}
                            style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}>
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
            {vencidos.length} trial(s) vencido(s)
          </div>
        </div>
      )}
    </div>
  );
}

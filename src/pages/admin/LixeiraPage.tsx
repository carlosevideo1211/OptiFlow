import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Search, Trash2, RotateCcw, ExternalLink, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { fmtDate } from '../../utils/adminDates';

// Lixeira: lista os tenants que foram "excluidos" no Painel principal ou em
// Trials Vencidos, mas continuam no banco (soft-delete via excluido_em) —
// pedido pelo Carlos (01/09/2026) depois do episodio da baixa errada, pra
// excluir deixar de ser uma acao sem volta. Daqui da pra Restaurar (volta a
// aparecer nas telas normais) ou Excluir Definitivamente (apaga de vez do
// banco, com confirmacao reforcada).
interface TenantExcluido {
  id: string;
  company_name: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  status: string;
  excluido_em?: string | null;
  created_at: string;
}

export default function LixeiraPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantExcluido[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string|null>(null);
  const [colunaFaltando, setColunaFaltando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => {
      if (!session) navigate('/admin-login');
      else load();
    });
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tenants').select('*').not('excluido_em', 'is', null).order('excluido_em', { ascending: false });
    if (error) {
      // Coluna excluido_em ainda nao existe no banco — a Lixeira fica vazia
      // ate o Carlos rodar o ALTER TABLE (nenhum tenant pode ter sido movido
      // pra ca sem ela mesmo).
      setColunaFaltando(true);
      setTenants([]);
      setLoading(false);
      return;
    }
    setColunaFaltando(false);
    setTenants((data as TenantExcluido[]) ?? []);
    setLoading(false);
  };

  const filtrados = useMemo(() => {
    if (!search.trim()) return tenants;
    const s = search.toLowerCase();
    return tenants.filter(t => t.company_name?.toLowerCase().includes(s) || t.email?.toLowerCase().includes(s) || t.city?.toLowerCase().includes(s));
  }, [tenants, search]);

  // Tira da Lixeira — volta a aparecer no Painel (e em Trials Vencidos, se
  // ainda for um trial vencido).
  const restaurar = async (t: TenantExcluido) => {
    if (!confirm('Restaurar ' + t.company_name + '? Volta a aparecer nas telas normais.')) return;
    setUpdating(t.id);
    const { error } = await supabase.from('tenants').update({ excluido_em: null }).eq('id', t.id);
    setUpdating(null);
    if (error) { toast.error('Erro ao restaurar: '+error.message); return; }
    setTenants(prev => prev.filter(x => x.id !== t.id));
    toast.success(t.company_name + ' restaurado.');
  };

  const excluirDefinitivo = async (t: TenantExcluido) => {
    if (!confirm('Excluir ' + t.company_name + ' DEFINITIVAMENTE? Isso apaga todos os dados do banco e NAO pode ser desfeito.')) return;
    if (!confirm('Tem certeza mesmo? Essa e a ultima confirmacao antes de apagar ' + t.company_name + ' de vez.')) return;
    setUpdating(t.id);
    const { error } = await supabase.from('tenants').delete().eq('id', t.id);
    setUpdating(null);
    if (error) { toast.error('Erro ao excluir: '+error.message); return; }
    setTenants(prev => prev.filter(x => x.id !== t.id));
    toast.success('Tenant excluido definitivamente.');
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
            <Trash2 size={20} color="#94a3b8"/>
          </div>
          <div>
            <div style={{ fontSize:18, fontWeight:800 }}>Lixeira</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{filtrados.length} tenant(s) excluido(s), ainda podem ser restaurados</div>
          </div>
        </div>
      </div>

      {colunaFaltando && (
        <div className="card" style={{ padding:16, marginBottom:16, border:'1px solid rgba(245,158,11,.3)', background:'rgba(245,158,11,.08)', display:'flex', gap:10, alignItems:'flex-start' }}>
          <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink:0, marginTop:2 }}/>
          <div style={{ fontSize:13, color:'#f59e0b' }}>
            A Lixeira ainda nao esta configurada no banco. Rode este comando no SQL Editor do Supabase:
            <div style={{ marginTop:8, background:'rgba(0,0,0,.3)', borderRadius:6, padding:'8px 10px', fontFamily:'monospace', fontSize:12, color:'#E8EDF5' }}>
              ALTER TABLE tenants ADD COLUMN IF NOT EXISTS excluido_em timestamptz;
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <div className="search-bar" style={{ flex:1, maxWidth:360 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Buscar por nome, email ou cidade..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      </div>

      {loading ? <div className="empty-state"><p>Carregando...</p></div> : filtrados.length === 0 ? (
        <div className="empty-state" style={{ padding:40, textAlign:'center' }}>
          <p style={{ color:'var(--text-muted)' }}>Lixeira vazia.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Email</th>
                  <th style={{ textAlign:'center' }}>Status (antes de excluir)</th>
                  <th style={{ textAlign:'center' }}>Excluido em</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(t => (
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
                    <td style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)' }}>{t.status}</td>
                    <td style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)' }}>{fmtDate(t.excluido_em)}</td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={()=>restaurar(t)} title="Restaurar"
                          disabled={updating===t.id}
                          style={{ background:'rgba(99,102,241,.1)', border:'1px solid rgba(99,102,241,.2)', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#6366f1', display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700 }}>
                          <RotateCcw size={13}/> Restaurar
                        </button>
                        <button onClick={()=>{ localStorage.setItem('admin_viewing_tenant', t.id); window.location.href = '/dashboard'; }} title="Acessar Loja"
                          style={{background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.2)',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#22c55e',display:'flex',alignItems:'center'}}>
                          <ExternalLink size={13}/>
                        </button>
                        <button onClick={()=>excluirDefinitivo(t)} title="Excluir definitivamente"
                          disabled={updating===t.id}
                          style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}>
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
            {filtrados.length} tenant(s) na lixeira
          </div>
        </div>
      )}
    </div>
  );
}

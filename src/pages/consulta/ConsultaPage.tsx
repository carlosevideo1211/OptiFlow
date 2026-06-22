import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  Plus, Search, Eye, ClipboardList, CheckCircle,
  Clock, XCircle, Download, Edit2, Trash2
} from 'lucide-react';
import { formatDate } from '../../types/index';
import { useNavigate } from 'react-router-dom';
import NovaConsultaModal from './NovaConsultaModal';
import AgendaPage from '../AgendaPage';
import toast from 'react-hot-toast';

export default function ConsultaPage() {
  const { tenantId } = useAuth();
  const [consultations, setConsultations] = useState<any[]>([]);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 50;
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'consultas'|'agenda'>('consultas');
  const navigate = useNavigate();

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('consultations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100);
    setConsultations(data ?? []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let list = consultations;
    if (statusFilter) list = list.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(c => c.customer_name?.toLowerCase().includes(s) || c.professional_name?.toLowerCase().includes(s));
    }
    return list;
  }, [consultations, search, statusFilter]);

  const total      = consultations.length;
  const realizadas = consultations.filter(c => c.status === 'realizada').length;
  const hoje_count = consultations.filter(c => c.date === new Date().toISOString().split('T')[0]).length;
  const com_os     = consultations.filter(c => c.generated_os).length;

  const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    agendada:  { label:'Agendada',  color:'#6366f1', bg:'rgba(99,102,241,.15)',  icon:'📅' },
    realizada: { label:'Realizada', color:'#22c55e', bg:'rgba(34,197,94,.15)',   icon:'✅' },
    cancelada: { label:'Cancelada', color:'#f87171', bg:'rgba(248,113,113,.15)', icon:'❌' },
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta consulta?')) return;
    setDeletingId(id);
    await supabase.from('consultations').delete().eq('id', id);
    toast.success('Consulta excluída!');
    setDeletingId(null);
    load();
  };

  const exportCSV = () => {
    const header = 'Data,Cliente,Profissional,Status,OS Gerada';
    const rows = filtered.map(c =>
      [c.date, c.customer_name, c.professional_name, c.status, c.generated_os?'Sim':'Não']
        .map(v => '"'+(v||'')+'"').join(','));
    const blob = new Blob([header+'\n'+rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'consultas.csv'; a.click();
  };

  const openEdit = (c: any) => navigate('/consulta/atendimento/' + c.id);

  const IconBtn = ({ onClick, title, color, children }: any) => (
    <button onClick={e => { e.stopPropagation(); onClick(); }} title={title}
      style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
        borderRadius:7, padding:'5px 8px', cursor:'pointer', color:color||'var(--text-muted)',
        display:'flex', alignItems:'center' }}>
      {children}
    </button>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Eye size={22}/> Consulta / Receituário
          </h1>
          <p className="page-sub">{total} registros</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16}/> Nova Consulta</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {[{k:'consultas',l:'👁 Consultas / Rx'},{k:'agenda',l:'📅 Agenda'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer',
              fontSize:14, fontWeight:600,
              color: tab===t.k ? '#6366f1' : 'var(--text-muted)',
              borderBottom: tab===t.k ? '2px solid #6366f1' : '2px solid transparent' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Agenda */}
      {tab === 'agenda' && <AgendaPage/>}

      {/* Consultas */}
      {tab === 'consultas' && (<>
        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
          {[
            { icon:<ClipboardList size={22}/>, val:total,       label:'Total de Consultas', color:'#6366f1' },
            { icon:<CheckCircle size={22}/>,   val:realizadas,  label:'Realizadas',          color:'#22c55e' },
            { icon:<Clock size={22}/>,         val:hoje_count,  label:'Hoje',                color:'#f59e0b' },
            { icon:<Eye size={22}/>,           val:com_os,      label:'Com Receituário',       color:'#06b6d4' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:18, borderTop:'3px solid '+s.color }}>
              <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
              <div style={{ fontSize:24, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
          <div className="search-bar" style={{ flex:1, minWidth:220 }}>
            <Search size={15}/>
            <input className="form-input" placeholder="Buscar por cliente ou profissional..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="form-input" style={{ width:160 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="agendada">Agendada</option>
            <option value="realizada">Realizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>

        {/* Tabela */}
        {loading ? <div className="empty-state"><p>Carregando...</p></div> :
         filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Eye size={40}/></div>
            <h3>Nenhuma consulta encontrada.</h3>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={15}/> Nova Consulta</button>
          </div>
         ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Data</th><th>Cliente</th><th>Profissional</th><th>Receituário</th><th>Status</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {filtered.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA).map(c => {
                    const st = STATUS_MAP[c.status] || STATUS_MAP.agendada;
                    const fmtN = (v: any) => {
                      if (v == null || v === '') return null;
                      const n = parseFloat(v);
                      if (isNaN(n)) return null;
                      return (n >= 0 ? '+' : '') + n.toFixed(2).replace('.', ',');
                    };
                    const fmtRx = (esf: any, cil: any, eixo: any) => {
                      const e = fmtN(esf);
                      if (!e) return '—';
                      const c2 = fmtN(cil);
                      const ax = eixo ? `x${parseInt(eixo)}` : '';
                      return c2 ? `${e} ${c2} ${ax}`.trim() : e;
                    };
                    const rxOD = fmtRx(c.rx_re_esf, c.rx_re_cil, c.rx_re_eixo);
                    const rxOE = fmtRx(c.rx_le_esf, c.rx_le_cil, c.rx_le_eixo);
                    const rxAd = c.rx_adicao ? ` | Ad +${parseFloat(c.rx_adicao).toFixed(2).replace('.',',')}` : '';
                    return (
                      <tr key={c.id} onClick={() => openEdit(c)} style={{ cursor:'pointer' }}>
                        <td style={{ fontSize:13 }}>{formatDate ? formatDate(c.date) : c.date}</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0,
                              background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:12, fontWeight:700, color:'white' }}>
                              {(c.customer_name||'?').slice(0,2).toUpperCase()}
                            </div>
                            <span style={{ fontWeight:500 }}>{c.customer_name}</span>
                          </div>
                        </td>
                        <td style={{ fontSize:13, color:'var(--text-muted)' }}>{c.professional_name||'—'}</td>
                        <td style={{ fontSize:13 }}>
                          <span style={{ fontFamily:'monospace', fontSize:12 }}>OD: {rxOD} / OE: {rxOE}{rxAd}</span>
                        </td>
                        <td>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12,
                            fontWeight:600, padding:'4px 10px', borderRadius:20,
                            background:st.bg, color:st.color }}>
                            {st.icon} {st.label}
                          </span>
                        </td>
                        {/* coluna OS removida */}
                        <td style={{display:'none'}}>
                          {c.generated_os ? (
                            <span style={{ fontSize:12, fontWeight:600, color:'#22c55e', display:'flex', alignItems:'center', gap:4 }}>
                              <CheckCircle size={13}/> Sim
                            </span>
                          ) : (
                            <span style={{ fontSize:12, color:'var(--text-muted)' }}>Não</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display:'flex', gap:5 }}>
                            <IconBtn onClick={() => openEdit(c)} title="Editar" color="#6366f1">
                              <Edit2 size={14}/>
                            </IconBtn>
                            <IconBtn onClick={() => handleDelete(c.id)} title="Excluir" color="#f87171">
                              {deletingId === c.id ? '...' : <Trash2 size={14}/>}
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
              {filtered.length} consulta(s) no total — Pag. {pagina}/{Math.ceil(filtered.length/POR_PAGINA)}
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
      </>)}

      {showModal && (
        <NovaConsultaModal
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

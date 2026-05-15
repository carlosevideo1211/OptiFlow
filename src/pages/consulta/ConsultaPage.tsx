import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  Plus, Search, Eye, ClipboardList, CheckCircle,
  Clock, XCircle, Download, Edit2
} from 'lucide-react';
import { formatDate } from '../../types/index';
import NovaConsultaModal from './NovaConsultaModal';

export default function ConsultaPage() {
  const { tenantId } = useAuth();
  const [consultations, setConsultations] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

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

  // Stats
  const hoje = new Date().toISOString().split('T')[0];
  const total      = consultations.length;
  const realizadas = consultations.filter(c => c.status === 'realizada').length;
  const hoje_count = consultations.filter(c => c.date === hoje).length;
  const com_os     = consultations.filter(c => c.generated_os).length;

  const STATUS_MAP: Record<string,{label:string,color:string,bg:string,icon:any}> = {
    realizada: { label:'Realizada', color:'#22c55e', bg:'rgba(34,197,94,.15)',   icon:<CheckCircle size={12}/> },
    agendada:  { label:'Agendada',  color:'#f59e0b', bg:'rgba(245,158,11,.15)',  icon:<Clock size={12}/> },
    cancelada: { label:'Cancelada', color:'#f87171', bg:'rgba(248,113,113,.15)', icon:<XCircle size={12}/> },
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

  const exportCSV = () => {
    const header = 'Data,Cliente,Profissional,Status,OS Gerada';
    const rows = filtered.map(c =>
      [c.date, c.customer_name, c.professional_name, c.status, c.generated_os?'Sim':'Não']
        .map(v => '"'+(v||'')+'"').join(','));
    const blob = new Blob([header+'\n'+rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'consultas.csv'; a.click();
  };

  const openNew  = () => { setSelected(null); setShowModal(true); };
  const openEdit = (c: any) => { setSelected(c); setShowModal(true); };

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
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Eye size={22}/> Consulta / Receituário
          </h1>
          <p className="page-sub">{total} registros</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Nova Consulta</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { icon:<ClipboardList size={22}/>, val:total,       label:'Total de Consultas', color:'#6366f1' },
          { icon:<CheckCircle size={22}/>,   val:realizadas,  label:'Realizadas',          color:'#22c55e' },
          { icon:<Clock size={22}/>,         val:hoje_count,  label:'Hoje',                color:'#f59e0b' },
          { icon:<Eye size={22}/>,           val:com_os,      label:'Com OS Gerada',       color:'#06b6d4' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:28, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Buscar por cliente ou profissional..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{ width:180 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">Todos os Status</option>
          <option value="realizada">✅ Realizada</option>
          <option value="agendada">⏳ Agendada</option>
          <option value="cancelada">❌ Cancelada</option>
        </select>
      </div>

      {/* Tabela */}
      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <ellipse cx="16" cy="16" rx="14" ry="8" stroke="rgba(255,255,255,.2)" strokeWidth="1.5" fill="none"/>
              <circle cx="16" cy="16" r="5" stroke="rgba(255,255,255,.2)" strokeWidth="1.5" fill="none"/>
            </svg>
          </div>
          <h3>Nenhuma consulta registrada</h3>
          <p>Clique em "Nova Consulta" para começar</p>
          <button className="btn btn-primary" onClick={openNew} style={{ marginTop:8 }}><Plus size={15}/> Nova Consulta</button>
        </div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Data</th><th>Cliente</th><th>Profissional</th><th>Rx (OD/OE)</th><th>Status</th><th>OS</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const st = STATUS_MAP[c.status] || STATUS_MAP['realizada'];
                  const rxOD = c.re_esf_longe != null ? `${c.re_esf_longe > 0 ? '+' : ''}${c.re_esf_longe}` : '—';
                  const rxOE = c.le_esf_longe != null ? `${c.le_esf_longe > 0 ? '+' : ''}${c.le_esf_longe}` : '—';
                  return (
                    <tr key={c.id} style={{ cursor:'pointer' }} onClick={() => openEdit(c)}>
                      <td style={{ fontSize:13 }}>{formatDate(c.date)}</td>
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
                        <span style={{ fontFamily:'monospace' }}>OD: {rxOD} / OE: {rxOE}</span>
                      </td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12,
                          fontWeight:600, padding:'4px 10px', borderRadius:20,
                          background:st.bg, color:st.color }}>
                          {st.icon} {st.label}
                        </span>
                      </td>
                      <td>
                        {c.generated_os ? (
                          <span style={{ fontSize:12, fontWeight:600, color:'#22c55e',
                            display:'flex', alignItems:'center', gap:4 }}>
                            <CheckCircle size={13}/> Sim
                          </span>
                        ) : (
                          <span style={{ fontSize:12, color:'var(--text-muted)' }}>Não</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <IconBtn onClick={() => openEdit(c)} title="Ver/Editar" color="#6366f1">
                            <Edit2 size={14}/>
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
            {filtered.length} consulta(s) exibida(s)
          </div>
        </div>
       )}

      {showModal && (
        <NovaConsultaModal
          initial={selected}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

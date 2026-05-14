import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Plus, Eye, Search, ChevronRight } from 'lucide-react';
import { formatDate } from '../../types/index';
import type { Consultation, Customer } from '../../types/index';
import NovaConsultaModal from './NovaConsultaModal';
import toast from 'react-hot-toast';

export default function ConsultaPage() {
  const { tenantId } = useAuth();
  const [consultations, setConsultations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('consultations')
      .select('*, customers(name, phone)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    setConsultations(data ?? []);
    setLoading(false);
  };

  const filtered = consultations.filter(c =>
    !search || c.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor: Record<string,string> = {
    agendada:'var(--info)', realizada:'var(--success)', cancelada:'var(--danger)'
  };

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Consulta / Receituário</h1><p className="page-sub">{consultations.length} registros</p></div>
        <button className="btn btn-primary" onClick={() => { setSelected(null); setShowModal(true); }}><Plus size={16} /> Nova Consulta</button>
      </div>

      <div className="search-bar" style={{ marginBottom:20 }}>
        <Search size={15} />
        <input className="form-input" placeholder="Buscar por cliente..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">👁️</div><h3>Nenhuma consulta registrada</h3><p>Clique em "Nova Consulta" para começar</p></div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Cliente</th><th>Profissional</th><th>Status</th><th>OS Gerada</th><th></th></tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ cursor:'pointer' }} onClick={() => { setSelected(c); setShowModal(true); }}>
                    <td>{formatDate(c.date)}</td>
                    <td><strong>{c.customer_name}</strong></td>
                    <td style={{ color:'var(--text2)' }}>{c.professional_name || '—'}</td>
                    <td><span className="badge" style={{ background:`${statusColor[c.status]}20`, color:statusColor[c.status] }}>{c.status}</span></td>
                    <td>{c.generated_os ? <span className="badge badge-success">✅ Sim</span> : <span className="badge badge-gray">Não</span>}</td>
                    <td><ChevronRight size={14} style={{ color:'var(--text2)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
       )}

      {showModal && <NovaConsultaModal initial={selected} onClose={() => setShowModal(false)} onSaved={load} />}
    </div>
  );
}

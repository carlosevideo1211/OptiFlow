import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import type { Customer } from '../../types/index';
import { Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props { onClose: () => void; onSaved: () => void; }

export default function NovaConsultaModal({ onClose, onSaved }: Props) {
  const { tenantId, user } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState('realizada');
  const [professionalName, setProfessionalName] = useState(user?.full_name || '');

  useEffect(() => {
    supabase.from('customers').select('id, name, phone')
      .eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setCustomers((data as Customer[]) ?? []));
  }, [tenantId]);

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleIniciar = () => {
    if (!selected) { toast.error('Selecione um cliente'); return; }
    if (!professionalName.trim()) { toast.error('Informe o nome do profissional'); return; }
    onClose();
    navigate('/consulta/atendimento/novo', {
      state: {
        customerId: selected.id,
        customerName: selected.name,
        professionalId: user?.id,
        professionalName: professionalName.trim(),
        date,
        status,
      }
    });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480, width: '95%' }}>
        <div className="modal-header">
          <h3>Nova Consulta</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">

          {/* Cliente */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Cliente *</label>
            {selected ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(99,102,241,.1)', padding:'10px 14px', borderRadius:8, border:'1px solid #6366f1' }}>
                <strong style={{ flex:1 }}>{selected.name}</strong>
                <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }} onClick={() => setSelected(null)}><X size={14} /></button>
              </div>
            ) : (
              <div>
                <div className="search-bar" style={{ marginBottom:8 }}>
                  <Search size={14} />
                  <input className="form-input" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                {search && (
                  <div style={{ background:'var(--bg-card)', borderRadius:8, border:'1px solid var(--border)', maxHeight:160, overflowY:'auto' }}>
                    {filtered.slice(0,8).map(c => (
                      <div key={c.id} onClick={e => { e.preventDefault(); e.stopPropagation(); setSelected(c); setSearch(''); }}
                        style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:13 }}
                        onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background='')}>
                        {c.name}
                      </div>
                    ))}
                    {filtered.length === 0 && <div style={{ padding:'10px 14px', color:'var(--text-muted)', fontSize:13 }}>Nenhum cliente encontrado</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Profissional */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Atendido por (Médico / Optometrista) *</label>
            <input
              className="form-input"
              placeholder="Digite o nome do profissional"
              value={professionalName}
              onChange={e => setProfessionalName(e.target.value)}
            />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group">
              <label className="form-label">Data</label>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="realizada">Realizada</option>
                <option value="agendada">Agendada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleIniciar}>
            Iniciar Atendimento
          </button>
        </div>
      </div>
    </div>
  );
}

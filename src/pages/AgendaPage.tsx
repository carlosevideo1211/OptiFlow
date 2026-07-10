import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, X, Save, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { norm } from '../utils/normalize';

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const HORARIOS = ['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00'];
const PROCEDIMENTOS = ['Consulta','Retorno','Segunda Via da Receita'];

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  agendada:  { bg: 'rgba(99,102,241,.2)',   color: '#a5b4fc', border: '#6366f1' },
  realizada: { bg: 'rgba(34,197,94,.15)',   color: '#86efac', border: '#22c55e' },
  cancelada: { bg: 'rgba(248,113,113,.15)', color: '#fca5a5', border: '#f87171' },
};

function getWeekDates(baseDate: Date) {
  const day = baseDate.getDay();
  const start = new Date(baseDate);
  start.setDate(baseDate.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

function emptyForm() {
  return {
    customer_id: '', customer_name: '',
    professional_name: '',
    procedure_type: 'Consulta',
    date: new Date().toISOString().split('T')[0],
    time: '08:00',
    time_end: '08:30',
    notes: '',
  };
}

export default function AgendaPage() {
  const { tenantId, user } = useAuth();
  const navigate = useNavigate();
  const [baseDate, setBaseDate] = useState(new Date());
  const [consultas, setConsultas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [searchClient, setSearchClient] = useState('');

  const weekDates = getWeekDates(baseDate);
  const weekStart = fmt(weekDates[0]);
  const weekEnd = fmt(weekDates[6]);
  const today = fmt(new Date());

  const loadConsultas = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from('consultations')
      .select('id, customer_name, professional_name, date, time, time_end, status, procedure_type')
      .eq('tenant_id', tenantId)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('time', { ascending: true });
    setConsultas(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!tenantId) return;
    loadConsultas();
    supabase.from('professionals').select('id,name,specialty').eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setProfessionals(data || []));
    fetchAllRows<{id:string;name:string}>((from, to) => supabase.from('customers').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name').range(from, to))
      .then(data => setCustomers(data || []));
  }, [tenantId, weekStart, weekEnd]);

  const prevWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate()-7); setBaseDate(d); };
  const nextWeek = () => { const d = new Date(baseDate); d.setDate(d.getDate()+7); setBaseDate(d); };

  const semanaLabel = () => {
    const s = weekDates[0]; const e = weekDates[6];
    if (s.getMonth() === e.getMonth())
      return `${s.getDate()} – ${e.getDate()} de ${MESES[s.getMonth()]} de ${s.getFullYear()}`;
    return `${s.getDate()} de ${MESES[s.getMonth()]} – ${e.getDate()} de ${MESES[e.getMonth()]} de ${e.getFullYear()}`;
  };

  const getSlot = (date: string, hora: string) =>
    consultas.filter(c => c.date === date && c.time === hora);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const filteredClients = customers.filter(c =>
    searchClient.length > 1 && norm(c.name).includes(norm(searchClient))
  );

  const handleSave = async () => {
    if (saving) return;
      if (!form.customer_name.trim()) { toast.error('Selecione o paciente'); return; }
    if (!form.professional_name.trim()) { toast.error('Selecione o profissional'); return; }
    if (!form.date) { toast.error('Informe a data'); return; }
    if (!form.time) { toast.error('Informe o horário de início'); return; }
    if (!form.time_end) { toast.error('Informe o horário de fim'); return; }
    if (form.time >= form.time_end) { toast.error('Horário fim deve ser maior que início'); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from('consultations').insert([{
        tenant_id: tenantId,
        customer_id: form.customer_id || null,
        customer_name: form.customer_name,
        professional_name: form.professional_name,
        procedure_type: form.procedure_type,
        date: form.date,
        time: form.time,
        time_end: form.time_end,
        status: 'agendada',
        notes: form.notes || null,
      }]);
      if (error) throw error;
      toast.success('Agendamento criado!');
      setShowModal(false);
      setForm(emptyForm());
      setSearchClient('');
      loadConsultas();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', margin: '-28px -32px', padding: 0 }}>

      {/* Header */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={prevWeek} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--text)', display: 'flex' }}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={nextWeek} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--text)', display: 'flex' }}>
            <ChevronRight size={16} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{semanaLabel()}</span>
          <button onClick={() => setBaseDate(new Date())} style={{ background: 'rgba(99,102,241,.15)', border: '1px solid #6366f1', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', color: '#a5b4fc', fontSize: 12, fontWeight: 600 }}>
            Hoje
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando...</span>}
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{consultas.length} na semana</span>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Plus size={14} /> Novo Agendamento
          </button>
        </div>
      </div>

      {/* Calendário */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)' }}>
            <tr>
              <th style={{ width: 64, padding: '10px 8px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>HORA</th>
              {weekDates.map((d, i) => {
                const isToday = fmt(d) === today;
                const count = consultas.filter(c => c.date === fmt(d)).length;
                return (
                  <th key={i} style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', textAlign: 'center', background: isToday ? 'rgba(99,102,241,.08)' : undefined }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{DIAS[i]}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: isToday ? '#6366f1' : 'var(--text)', width: 32, height: 32, borderRadius: '50%', background: isToday ? 'rgba(99,102,241,.2)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0' }}>
                      {d.getDate()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{d.getDate()}/{d.getMonth()+1}</div>
                    {count > 0 && <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, marginTop: 2 }}>{count} consulta{count > 1 ? 's' : ''}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {HORARIOS.map(hora => (
              <tr key={hora} style={{ height: 52 }}>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', verticalAlign: 'top', paddingTop: 6, whiteSpace: 'nowrap' }}>
                  {hora}
                </td>
                {weekDates.map((d, i) => {
                  const dateStr = fmt(d);
                  const isToday = dateStr === today;
                  const slots = getSlot(dateStr, hora);
                  return (
                    <td key={i} style={{ borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', padding: '2px 3px', verticalAlign: 'top', background: isToday ? 'rgba(99,102,241,.03)' : undefined }}>
                      {slots.map(c => {
                        const colors = STATUS_COLORS[c.status] || STATUS_COLORS['agendada'];
                        return (
                          <div key={c.id} onClick={() => navigate('/consulta/atendimento/' + c.id)}
                            style={{ background: colors.bg, border: '1px solid ' + colors.border, borderRadius: 6, padding: '4px 6px', marginBottom: 2, cursor: 'pointer', fontSize: 11, lineHeight: 1.3 }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                            <div style={{ fontWeight: 700, color: colors.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ✓ {c.customer_name}
                            </div>
                            {c.professional_name && (
                              <div style={{ color: 'var(--text-muted)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.professional_name}
                              </div>
                            )}
                            {c.procedure_type && (
                              <div style={{ color: colors.color, fontSize: 10, opacity: 0.8 }}>{c.procedure_type}</div>
                            )}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '8px 24px', display: 'flex', gap: 20, flexShrink: 0 }}>
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: colors.bg, border: '1px solid ' + colors.border }} />
            <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{status}</span>
          </div>
        ))}
      </div>

      {/* Modal Novo Agendamento */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 500, width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Novo Agendamento</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Profissional */}
              <div>
                <label className="form-label">Selecione o profissional *</label>
                {professionals.length > 0 ? (
                  <select className="form-input" value={form.professional_name} onChange={e => set('professional_name', e.target.value)}>
                    <option value="">Selecione um profissional...</option>
                    {professionals.map(p => (
                      <option key={p.id} value={p.name}>{p.name}{p.specialty ? ' — ' + p.specialty : ''}</option>
                    ))}
                  </select>
                ) : (
                  <input className="form-input" placeholder="Nome do profissional" value={form.professional_name} onChange={e => set('professional_name', e.target.value)} />
                )}
              </div>

              {/* Procedimento */}
              <div>
                <label className="form-label">Selecione o procedimento *</label>
                <select className="form-input" value={form.procedure_type} onChange={e => set('procedure_type', e.target.value)}>
                  {PROCEDIMENTOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Paciente */}
              <div style={{ position: 'relative' }}>
                <label className="form-label">Selecione o paciente *</label>
                {form.customer_name && form.customer_id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(99,102,241,.1)', padding: '10px 14px', borderRadius: 8, border: '1px solid #6366f1' }}>
                    <strong style={{ flex: 1 }}>{form.customer_name}</strong>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { set('customer_name', ''); set('customer_id', ''); setSearchClient(''); }}><X size={14} /></button>
                  </div>
                ) : (
                  <div>
                    <div className="search-bar">
                      <Search size={14} />
                      <input className="form-input" placeholder="Buscar paciente..." value={searchClient} onChange={e => { setSearchClient(e.target.value); set('customer_name', e.target.value); set('customer_id', ''); }} />
                    </div>
                    {filteredClients.length > 0 && (
                      <div style={{ background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 140, overflowY: 'auto', marginTop: 4 }}>
                        {filteredClients.slice(0, 6).map(c => (
                          <div key={c.id} onClick={() => { set('customer_id', c.id); set('customer_name', c.name); setSearchClient(''); }}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}>
                            {c.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Data */}
              <div>
                <label className="form-label">Data *</label>
                <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>

              {/* Horários */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Horário de Início *</label>
                  <select className="form-input" value={form.time} onChange={e => set('time', e.target.value)}>
                    {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Horário de Fim *</label>
                  <select className="form-input" value={form.time_end} onChange={e => set('time_end', e.target.value)}>
                    {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {form.time >= form.time_end && (
                    <div style={{ fontSize: 11, color: '#f87171', marginTop: 3 }}>Horário fim deve ser maior que início</div>
                  )}
                </div>
              </div>

              {/* Observação */}
              <div>
                <label className="form-label">Observação</label>
                <textarea className="form-input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observações sobre o agendamento..." />
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Fechar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

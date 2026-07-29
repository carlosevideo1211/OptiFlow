import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Clock, User, Stethoscope, Handshake, RefreshCw, XCircle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FilaEsperaConsultas() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().split('T')[0];
    const [{ data: consultas }, { data: partnerships }] = await Promise.all([
      supabase.from('consultations').select('*')
        .eq('tenant_id', tenantId).eq('date', hoje).eq('status', 'agendada')
        .order('time', { ascending: true }),
      supabase.from('partnerships').select('id,name').eq('tenant_id', tenantId),
    ]);

    const partnerMap: Record<string, string> = {};
    (partnerships || []).forEach((p: any) => { partnerMap[p.id] = p.name; });

    const customerIds = Array.from(new Set((consultas || []).map((c: any) => c.customer_id).filter(Boolean)));
    let custMap: Record<string, any> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase.from('customers').select('id,city,birth_date').in('id', customerIds);
      (customers || []).forEach((c: any) => { custMap[c.id] = c; });
    }

    const enriched = (consultas || []).map((c: any) => {
      const cust = c.customer_id ? custMap[c.customer_id] : null;
      const idade = cust?.birth_date
        ? Math.floor((Date.now() - new Date(cust.birth_date + 'T00:00:00').getTime()) / (365.25 * 24 * 3600 * 1000))
        : null;
      return { ...c, cidade: cust?.city || null, idade, partnership_name: c.partnership_id ? partnerMap[c.partnership_id] : null };
    });

    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const atender = (id: string) => navigate('/consulta/atendimento/' + id);

  const cancelar = async (c: any) => {
    if (!confirm('Cancelar o agendamento de "' + c.customer_name + '"?')) return;
    const { error } = await supabase.from('consultations').update({ status: 'cancelada' }).eq('id', c.id);
    if (error) { toast.error('Erro ao cancelar'); return; }
    toast.success('Agendamento cancelado');
    load();
  };

  const agora = new Date();
  const horaAtual = agora.getHours() * 60 + agora.getMinutes();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>Fila de Espera — Hoje</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {rows.length} paciente{rows.length !== 1 ? 's' : ''} aguardando atendimento
          </p>
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Carregando...</p></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Clock size={40} /></div>
          <h3>Nenhum paciente na fila hoje.</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Agendamentos de hoje com status "Agendada" aparecem aqui automaticamente.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(c => {
            const [hh, mm] = (c.time || '00:00').split(':').map((n: string) => parseInt(n));
            const minutos = hh * 60 + mm;
            const atrasado = minutos < horaAtual;
            return (
              <div key={c.id} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, borderLeft: `3px solid ${atrasado ? '#f87171' : '#6366f1'}` }}>
                <div style={{ minWidth: 70, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: atrasado ? '#f87171' : undefined }}>{c.time?.slice(0, 5)}</div>
                  {atrasado && <div style={{ fontSize: 10, color: '#f87171' }}>atrasado</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={14} /> {c.customer_name}
                    {c.idade != null && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 13 }}>· {c.idade} anos</span>}
                    {c.cidade && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 13 }}>· {c.cidade}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Stethoscope size={13} /> {c.professional_name || '—'}</span>
                    <span>{c.procedure_type || 'Consulta'}</span>
                    {c.partnership_name && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Handshake size={13} /> {c.partnership_name}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => cancelar(c)} title="Cancelar"
                    style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', color: '#f87171', display: 'flex', alignItems: 'center' }}>
                    <XCircle size={15} />
                  </button>
                  <button className="btn btn-primary" onClick={() => atender(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Atender <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

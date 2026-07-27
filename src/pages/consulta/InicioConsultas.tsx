import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  Users, CalendarCheck, ClipboardCheck, DollarSign, Cake, AlertTriangle,
  MessageCircle, ArrowRight, CalendarClock,
} from 'lucide-react';

const WHATSAPP_SUPORTE = '5592992779106';

function KpiCard({ icon: Icon, color, value, label }: any) {
  return (
    <div className="card" style={{ padding: 18, borderTop: `3px solid ${color}` }}>
      <div style={{ color, marginBottom: 6 }}><Icon size={22} /></div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

interface Props { onVerTodasConsultas: () => void; }

export default function InicioConsultas({ onVerTodasConsultas }: Props) {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ pacientes: 0, agendamentosHoje: 0, realizadasHoje: 0, totalMes: 0 });
  const [proximas, setProximas] = useState<any[]>([]);
  const [aniversariantes, setAniversariantes] = useState<any[]>([]);
  const [vencendoHoje, setVencendoHoje] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoading(true);
      const hoje = new Date();
      const hojeStr = hoje.toISOString().split('T')[0];
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
      const hoje12MesesAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate()).toISOString().split('T')[0];

      // Pacientes únicos (quem já tem consulta) — busca só a coluna customer_id, dedupe no cliente
      const { data: todosIds } = await supabase.from('consultations').select('customer_id').eq('tenant_id', tenantId);
      const pacientesUnicos = [...new Set((todosIds ?? []).map((r: any) => r.customer_id).filter(Boolean))];

      const { count: agendamentosHoje } = await supabase.from('consultations')
        .select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'agendada').eq('date', hojeStr);

      const { count: realizadasHoje } = await supabase.from('consultations')
        .select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'realizada').eq('date', hojeStr);

      const { data: mesData } = await supabase.from('consultations')
        .select('valor').eq('tenant_id', tenantId).gte('date', inicioMes).lte('date', fimMes);
      const totalMes = (mesData ?? []).reduce((acc: number, r: any) => acc + (parseFloat(r.valor) || 0), 0);

      const { data: proximasData } = await supabase.from('consultations')
        .select('id, customer_name, professional_name, date')
        .eq('tenant_id', tenantId).eq('status', 'agendada').gte('date', hojeStr)
        .order('date', { ascending: true }).limit(5);

      const { data: vencendoData } = await supabase.from('consultations')
        .select('id, customer_id, customer_name, professional_name, date')
        .eq('tenant_id', tenantId).eq('date', hoje12MesesAtras);

      let vencendoComTelefone: any[] = vencendoData ?? [];
      const idsVencendo = [...new Set(vencendoComTelefone.map((v: any) => v.customer_id).filter(Boolean))];
      if (idsVencendo.length > 0) {
        const { data: telefonesData } = await supabase.from('customers')
          .select('id, phone, whatsapp').in('id', idsVencendo);
        const telefoneMap = new Map((telefonesData ?? []).map((c: any) => [c.id, c.whatsapp || c.phone]));
        vencendoComTelefone = vencendoComTelefone.map((v: any) => ({ ...v, telefone: telefoneMap.get(v.customer_id) }));
      }

      let aniversariantesHoje: any[] = [];
      if (pacientesUnicos.length > 0) {
        const { data: customersData } = await supabase.from('customers')
          .select('id, name, phone, birth_date').in('id', pacientesUnicos);
        aniversariantesHoje = (customersData ?? []).filter((c: any) => {
          if (!c.birth_date) return false;
          const bd = new Date(c.birth_date + 'T00:00:00');
          return bd.getMonth() === hoje.getMonth() && bd.getDate() === hoje.getDate();
        });
      }

      setKpis({ pacientes: pacientesUnicos.length, agendamentosHoje: agendamentosHoje ?? 0, realizadasHoje: realizadasHoje ?? 0, totalMes });
      setProximas(proximasData ?? []);
      setVencendoHoje(vencendoComTelefone);
      setAniversariantes(aniversariantesHoje);
      setLoading(false);
    })();
  }, [tenantId]);

  if (loading) return <div className="empty-state"><p>Carregando...</p></div>;

  return (
    <div>
      {/* Faixa de suporte via WhatsApp */}
      <a
        href={`https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent('Olá! Preciso de ajuda com o módulo Consultas/Rx do OptiFlow.')}`}
        target="_blank" rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10,
          background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)',
          color: '#22c55e', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 20,
        }}>
        <MessageCircle size={16} /> Precisa de ajuda? Fale com o suporte no WhatsApp
      </a>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <KpiCard icon={Users} color="#6366f1" value={kpis.pacientes} label="Pacientes (total)" />
        <KpiCard icon={CalendarCheck} color="#06b6d4" value={kpis.agendamentosHoje} label="Agendamentos (hoje)" />
        <KpiCard icon={ClipboardCheck} color="#22c55e" value={kpis.realizadasHoje} label="Consultas Realizadas (hoje)" />
        <KpiCard icon={DollarSign} color="#f59e0b" value={`R$ ${kpis.totalMes.toFixed(2).replace('.', ',')}`} label="Total Consulta (mês)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Próximas Consultas */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarClock size={15} style={{ color: '#6366f1' }} /> Próximas Consultas
            </h4>
          </div>
          {proximas.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma consulta agendada.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {proximas.map(p => (
                <div key={p.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600 }}>{p.customer_name}</div>
                  <div style={{ color: 'var(--text-muted)' }}>{p.date} — {p.professional_name || 'Sem profissional'}</div>
                </div>
              ))}
            </div>
          )}
          <button onClick={onVerTodasConsultas} style={{
            display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
            color: '#6366f1', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
          }}>Ver lista completa <ArrowRight size={12} /></button>
        </div>

        {/* Aniversariantes do Dia */}
        <div className="card" style={{ padding: 18 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Cake size={15} style={{ color: '#ec4899' }} /> Aniversariantes do Dia
          </h4>
          {aniversariantes.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum aniversariante hoje.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aniversariantes.map(a => (
                <div key={a.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  {a.phone && <div style={{ color: 'var(--text-muted)' }}>{a.phone}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Consulta Vencendo Hoje */}
        <div className="card" style={{ padding: 18 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={15} style={{ color: '#f59e0b' }} /> Consulta Vencendo Hoje
          </h4>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}>Receita/prescrição com validade de 12 meses</p>
          {vencendoHoje.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma vencendo hoje.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vencendoHoje.map(v => {
                const msg = `Olá, ${v.customer_name}! Sua receita/prescrição feita em ${v.date} está completando 12 meses e pode precisar de revisão. Vamos agendar um retorno?`;
                const linkWhats = v.telefone ? `https://wa.me/55${String(v.telefone).replace(/\D/g, '')}?text=${encodeURIComponent(msg)}` : null;
                return (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{v.customer_name}</div>
                      <div style={{ color: 'var(--text-muted)' }}>Última consulta: {v.date}</div>
                    </div>
                    {linkWhats ? (
                      <a href={linkWhats} target="_blank" rel="noopener noreferrer" title="Notificar via WhatsApp" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6,
                        background: 'rgba(34,197,94,.12)', color: '#22c55e', flexShrink: 0,
                      }}><MessageCircle size={13} /></a>
                    ) : (
                      <span title="Sem telefone cadastrado" style={{ fontSize: 10, color: 'var(--text-muted)' }}>sem tel.</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

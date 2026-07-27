import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/fetchAll';
import { Search, Users } from 'lucide-react';
import { norm } from '../../utils/normalize';
import FichaPaciente from './FichaPaciente';

interface PacienteResumo {
  customer_id: string;
  name: string;
  phone?: string;
  qtd_consultas: number;
  ultima_consulta: string;
}

export default function PacientesTab() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [search, setSearch] = useState('');
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const cons = await fetchAllRows<any>((from, to) => supabase
      .from('consultations')
      .select('customer_id, customer_name, date')
      .eq('tenant_id', tenantId)
      .not('customer_id', 'is', null)
      .order('date', { ascending: false })
      .range(from, to));

    const map = new Map<string, PacienteResumo>();
    (cons || []).forEach((c: any) => {
      const existing = map.get(c.customer_id);
      if (existing) {
        existing.qtd_consultas += 1;
      } else {
        map.set(c.customer_id, {
          customer_id: c.customer_id,
          name: c.customer_name,
          qtd_consultas: 1,
          ultima_consulta: c.date,
        });
      }
    });

    const ids = Array.from(map.keys());
    if (ids.length > 0) {
      const { data: custs } = await supabase.from('customers').select('id, phone, whatsapp').in('id', ids);
      (custs || []).forEach((c: any) => {
        const p = map.get(c.id);
        if (p) p.phone = c.whatsapp || c.phone;
      });
    }

    const lista = Array.from(map.values()).sort((a, b) => (b.ultima_consulta || '').localeCompare(a.ultima_consulta || ''));
    setPacientes(lista);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return pacientes;
    const s = norm(search);
    return pacientes.filter(p => norm(p.name).includes(s) || (p.phone || '').includes(search.trim()));
  }, [pacientes, search]);

  if (selecionado) {
    return <FichaPaciente customerId={selecionado} onBack={() => { setSelecionado(null); load(); }} />;
  }

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'center' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Buscar paciente por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
          {filtered.length} paciente(s)
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><p>Carregando...</p></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Users size={40}/></div>
          <h3>Nenhum paciente encontrado.</h3>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:6 }}>
            Pacientes aparecem aqui assim que tiverem pelo menos uma consulta registrada.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Paciente</th><th>Telefone</th><th style={{ textAlign:'center' }}>Consultas</th><th style={{ textAlign:'center' }}>Última consulta</th></tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.customer_id} onClick={() => setSelecionado(p.customer_id)} style={{ cursor:'pointer' }}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'white' }}>
                          {(p.name || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight:500 }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={{ fontSize:13, color:'var(--text-muted)' }}>{p.phone || '—'}</td>
                    <td style={{ textAlign:'center', fontWeight:700, color:'#6366f1' }}>{p.qtd_consultas}</td>
                    <td style={{ textAlign:'center', fontSize:13, color:'var(--text-muted)' }}>
                      {p.ultima_consulta ? new Date(p.ultima_consulta + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

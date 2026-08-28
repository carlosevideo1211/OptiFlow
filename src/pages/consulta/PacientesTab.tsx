import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Stethoscope, X, Plus } from 'lucide-react';
import { norm } from '../../utils/normalize';
import FichaPaciente from './FichaPaciente';
import toast from 'react-hot-toast';

interface PacienteResumo {
  customer_id: string;
  name: string;
  phone?: string;
  qtd_consultas: number;
  ultima_consulta: string;
}

const POR_PAGINA = 50;

export default function PacientesTab() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pacientes, setPacientes] = useState<PacienteResumo[]>([]);
  const [search, setSearch] = useState('');
  const [pagina, setPagina] = useState(1);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [atenderPaciente, setAtenderPaciente] = useState<PacienteResumo | null>(null);
  const [atenderForm, setAtenderForm] = useState({ professional_id: '', procedure_id: '' });
  const [iniciando, setIniciando] = useState(false);
  // Cadastro rápido de Procedimento sem sair do modal "Iniciar atendimento" —
  // pedido da Samara (ela não encontrava onde cadastrar Procedimento e ficava
  // sem opção nenhuma pra escolher aqui).
  const [novoProcedimento, setNovoProcedimento] = useState<string | null>(null);
  const [salvandoProcedimento, setSalvandoProcedimento] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_pacientes_resumo', { p_tenant_id: tenantId });
    if (error) {
      console.error('Erro ao carregar pacientes:', error);
      setPacientes([]);
    } else {
      setPacientes((data as PacienteResumo[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);
  useEffect(() => { setPagina(1); }, [search]);
  useEffect(() => {
    if (!tenantId) return;
    supabase.from('professionals').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setProfessionals(data || []));
    supabase.from('procedures').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setProcedures(data || []));
  }, [tenantId]);

  const abrirAtender = (p: PacienteResumo, e: React.MouseEvent) => {
    e.stopPropagation();
    setAtenderForm({ professional_id: '', procedure_id: '' });
    setNovoProcedimento(null);
    setAtenderPaciente(p);
  };

  const salvarNovoProcedimento = async () => {
    const nome = (novoProcedimento || '').trim();
    if (!nome) { toast.error('Digite o nome do procedimento'); return; }
    setSalvandoProcedimento(true);
    const { data, error } = await supabase.from('procedures').insert([{
      tenant_id: tenantId, name: nome, active: true,
    }]).select('id,name').single();
    setSalvandoProcedimento(false);
    if (error || !data) { toast.error('Erro ao cadastrar procedimento'); return; }
    setProcedures(list => [...list, data].sort((a, b) => a.name.localeCompare(b.name)));
    setAtenderForm(f => ({ ...f, procedure_id: data.id }));
    setNovoProcedimento(null);
    toast.success('Procedimento cadastrado!');
  };

  const iniciarAtendimento = async () => {
    if (!atenderPaciente) return;
    if (!atenderForm.professional_id || !atenderForm.procedure_id) { toast.error('Selecione profissional e procedimento'); return; }
    setIniciando(true);
    const prof = professionals.find(p => p.id === atenderForm.professional_id);
    const proc = procedures.find(p => p.id === atenderForm.procedure_id);
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const { data, error } = await supabase.from('consultations').insert([{
      tenant_id: tenantId,
      customer_id: atenderPaciente.customer_id,
      customer_name: atenderPaciente.name,
      professional_id: atenderForm.professional_id,
      professional_name: prof?.name || '',
      procedure_id: atenderForm.procedure_id,
      procedure_type: proc?.name || 'Consulta',
      date: now.toISOString().split('T')[0],
      time: hhmm,
      time_end: hhmm,
      status: 'agendada',
    }]).select('id').single();
    setIniciando(false);
    if (error || !data) { toast.error('Erro ao iniciar atendimento'); return; }
    navigate('/consulta/atendimento/' + data.id);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return pacientes;
    const s = norm(search);
    return pacientes.filter(p => norm(p.name).includes(s) || (p.phone || '').includes(search.trim()));
  }, [pacientes, search]);

  const totalPaginas = Math.max(1, Math.ceil(filtered.length / POR_PAGINA));
  const pageItems = filtered.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

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
                <tr><th>Paciente</th><th>Telefone</th><th style={{ textAlign:'center' }}>Consultas</th><th style={{ textAlign:'center' }}>Última consulta</th><th style={{ textAlign:'right' }}>Ações</th></tr>
              </thead>
              <tbody>
                {pageItems.map(p => (
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
                    <td style={{ textAlign:'right' }}>
                      <button onClick={(e) => abrirAtender(p, e)} className="btn btn-primary" style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, padding:'6px 12px', marginLeft:'auto' }}>
                        <Stethoscope size={13}/> Atender
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
            {filtered.length} paciente(s) no total — Pag. {pagina}/{totalPaginas}
            <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:pagina===1?'transparent':'var(--primary)', color:pagina===1?'var(--text-muted)':'#fff', cursor:pagina===1?'not-allowed':'pointer', fontSize:12 }}>← Ant</button>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1).filter(n => Math.abs(n - pagina) <= 2).map(n => (
                <button key={n} onClick={() => setPagina(n)}
                  style={{ padding:'3px 8px', borderRadius:6, border:'1px solid var(--border)', background:n===pagina?'var(--primary)':'transparent', color:n===pagina?'#fff':'var(--text-muted)', cursor:'pointer', fontWeight:n===pagina?700:400, fontSize:12 }}>{n}</button>
              ))}
              <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:pagina===totalPaginas?'transparent':'var(--primary)', color:pagina===totalPaginas?'var(--text-muted)':'#fff', cursor:pagina===totalPaginas?'not-allowed':'pointer', fontSize:12 }}>Prox →</button>
            </div>
          </div>
        </div>
      )}

      {atenderPaciente && (
        <div className="modal-overlay" onClick={() => setAtenderPaciente(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: '95%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display:'flex', alignItems:'center', gap:8 }}><Stethoscope size={18}/> Iniciar atendimento</h2>
              <button onClick={() => setAtenderPaciente(null)}><X size={18}/></button>
            </div>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ fontSize:14 }}>Paciente: <strong>{atenderPaciente.name}</strong></div>
              <div>
                <label className="form-label">Profissional</label>
                <select className="form-input" value={atenderForm.professional_id} onChange={e => setAtenderForm(f => ({ ...f, professional_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <label className="form-label">Procedimento</label>
                  {novoProcedimento === null && (
                    <button type="button" onClick={() => setNovoProcedimento('')}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#6366f1', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:4, padding:0, marginBottom:6 }}>
                      <Plus size={12}/> Novo procedimento
                    </button>
                  )}
                </div>
                {novoProcedimento === null ? (
                  <>
                    {procedures.length === 0 && (
                      <p style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 6px' }}>
                        Nenhum procedimento cadastrado ainda — clique em "Novo procedimento" acima pra criar o primeiro (ex: Consulta, Retorno, Terapia Visual).
                      </p>
                    )}
                    <select className="form-input" value={atenderForm.procedure_id} onChange={e => setAtenderForm(f => ({ ...f, procedure_id: e.target.value }))}>
                      <option value="">Selecione...</option>
                      {procedures.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </>
                ) : (
                  <div style={{ display:'flex', gap:6 }}>
                    <input className="form-input" autoFocus value={novoProcedimento} onChange={e => setNovoProcedimento(e.target.value)}
                      placeholder="Ex: Retorno" onKeyDown={e => { if (e.key === 'Enter') salvarNovoProcedimento(); if (e.key === 'Escape') setNovoProcedimento(null); }} />
                    <button type="button" className="btn btn-primary" disabled={salvandoProcedimento} onClick={salvarNovoProcedimento} style={{ padding:'0 12px', fontSize:12 }}>
                      {salvandoProcedimento ? '...' : 'Salvar'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setNovoProcedimento(null)} style={{ padding:'0 10px', fontSize:12 }}>
                      <X size={13}/>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAtenderPaciente(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={iniciando} onClick={iniciarAtendimento}>{iniciando ? 'Iniciando...' : 'Iniciar atendimento'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


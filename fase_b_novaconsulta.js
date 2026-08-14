const fs = require('fs');
const path = 'src/pages/consulta/NovaConsultaModal.tsx';

// backup do arquivo atual
fs.copyFileSync(path, path + '.backup_fase_b');
console.log('Backup criado: ' + path + '.backup_fase_b');

const novoConteudo = `import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/fetchAll';
import type { Customer } from '../../types/index';
import { Search, X, UserPlus, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { norm } from '../../utils/normalize';

interface Props { onClose: () => void; onSaved: () => void; }

interface Professional { id: string; name: string; specialty?: string | null; }
interface Partnership { id: string; name: string; commission_percent?: number | null; }

type Step = 'paciente' | 'profissional' | 'pagamento';

function nowHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function addMinutes(hhmm: string, min: number) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m + min, 0, 0);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export default function NovaConsultaModal({ onClose, onSaved }: Props) {
  const { tenantId } = useAuth();
  const [step, setStep] = useState<Step>('paciente');
  const [saving, setSaving] = useState(false);

  // ── Paciente ──
  const [pacienteMode, setPacienteMode] = useState<'buscar' | 'novo'>('buscar');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [novoNascimento, setNovoNascimento] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');

  // ── Profissional ──
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState('');

  // ── Pagamento ──
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [partnershipId, setPartnershipId] = useState('');
  const [valorConsulta, setValorConsulta] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    fetchAllRows<Customer>((from, to) => supabase.from('customers').select('id, name, phone')
      .eq('tenant_id', tenantId).eq('active', true).order('name').range(from, to))
      .then((data) => setCustomers((data as Customer[]) ?? []));
    supabase.from('professionals').select('id,name,specialty').eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setProfessionals((data as Professional[]) || []));
    supabase.from('partnerships').select('id,name,commission_percent').eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setPartnerships((data as Partnership[]) || []));
  }, [tenantId]);

  const filtered = customers.filter(c => !search || norm(c.name).includes(norm(search)));

  const nomeExibicao = pacienteMode === 'buscar' ? (selected?.name || '') : novoNome;

  const irParaProfissional = () => {
    if (pacienteMode === 'buscar' && !selected) { toast.error('Selecione um paciente'); return; }
    if (pacienteMode === 'novo' && !novoNome.trim()) { toast.error('Informe o nome do paciente'); return; }
    setStep('profissional');
  };

  const irParaPagamento = () => {
    if (!professionalId) { toast.error('Selecione o profissional'); return; }
    setStep('pagamento');
  };

  const finalizar = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let customerId = selected?.id || null;
      let customerName = nomeExibicao.trim();

      if (pacienteMode === 'novo') {
        const { data: novo, error: custErr } = await supabase.from('customers').insert([{
          tenant_id: tenantId, name: novoNome.trim(),
          birth_date: novoNascimento || null, phone: novoTelefone || null, active: true,
        }]).select().single();
        if (custErr) throw custErr;
        customerId = novo.id;
        customerName = novo.name;
      }

      const prof = professionals.find(p => p.id === professionalId);
      const time = nowHHMM();
      const valor = valorConsulta ? Number(valorConsulta.replace(',', '.')) : null;

      const { error } = await supabase.from('consultations').insert([{
        tenant_id: tenantId,
        customer_id: customerId, customer_name: customerName,
        professional_id: professionalId, professional_name: prof?.name || '',
        procedure_type: 'Consulta',
        partnership_id: partnershipId || null,
        valor_cobrado: valor,
        date: new Date().toISOString().split('T')[0],
        time, time_end: addMinutes(time, 30),
        status: 'agendada',
      }]);
      if (error) throw error;

      toast.success(customerName + ' adicionado(a) à Fila de Espera de hoje!');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar atendimento');
    } finally {
      setSaving(false);
    }
  };

  const StepDot = ({ s, label }: { s: Step; label: string }) => {
    const ordem: Step[] = ['paciente', 'profissional', 'pagamento'];
    const atual = ordem.indexOf(step);
    const desta = ordem.indexOf(s);
    const ativo = s === step;
    const feito = desta < atual;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
          background: ativo ? '#6366f1' : feito ? 'rgba(34,197,94,.2)' : 'rgba(255,255,255,.08)',
          color: ativo ? '#fff' : feito ? '#22c55e' : 'var(--text-muted)',
        }}>
          {feito ? <Check size={12} /> : desta + 1}
        </div>
        <span style={{ fontSize: 12, fontWeight: ativo ? 700 : 500, color: ativo ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480, width: '95%' }}>
        <div className="modal-header">
          <h3>Nova Consulta</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '14px 20px 0' }}>
          <StepDot s="paciente" label="Paciente" />
          <StepDot s="profissional" label="Profissional" />
          <StepDot s="pagamento" label="Pagamento" />
        </div>

        <div className="modal-body">

          {step === 'paciente' && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                <button onClick={() => setPacienteMode('buscar')} style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  background: pacienteMode === 'buscar' ? 'var(--accent)' : 'rgba(255,255,255,.06)',
                  color: pacienteMode === 'buscar' ? '#fff' : 'var(--text)', border: '1px solid var(--border)',
                }}>Buscar paciente</button>
                <button onClick={() => setPacienteMode('novo')} style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  background: pacienteMode === 'novo' ? 'var(--accent)' : 'rgba(255,255,255,.06)',
                  color: pacienteMode === 'novo' ? '#fff' : 'var(--text)', border: '1px solid var(--border)',
                }}><UserPlus size={14} /> Cadastrar novo</button>
              </div>

              {pacienteMode === 'buscar' ? (
                selected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(99,102,241,.1)', padding: '10px 14px', borderRadius: 8, border: '1px solid #6366f1' }}>
                    <strong style={{ flex: 1 }}>{selected.name}</strong>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setSelected(null)}><X size={14} /></button>
                  </div>
                ) : (
                  <div>
                    <div className="search-bar" style={{ marginBottom: 8 }}>
                      <Search size={14} />
                      <input className="form-input" placeholder="Buscar paciente..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    {search && (
                      <div style={{ background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 160, overflowY: 'auto' }}>
                        {filtered.slice(0, 8).map(c => (
                          <div key={c.id} onClick={e => { e.preventDefault(); e.stopPropagation(); setSelected(c); setSearch(''); }}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}>
                            {c.name}
                          </div>
                        ))}
                        {filtered.length === 0 && <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum paciente encontrado</div>}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Nome *</label>
                    <input className="form-input" value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Data de nascimento</label>
                      <input className="form-input" type="date" value={novoNascimento} onChange={e => setNovoNascimento(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Telefone</label>
                      <input className="form-input" value={novoTelefone} onChange={e => setNovoTelefone(e.target.value)} placeholder="(00) 00000-0000" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'profissional' && (
            <div className="form-group">
              <label className="form-label">Atendido por *</label>
              {professionals.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Nenhum profissional cadastrado. Cadastre em Configurações → Cadastros.
                </p>
              ) : (
                <select className="form-input" value={professionalId} onChange={e => setProfessionalId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {professionals.map(p => <option key={p.id} value={p.id}>{p.name}{p.specialty ? \` — \${p.specialty}\` : ''}</option>)}
                </select>
              )}
            </div>
          )}

          {step === 'pagamento' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Convênio / Parceria (opcional)</label>
                <select className="form-input" value={partnershipId} onChange={e => setPartnershipId(e.target.value)}>
                  <option value="">Particular</option>
                  {partnerships.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Valor da consulta (R$)</label>
                <input className="form-input" value={valorConsulta} onChange={e => setValorConsulta(e.target.value)} placeholder="Ex: 80,00" />
              </div>
            </div>
          )}

        </div>

        <div className="modal-footer">
          {step !== 'paciente' && (
            <button className="btn btn-secondary" onClick={() => setStep(step === 'pagamento' ? 'profissional' : 'paciente')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={14} /> Voltar
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          {step === 'paciente' && (
            <button className="btn btn-primary" onClick={irParaProfissional} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Avançar <ArrowRight size={14} />
            </button>
          )}
          {step === 'profissional' && (
            <button className="btn btn-primary" onClick={irParaPagamento} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Avançar <ArrowRight size={14} />
            </button>
          )}
          {step === 'pagamento' && (
            <button className="btn btn-primary" onClick={finalizar} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? 'Salvando...' : 'Adicionar à Fila de Espera'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(path, novoConteudo, 'utf8');
console.log(path + ': reescrito com sucesso');
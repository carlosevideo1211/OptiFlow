import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';

// Perfis reutilizáveis com checkbox binário por módulo (v1, sem
// granularidade de ação — decisão já registrada no cronograma).
// Vínculo fica em `funcionarios.perfil_id` (não em `professionals`),
// porque perfis como "Atendente" não são profissionais de saúde.

const MODULOS = [
  { key: 'agenda', label: 'Agenda' },
  { key: 'pagamentos', label: 'Pagamentos' },
  { key: 'pacientes', label: 'Pacientes' },
  { key: 'consultas', label: 'Consultas' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'notas_fiscais', label: 'Notas Fiscais' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'clinica', label: 'Clínica' },
  { key: 'inicio_widgets', label: 'Início / Widgets' },
  // Diferente dos demais: nulo/sem perfil = OCULTO por padrao (nao visivel),
  // nao "ve tudo" - decisao consciente de 04/08/2026, dado que e a tela que
  // fiscaliza o que os proprios funcionarios fizeram no sistema.
  { key: 'auditoria', label: 'Auditoria (padrão: oculto)' },
];

interface Perfil {
  id?: string;
  tenant_id?: string;
  nome: string;
  modulos: string[];
  ativo: boolean;
}

const EMPTY: Perfil = { nome: '', modulos: [], ativo: true };

function Modal({ initial, onClose, onSave }: { initial: Perfil; onClose: () => void; onSave: (p: Perfil) => void }) {
  const [f, setF] = useState<Perfil>(initial);

  const toggleModulo = (key: string) => setF(p => ({
    ...p,
    modulos: p.modulos.includes(key) ? p.modulos.filter(m => m !== key) : [...p.modulos, key],
  }));

  const toggleTodos = () => setF(p => ({
    ...p,
    modulos: p.modulos.length === MODULOS.length ? [] : MODULOS.map(m => m.key),
  }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="card" style={{ padding: 24, width: 520, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={17} style={{ color: '#6366f1' }} /> {initial.id ? 'Editar Perfil' : 'Novo Perfil'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Nome do Perfil *</label>
          <input className="form-input" value={f.nome} onChange={e => setF(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Administrador, Atendente, Optometrista" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>Módulos liberados</label>
          <button type="button" onClick={toggleTodos} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {f.modulos.length === MODULOS.length ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {MODULOS.map(m => {
            const checked = f.modulos.includes(m.key);
            return (
              <label key={m.key} onClick={() => toggleModulo(m.key)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                border: '1px solid ' + (checked ? '#6366f1' : 'var(--border)'),
                background: checked ? 'rgba(99,102,241,.1)' : 'transparent',
                cursor: 'pointer', fontSize: 13,
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: '1.5px solid ' + (checked ? '#6366f1' : 'var(--border)'),
                  background: checked ? '#6366f1' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <Check size={11} color="#fff" />}
                </div>
                {m.label}
              </label>
            );
          })}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div onClick={() => setF(p => ({ ...p, ativo: !p.ativo }))} style={{
            width: 40, height: 22, borderRadius: 12, background: f.ativo ? '#22c55e' : 'var(--border)',
            position: 'relative', transition: 'all .2s',
          }}>
            <div style={{ position: 'absolute', top: 2, left: f.ativo ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'all .2s' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Ativo</span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(f)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

export default function PermissoesConsultas() {
  const { tenantId } = useAuth();
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Perfil | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase.from('clinic_permission_profiles').select('*').eq('tenant_id', tenantId).order('nome');
    if (error) toast.error('Erro ao carregar perfis: ' + error.message);
    setPerfis(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const save = async (p: Perfil) => {
    if (!p.nome.trim()) return toast.error('Nome é obrigatório');
    const payload = { ...p, tenant_id: tenantId };
    const { error } = p.id
      ? await supabase.from('clinic_permission_profiles').update(payload).eq('id', p.id)
      : await supabase.from('clinic_permission_profiles').insert([payload]);
    if (error) return toast.error(error.message);
    toast.success('Perfil salvo!');
    setModal(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este perfil? Funcionários vinculados perderão o vínculo.')) return;
    const { error } = await supabase.from('clinic_permission_profiles').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Excluído!');
    load();
  };

  const labelFor = (key: string) => MODULOS.find(m => m.key === key)?.label ?? key;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>Permissões</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Perfis com acesso binário por módulo — vinculados em Cadastros → Funcionários
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ ...EMPTY })}>
          <Plus size={15} /> Novo Perfil
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
        ) : perfis.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Nenhum perfil cadastrado. Sugestão: Administrador, Atendente, Oftalmologista, Optometrista.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nome</th><th>Módulos liberados</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {perfis.map(p => (
                  <tr key={p.id} style={{ opacity: p.ativo ? 1 : .5 }}>
                    <td style={{ fontWeight: 600 }}>{p.nome}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 420 }}>
                        {p.modulos.length === 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum</span>
                        ) : p.modulos.length === MODULOS.length ? (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'rgba(34,197,94,.12)', color: '#22c55e' }}>Todos</span>
                        ) : p.modulos.map(m => (
                          <span key={m} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'rgba(99,102,241,.14)', color: '#6366f1' }}>
                            {labelFor(m)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                        background: p.ativo ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.06)',
                        color: p.ativo ? '#22c55e' : 'var(--text-muted)',
                      }}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => setModal(p)} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#6366f1' }}><Edit2 size={13} /></button>
                        <button onClick={() => remove(p.id!)} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#f87171' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && <Modal initial={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

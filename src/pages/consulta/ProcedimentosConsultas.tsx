import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Stethoscope, Plus, Search, Edit2, Trash2, X, Clock, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

// Usa a tabela `procedures`, já existente antes desta sessão
// (name, default_price, duration_minutes, active) — enriquecida com
// cor de identificação (usada na Agenda) e campos fiscais de NFS-e
// (diferentes de fiscal_config, que é NF-e de mercadoria).

interface Procedimento {
  id?: string;
  tenant_id?: string;
  name: string;
  default_price: number | null;
  duration_minutes: number | null;
  cor: string;
  active: boolean;
  descricao_fiscal: string;
  item_lista_servico: string;
  codigo_servico_municipio: string;
  codigo_nbs: string;
  cnae: string;
}

const EMPTY: Procedimento = {
  name: '', default_price: null, duration_minutes: 30, cor: '#6366f1', active: true,
  descricao_fiscal: '', item_lista_servico: '', codigo_servico_municipio: '', codigo_nbs: '', cnae: '',
};

const CORES = ['#6366f1', '#06b6d4', '#22c55e', '#f59e0b', '#f87171', '#a855f7', '#ec4899', '#64748b'];

function Modal({ initial, onClose, onSave }: { initial: Procedimento; onClose: () => void; onSave: (p: Procedimento) => void }) {
  const [f, setF] = useState<Procedimento>(initial);
  const [showFiscal, setShowFiscal] = useState(false);
  const set = (k: keyof Procedimento, v: any) => setF(p => ({ ...p, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="card" style={{ padding: 24, width: 560, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Stethoscope size={17} style={{ color: '#6366f1' }} /> {initial.id ? 'Editar Procedimento' : 'Novo Procedimento'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Nome *</label>
            <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Consulta Oftalmológica" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Valor (R$)</label>
              <input className="form-input" type="number" step="0.01" value={f.default_price ?? ''}
                onChange={e => set('default_price', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="0.00" />
            </div>
            <div>
              <label className="form-label">Duração (minutos)</label>
              <input className="form-input" type="number" value={f.duration_minutes ?? ''}
                onChange={e => set('duration_minutes', e.target.value === '' ? null : parseInt(e.target.value))} placeholder="30" />
            </div>
          </div>

          <div>
            <label className="form-label">Cor de identificação (Agenda)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CORES.map(c => (
                <button key={c} type="button" onClick={() => set('cor', c)} style={{
                  width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: f.cor === c ? '3px solid #fff' : '1px solid rgba(255,255,255,.2)',
                  boxShadow: f.cor === c ? '0 0 0 2px ' + c : 'none',
                }} />
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
            <div onClick={() => set('active', !f.active)} style={{
              width: 40, height: 22, borderRadius: 12, background: f.active ? '#22c55e' : 'var(--border)',
              position: 'relative', transition: 'all .2s',
            }}>
              <div style={{ position: 'absolute', top: 2, left: f.active ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'all .2s' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Ativo</span>
          </label>

          <button type="button" onClick={() => setShowFiscal(s => !s)} style={{
            background: 'none', border: 'none', color: '#6366f1', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textAlign: 'left', padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 8,
          }}>
            {showFiscal ? '▾' : '▸'} Configurações NFS-e (fiscal)
          </button>

          {showFiscal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
              <div>
                <label className="form-label">Descrição fiscal</label>
                <input className="form-input" value={f.descricao_fiscal} onChange={e => set('descricao_fiscal', e.target.value)} placeholder="Descrição do serviço para a nota fiscal" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">Item Lista de Serviço (LC 116/03)</label>
                  <input className="form-input" value={f.item_lista_servico} onChange={e => set('item_lista_servico', e.target.value)} placeholder="Ex: 12.13" />
                </div>
                <div>
                  <label className="form-label">Código do serviço no município</label>
                  <input className="form-input" value={f.codigo_servico_municipio} onChange={e => set('codigo_servico_municipio', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">Código NBS</label>
                  <input className="form-input" value={f.codigo_nbs} onChange={e => set('codigo_nbs', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">CNAE</label>
                  <input className="form-input" value={f.cnae} onChange={e => set('cnae', e.target.value)} placeholder="0000-0/00" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(f)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

export default function ProcedimentosConsultas() {
  const { tenantId } = useAuth();
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Procedimento | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase.from('procedures').select('*').eq('tenant_id', tenantId).order('name');
    if (error) toast.error('Erro ao carregar procedimentos: ' + error.message);
    setProcedimentos(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const filtered = procedimentos.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const save = async (p: Procedimento) => {
    if (!p.name.trim()) return toast.error('Nome é obrigatório');
    const payload = { ...p, tenant_id: tenantId };
    const { error } = p.id
      ? await supabase.from('procedures').update(payload).eq('id', p.id)
      : await supabase.from('procedures').insert([payload]);
    if (error) return toast.error(error.message);
    toast.success('Procedimento salvo!');
    setModal(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este procedimento?')) return;
    const { error } = await supabase.from('procedures').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Excluído!');
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>Procedimentos</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Tipos de atendimento, valores e configuração fiscal (NFS-e)</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ ...EMPTY })}>
          <Plus size={15} /> Novo Procedimento
        </button>
      </div>

      <div className="search-bar" style={{ maxWidth: 320, marginBottom: 16 }}>
        <Search size={14} />
        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar procedimento..." />
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum procedimento cadastrado.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nome</th><th>Valor</th><th>Duração</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ opacity: p.active ? 1 : .5 }}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.cor || '#6366f1', flexShrink: 0 }} />
                        {p.name}
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {p.default_price != null ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><DollarSign size={11} />{p.default_price.toFixed(2).replace('.', ',')}</span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {p.duration_minutes != null ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} />{p.duration_minutes} min</span>
                      ) : '—'}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                        background: p.active ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.06)',
                        color: p.active ? '#22c55e' : 'var(--text-muted)',
                      }}>{p.active ? 'Ativo' : 'Inativo'}</span>
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

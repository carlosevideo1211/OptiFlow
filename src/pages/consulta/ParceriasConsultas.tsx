import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Handshake, Plus, Search, Edit2, Trash2, X, Phone, Mail, Percent } from 'lucide-react';
import toast from 'react-hot-toast';

// NOTA: esta tela usa a tabela `partnerships`, que já existia antes desta
// sessão e já é referenciada via FK por `consultations.partnership_id` e
// `clinic_financial_entries.partnership_id`. Não usar `clinic_partners`
// (tabela criada por engano nesta sessão, isolada, sem nenhuma conexão —
// será removida). Colunas em inglês (name/active) por serem as que já
// existiam na tabela original.

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

interface Parceria {
  id?: string;
  tenant_id?: string;
  name: string;
  telefone: string;
  email: string;
  responsavel: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  estado: string;
  commission_percent: number | null;
  active: boolean;
}

const EMPTY: Parceria = {
  name: '', telefone: '', email: '', responsavel: '', cnpj: '',
  endereco: '', cidade: '', estado: '', commission_percent: null, active: true,
};

function Modal({ initial, onClose, onSave }: { initial: Parceria; onClose: () => void; onSave: (p: Parceria) => void }) {
  const [f, setF] = useState<Parceria>(initial);
  const set = (k: keyof Parceria, v: any) => setF(p => ({ ...p, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="card" style={{ padding: 24, width: 560, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Handshake size={17} style={{ color: '#6366f1' }} /> {initial.id ? 'Editar Parceria' : 'Nova Parceria'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div><label className="form-label">Nome *</label>
              <input className="form-input" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Nome da ótica/indicador parceiro" /></div>
            <div><label className="form-label">CNPJ</label>
              <input className="form-input" value={f.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
          </div>
          <div><label className="form-label">Responsável</label>
            <input className="form-input" value={f.responsavel} onChange={e => set('responsavel', e.target.value)} placeholder="Nome do contato responsável" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="form-label">Telefone</label>
              <input className="form-input" value={f.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(92) 99999-0000" /></div>
            <div><label className="form-label">E-mail</label>
              <input className="form-input" type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="contato@parceiro.com" /></div>
          </div>
          <div><label className="form-label">Endereço</label>
            <input className="form-input" value={f.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, bairro" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label className="form-label">Cidade</label>
              <input className="form-input" value={f.cidade} onChange={e => set('cidade', e.target.value)} /></div>
            <div><label className="form-label">Estado</label>
              <select className="form-input" value={f.estado} onChange={e => set('estado', e.target.value)}>
                <option value="">...</option>{ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select></div>
            <div><label className="form-label">Comissão %</label>
              <input className="form-input" type="number" step="0.01" value={f.commission_percent ?? ''}
                onChange={e => set('commission_percent', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="0.00" /></div>
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
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(f)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

export default function ParceriasConsultas() {
  const { tenantId } = useAuth();
  const [parcerias, setParcerias] = useState<Parceria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Parceria | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase.from('partnerships').select('*').eq('tenant_id', tenantId).order('name');
    if (error) toast.error('Erro ao carregar parcerias: ' + error.message);
    setParcerias(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const filtered = parcerias.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const save = async (f: Parceria) => {
    const payload = { ...f, tenant_id: tenantId };
    const { error } = f.id
      ? await supabase.from('partnerships').update(payload).eq('id', f.id)
      : await supabase.from('partnerships').insert([payload]);
    if (error) return toast.error(error.message);
    toast.success('Parceria salva!');
    setModal(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir esta parceria?')) return;
    const { error } = await supabase.from('partnerships').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Excluída!');
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>Parcerias</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Indicadores e óticas parceiras</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ ...EMPTY })}>
          <Plus size={15} /> Nova Parceria
        </button>
      </div>

      <div className="search-bar" style={{ maxWidth: 320, marginBottom: 16 }}>
        <Search size={14} />
        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar parceria..." />
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma parceria cadastrada.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nome</th><th>Contato</th><th>Responsável</th><th>Cidade/UF</th><th>Comissão</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} style={{ opacity: p.active ? 1 : .5 }}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.telefone && <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={11} />{p.telefone}</div>}
                      {p.email && <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={11} />{p.email}</div>}
                    </td>
                    <td>{p.responsavel || '—'}</td>
                    <td>{p.cidade ? `${p.cidade}/${p.estado}` : '—'}</td>
                    <td>{p.commission_percent != null ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}><Percent size={11} />{p.commission_percent}</span>
                    ) : '—'}</td>
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

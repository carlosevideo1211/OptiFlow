import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  Wallet, CreditCard, TrendingUp, Users, Eye,
  Plus, Edit2, Trash2, Check, X
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Tipos ──
type FieldMap = { name: string; active: string };
type ExtraOption = { value: string; label: string };
type ExtraField = { column: string; options: ExtraOption[] };

// ── Hook genérico de CRUD por tabela, já com tenant_id automático ──
function useCrudTable(table: string, tenantId: string | null | undefined, fields: FieldMap) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from(table).select('*').eq('tenant_id', tenantId).order(fields.name);
    if (error) toast.error(`Erro ao carregar ${table}: ${error.message}`);
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const add = async (nome: string, extra?: { column: string; value: string }) => {
    if (!tenantId || !nome.trim()) return;
    const payload: any = { tenant_id: tenantId, [fields.name]: nome.trim(), [fields.active]: true };
    if (extra) payload[extra.column] = extra.value;
    const { error } = await supabase.from(table).insert([payload]);
    if (error) return toast.error(error.message);
    load();
  };

  const update = async (id: string, changes: any) => {
    const { error } = await supabase.from(table).update(changes).eq('id', id);
    if (error) return toast.error(error.message);
    load();
  };

  const toggleActive = async (item: any) => update(item.id, { [fields.active]: !item[fields.active] });

  const remove = async (id: string) => {
    if (!confirm('Excluir este item?')) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Excluído!');
    load();
  };

  return { items, loading, add, update, toggleActive, remove };
}

// ── Componente de lista genérico (nome + campo extra opcional + ativo) ──
function CrudList({
  icon: Icon, color, title, hint, table, fields, extraField,
}: {
  icon: any; color: string; title: string; hint?: string;
  table: string; fields: FieldMap; extraField?: ExtraField;
}) {
  const { tenantId } = useAuth();
  const { items, loading, add, update, toggleActive, remove } = useCrudTable(table, tenantId, fields);

  const [novoNome, setNovoNome] = useState('');
  const [novoExtra, setNovoExtra] = useState(extraField?.options[0]?.value ?? '');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editExtra, setEditExtra] = useState('');

  const labelFor = (v: string) => extraField?.options.find(o => o.value === v)?.label ?? v;

  const handleAdd = () => {
    if (!novoNome.trim()) return;
    add(novoNome, extraField ? { column: extraField.column, value: novoExtra } : undefined);
    setNovoNome('');
    setNovoExtra(extraField?.options[0]?.value ?? '');
  };

  const startEdit = (item: any) => {
    setEditId(item.id);
    setEditNome(item[fields.name]);
    setEditExtra(extraField ? item[extraField.column] : '');
  };

  const saveEdit = (id: string) => {
    const changes: any = { [fields.name]: editNome };
    if (extraField) changes[extraField.column] = editExtra;
    update(id, changes);
    setEditId(null);
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon size={16} style={{ color }} />
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h3>
      </div>
      {hint && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 14px' }}>{hint}</p>}

      {/* Linha de adição */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="form-input" style={{ flex: '1 1 160px', minWidth: 140 }}
          value={novoNome} onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder={`Novo(a) ${title.toLowerCase()}...`} />
        {extraField && (
          <select className="form-input" style={{ width: 150 }} value={novoExtra} onChange={e => setNovoExtra(e.target.value)}>
            {extraField.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <button className="btn btn-primary" onClick={handleAdd} style={{ flexShrink: 0 }}>
          <Plus size={14} /> Adicionar
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Nenhum item cadastrado ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 8, background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)',
              opacity: item[fields.active] ? 1 : 0.5,
            }}>
              {editId === item.id ? (
                <>
                  <input className="form-input" style={{ flex: 1, padding: '5px 10px' }}
                    value={editNome} onChange={e => setEditNome(e.target.value)} autoFocus />
                  {extraField && (
                    <select className="form-input" style={{ width: 140, padding: '5px 10px' }}
                      value={editExtra} onChange={e => setEditExtra(e.target.value)}>
                      {extraField.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  <IconBtn onClick={() => saveEdit(item.id)} color="#22c55e" title="Salvar"><Check size={14} /></IconBtn>
                  <IconBtn onClick={() => setEditId(null)} color="var(--text-muted)" title="Cancelar"><X size={14} /></IconBtn>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item[fields.name]}</span>
                  {extraField && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                      background: 'rgba(99,102,241,.14)', color: '#6366f1',
                    }}>{labelFor(item[extraField.column])}</span>
                  )}
                  <button onClick={() => toggleActive(item)} style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: item[fields.active] ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.06)',
                    color: item[fields.active] ? '#22c55e' : 'var(--text-muted)',
                  }}>{item[fields.active] ? 'Ativo' : 'Inativo'}</button>
                  <IconBtn onClick={() => startEdit(item)} color="#6366f1" title="Editar"><Edit2 size={13} /></IconBtn>
                  <IconBtn onClick={() => remove(item.id)} color="#f87171" title="Excluir"><Trash2 size={13} /></IconBtn>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({ onClick, color, title, children }: any) {
  return (
    <button onClick={onClick} title={title} style={{
      background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
      borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color, display: 'flex', alignItems: 'center',
    }}>{children}</button>
  );
}

// ── Constantes: opções fixas (batendo com valores reais de produção) ──
const TIPOS_PAGAMENTO: ExtraOption[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'credito', label: 'Crédito' },
];
const TIPOS_CATEGORIA: ExtraOption[] = [
  { value: 'despesa', label: 'Despesa' },
  { value: 'receita', label: 'Receita' },
];
const TIPOS_LENTE: ExtraOption[] = [
  { value: 'oculos', label: 'Óculos' },
  { value: 'contato', label: 'Contato' },
];

// ── Componente principal: sub-aba Ajustes ──
export default function AjustesConsultas() {
  const [subTab, setSubTab] = useState<'financeiro' | 'pacientes' | 'lentes'>('financeiro');

  const SUB_TABS = [
    { k: 'financeiro', l: 'Financeiro', icon: Wallet },
    { k: 'pacientes', l: 'Pacientes', icon: Users },
    { k: 'lentes', l: 'Lentes', icon: Eye },
  ] as const;

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {SUB_TABS.map(t => (
          <button key={t.k} onClick={() => setSubTab(t.k)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            color: subTab === t.k ? '#6366f1' : 'var(--text-muted)',
            borderBottom: subTab === t.k ? '2px solid #6366f1' : '2px solid transparent',
          }}>
            <t.icon size={14} /> {t.l}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-8px 0 16px' }}>
        Procurando cadastro de profissionais/usuários? Isso fica em{' '}
        <Link to="/cadastros" style={{ color: '#6366f1', fontWeight: 600 }}>Cadastros → Profissionais</Link>.
      </p>

      {subTab === 'financeiro' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <CrudList icon={Wallet} color="#06b6d4" title="Contas / Caixas"
            hint="Onde o dinheiro das consultas entra e sai (separado do Financeiro da loja)."
            table="clinic_accounts" fields={{ name: 'nome', active: 'ativo' }} />
          <CrudList icon={CreditCard} color="#6366f1" title="Tipos de Pagamento"
            hint="Valores batendo com financial_transactions.payment_method da loja."
            table="clinic_payment_methods" fields={{ name: 'nome', active: 'ativo' }}
            extraField={{ column: 'tipo', options: TIPOS_PAGAMENTO }} />
          <CrudList icon={TrendingUp} color="#22c55e" title="Categorias Financeiras"
            hint="Despesa e Receita numa lista só (nome + tipo)."
            table="clinic_financial_categories" fields={{ name: 'nome', active: 'ativo' }}
            extraField={{ column: 'tipo', options: TIPOS_CATEGORIA }} />
        </div>
      )}

      {subTab === 'pacientes' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', maxWidth: 520 }}>
          {/* Reaproveita a tabela patient_origins já existente (customers.origin_id aponta pra ela).
              Atenção: essa tabela usa colunas em inglês (name/active), diferente das clinic_* (nome/ativo). */}
          <CrudList icon={Users} color="#f59e0b" title="Como chegou à clínica?"
            hint="Origem/indicação do paciente — mesma tabela já usada por customers.origin_id."
            table="patient_origins" fields={{ name: 'name', active: 'active' }} />
        </div>
      )}

      {subTab === 'lentes' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', maxWidth: 640 }}>
          <CrudList icon={Eye} color="#06b6d4" title="Lentes de Óculos e Contato"
            hint="Cadastro simples: Tipo + Nome + ativo. Usado na Prescrição da Ficha de Atendimento (Fase 5)."
            table="clinic_lens_types" fields={{ name: 'nome', active: 'ativo' }}
            extraField={{ column: 'tipo', options: TIPOS_LENTE }} />
        </div>
      )}
    </div>
  );
}

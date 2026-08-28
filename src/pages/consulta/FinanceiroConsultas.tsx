import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { fetchAllRows } from '../../lib/fetchAll';
import { Plus, Check, RotateCcw, Trash2, Edit2, X, AlertTriangle, Wallet, Download } from 'lucide-react';
import { formatBRL, formatDate } from '../../types/index';
import { exportarCSV } from '../../lib/exportCsv';
import toast from 'react-hot-toast';

const CATEGORIAS_RECEITA = ['consulta', 'outros'];
const CATEGORIAS_DESPESA = ['comissao_profissional', 'comissao_convenio', 'outros'];
const PAGAMENTOS = ['dinheiro', 'pix', 'credito', 'debito', 'transferencia', 'boleto'];

function emptyForm(type: string) {
  return {
    type, category: type === 'receita' ? 'consulta' : 'outros',
    description: '', amount: '' as any,
    due_date: new Date().toISOString().split('T')[0],
    payment_method: 'pix',
  };
}

export default function FinanceiroConsultas() {
  const { tenantId } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'receber' | 'pagar' | 'todos'>('receber');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  // Filtros extras (Profissional / Parceria-Ótica / Forma de Pagamento) e as
  // listas pra popular os selects - pedido da Samara pra ficar parecido com
  // o relatório que ela já usava (OptoVision), que tem esses três filtros
  // em toda tela de relatório/financeiro.
  const [filtroProfissional, setFiltroProfissional] = useState('');
  const [filtroParceria, setFiltroParceria] = useState('');
  const [filtroPagamento, setFiltroPagamento] = useState('');
  const [listaProfissionais, setListaProfissionais] = useState<{ id: string; name: string }[]>([]);
  const [listaParcerias, setListaParcerias] = useState<{ id: string; name: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm('receita'));
  const [saving, setSaving] = useState(false);
  const [nameMaps, setNameMaps] = useState<{ prof: Record<string, string>; partner: Record<string, string>; cust: Record<string, string> }>({ prof: {}, partner: {}, cust: {} });

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [rows, professionals, partnerships, consultations] = await Promise.all([
      fetchAllRows<any>((rf, rt) => supabase.from('clinic_financial_entries').select('*')
        .eq('tenant_id', tenantId).gte('due_date', dateFrom).lte('due_date', dateTo)
        .order('due_date', { ascending: true }).range(rf, rt)),
      supabase.from('professionals').select('id,name').eq('tenant_id', tenantId).then(({ data }) => data || []),
      supabase.from('partnerships').select('id,name').eq('tenant_id', tenantId).then(({ data }) => data || []),
      fetchAllRows<any>((rf, rt) => supabase.from('consultations').select('id,customer_name').eq('tenant_id', tenantId).range(rf, rt)),
    ]);
    const prof: Record<string, string> = {}; (professionals as any[]).forEach(p => { prof[p.id] = p.name; });
    const partner: Record<string, string> = {}; (partnerships as any[]).forEach(p => { partner[p.id] = p.name; });
    const cust: Record<string, string> = {}; (consultations as any[]).forEach(c => { cust[c.id] = c.customer_name; });
    setNameMaps({ prof, partner, cust });
    setListaProfissionais(professionals as any[]);
    setListaParcerias(partnerships as any[]);
    setEntries(rows || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId, dateFrom, dateTo]);

  const hoje = new Date().toISOString().split('T')[0];
  const formasPagamento = Array.from(new Set(entries.map(e => e.payment_method).filter(Boolean))).sort();
  const base = entries.filter(e => tab === 'todos' || (tab === 'receber' && e.type === 'receita') || (tab === 'pagar' && e.type === 'despesa'));
  const filtered = base
    .filter(e => !statusFilter || e.status === statusFilter)
    .filter(e => !filtroProfissional || e.professional_id === filtroProfissional)
    .filter(e => !filtroParceria || e.partnership_id === filtroParceria)
    .filter(e => !filtroPagamento || e.payment_method === filtroPagamento);
  const totalFiltrado = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);

  const totalPendente = base.filter(e => e.status === 'pendente').reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalVencido = base.filter(e => e.status === 'pendente' && e.due_date < hoje).reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalPago = base.filter(e => e.status === 'pago').reduce((s, e) => s + Number(e.amount || 0), 0);

  const toggleStatus = async (e: any) => {
    const newStatus = e.status === 'pago' ? 'pendente' : 'pago';
    const { error } = await supabase.from('clinic_financial_entries').update({
      status: newStatus, paid_date: newStatus === 'pago' ? new Date().toISOString().split('T')[0] : null,
    }).eq('id', e.id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    toast.success(newStatus === 'pago' ? '✅ Marcado como pago!' : 'Reaberto');
    load();
  };

  const openNew = (type: string) => { setEditing(null); setForm(emptyForm(type)); setShowModal(true); };
  const openEdit = (e: any) => {
    setEditing(e);
    setForm({ type: e.type, category: e.category || 'outros', description: e.description || '', amount: e.amount, due_date: e.due_date, payment_method: e.payment_method || 'pix' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount) { toast.error('Preencha descrição e valor'); return; }
    setSaving(true);
    const payload = {
      tenant_id: tenantId, type: form.type, category: form.category,
      description: form.description, amount: Number(form.amount),
      due_date: form.due_date, payment_method: form.payment_method,
    };
    const { error } = editing
      ? await supabase.from('clinic_financial_entries').update(payload).eq('id', editing.id)
      : await supabase.from('clinic_financial_entries').insert([{ ...payload, status: 'pendente' }]);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar'); return; }
    toast.success('Salvo!');
    setShowModal(false);
    load();
  };

  const handleDelete = async (e: any) => {
    if (!confirm('Excluir o lançamento "' + e.description + '"?')) return;
    if (e.consultation_id) { toast.error('Este lançamento veio automático de um atendimento — para removê-lo, ajuste o atendimento em vez de excluir aqui.'); return; }
    await supabase.from('clinic_financial_entries').delete().eq('id', e.id);
    toast.success('Excluído'); load();
  };

  const origemLabel = (e: any) => {
    if (e.consultation_id && nameMaps.cust[e.consultation_id]) return nameMaps.cust[e.consultation_id];
    if (e.professional_id && nameMaps.prof[e.professional_id]) return nameMaps.prof[e.professional_id];
    if (e.partnership_id && nameMaps.partner[e.partnership_id]) return nameMaps.partner[e.partnership_id];
    return '—';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ k: 'receber', l: 'A Receber' }, { k: 'pagar', l: 'A Pagar' }, { k: 'todos', l: 'Todos' }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k as any)}
              style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, background: tab === t.k ? 'var(--accent)' : 'rgba(255,255,255,.06)', color: tab === t.k ? '#fff' : 'var(--text)', border: '1px solid var(--border)' }}>
              {t.l}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => openNew('receita')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Nova Receita</button>
          <button className="btn btn-secondary" onClick={() => openNew('despesa')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Nova Despesa</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <input className="form-input" type="date" style={{ width: 160 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ color: 'var(--text-muted)' }}>até</span>
        <input className="form-input" type="date" style={{ width: 160 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <select className="form-input" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
        </select>
        <select className="form-input" style={{ width: 170 }} value={filtroProfissional} onChange={e => setFiltroProfissional(e.target.value)}>
          <option value="">Todos profissionais</option>
          {listaProfissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="form-input" style={{ width: 170 }} value={filtroParceria} onChange={e => setFiltroParceria(e.target.value)}>
          <option value="">Todas parcerias</option>
          {listaParcerias.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="form-input" style={{ width: 170 }} value={filtroPagamento} onChange={e => setFiltroPagamento(e.target.value)}>
          <option value="">Todas formas pgto.</option>
          {formasPagamento.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <button
          className="btn btn-secondary"
          disabled={filtered.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
          onClick={() => exportarCSV(
            `financeiro-consultas-${dateFrom}-a-${dateTo}.csv`,
            [
              { chave: 'due_date', titulo: 'Vencimento' },
              { chave: 'description', titulo: 'Descrição' },
              { chave: 'origem', titulo: 'Origem' },
              { chave: 'amount', titulo: 'Valor (R$)' },
              { chave: 'status', titulo: 'Status' },
              { chave: 'payment_method', titulo: 'Forma de Pagamento' },
            ],
            filtered.map(e => ({ ...e, origem: origemLabel(e) }))
          )}
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -12, marginBottom: 16 }}>
        Total filtrado: <strong style={{ color: 'var(--text)' }}>{formatBRL(totalFiltrado)}</strong> ({filtered.length} lançamento{filtered.length === 1 ? '' : 's'})
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 18, borderTop: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{formatBRL(totalPendente)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pendente no período</div>
        </div>
        <div className="card" style={{ padding: 18, borderTop: '3px solid #f87171' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: 6 }}>
            {totalVencido > 0 && <AlertTriangle size={18} />} {formatBRL(totalVencido)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vencido (venc. antes de hoje)</div>
        </div>
        <div className="card" style={{ padding: 18, borderTop: '3px solid #22c55e' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{formatBRL(totalPago)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pago no período</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Vencimento</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Descrição</th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Origem</th>
              <th style={{ padding: '10px 14px', textAlign: 'right' }}>Valor</th>
              <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '10px 14px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</td></tr>)}
            {!loading && filtered.length === 0 && (<tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum lançamento no período.</td></tr>)}
            {filtered.map(e => {
              const vencido = e.status === 'pendente' && e.due_date < hoje;
              return (
                <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', color: vencido ? '#f87171' : undefined }}>{formatDate(e.due_date)}</td>
                  <td style={{ padding: '10px 14px' }}>{e.description}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>{origemLabel(e)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: e.type === 'receita' ? '#22c55e' : '#f87171' }}>{formatBRL(Number(e.amount || 0))}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, background: e.status === 'pago' ? 'rgba(34,197,94,.15)' : 'rgba(245,158,11,.15)', color: e.status === 'pago' ? '#22c55e' : '#f59e0b' }}>
                      {e.status === 'pago' ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button title={e.status === 'pago' ? 'Reabrir' : 'Marcar como pago'} onClick={() => toggleStatus(e)}
                        style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: e.status === 'pago' ? '#f59e0b' : '#22c55e', display: 'flex', alignItems: 'center' }}>
                        {e.status === 'pago' ? <RotateCcw size={14} /> : <Check size={14} />}
                      </button>
                      <button title="Editar" onClick={() => openEdit(e)}
                        style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center' }}><Edit2 size={14} /></button>
                      <button title="Excluir" onClick={() => handleDelete(e)}
                        style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: '#f87171', display: 'flex', alignItems: 'center' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '95%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wallet size={18} /> {editing ? 'Editar lançamento' : (form.type === 'receita' ? 'Nova Receita' : 'Nova Despesa')}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">Descrição</label>
                <input className="form-input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Aluguel do consultório" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Categoria</label>
                  <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                    {(form.type === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Valor (R$)</label>
                  <input className="form-input" type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Vencimento</label>
                  <input className="form-input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Forma de pagamento</label>
                  <select className="form-input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
                    {PAGAMENTOS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, TrendingDown, DollarSign, Plus,
  Search, X, Save, Eye, Download, AlertTriangle,
  CheckCircle, Clock, BarChart3
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL } from '../types/index';

const CATEGORIAS_RECEITA = ['Venda','Crediário','Serviço','Outros'];
const CATEGORIAS_DESPESA = ['Fornecedor','Aluguel','Salário','Água/Luz','Internet','Laboratório','Manutenção','Impostos','Outros'];
const PAGAMENTOS = ['dinheiro','pix','credito','debito','transferencia','boleto'];

interface Transaction {
  id: string; tenant_id: string; type: string; description: string;
  category: string; amount: number; due_date: string;
  paid_at?: string; status: string; payment_method?: string; notes?: string;
  created_at: string;
}

function emptyForm(type: string) {
  return {
    type, description: '', category: type==='receita'?'Outros':'Outros',
    amount: 0, due_date: new Date().toISOString().split('T')[0],
    status: 'pendente', payment_method: 'pix', notes: ''
  };
}

export default function FinanceiroPage() {
  const { tenantId } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'lancamentos'|'resumo'>('lancamentos');
  const [typeFilter, setTypeFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState(new Date().toISOString().slice(0,8)+'01');
  const [dateTo, setDateTo]       = useState(new Date().toISOString().slice(0,10));
  const [showModal, setShowModal] = useState(false);
  const [editType, setEditType]   = useState<'receita'|'despesa'>('receita');
  const [editing, setEditing]     = useState<Transaction | null>(null);
  const [form, setForm]           = useState(emptyForm('receita'));
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('financial_transactions')
      .select('*').eq('tenant_id', tenantId)
      .order('due_date', { ascending: false });
    setTransactions((data as Transaction[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const hoje = new Date().toISOString().split('T')[0];
  const mesAtual = new Date().toISOString().slice(0,7);

  // Stats
  const receitasMes  = transactions.filter(t => t.type==='receita' && t.status==='pago' && t.paid_at?.startsWith(mesAtual)).reduce((s,t)=>s+t.amount,0);
  const despesasMes  = transactions.filter(t => t.type==='despesa' && t.status==='pago' && t.paid_at?.startsWith(mesAtual)).reduce((s,t)=>s+t.amount,0);
  const saldoMes     = receitasMes - despesasMes;
  const aVencer      = transactions.filter(t => t.status==='pendente' && t.due_date >= hoje).reduce((s,t)=>s+t.amount,0);
  const vencidas     = transactions.filter(t => t.status==='pendente' && t.due_date < hoje).length;

  const filtered = useMemo(() => {
    let list = transactions;
    if (typeFilter)   list = list.filter(t => t.type === typeFilter);
    if (statusFilter) list = list.filter(t => t.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(t => t.description.toLowerCase().includes(s) || t.category?.toLowerCase().includes(s));
    }
    if (dateFrom) list = list.filter(t => t.due_date >= dateFrom);
    if (dateTo)   list = list.filter(t => t.due_date <= dateTo);
    return list;
  }, [transactions, typeFilter, statusFilter, search, dateFrom, dateTo]);

  const openNew = (type: 'receita'|'despesa') => {
    setEditing(null); setEditType(type); setForm(emptyForm(type)); setShowModal(true);
  };
  const openEdit = (t: Transaction) => {
    setEditing(t); setEditType(t.type as any);
    setForm({ type:t.type, description:t.description, category:t.category,
      amount:t.amount, due_date:t.due_date, status:t.status,
      payment_method:t.payment_method||'pix', notes:t.notes||'' });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || form.amount <= 0) { toast.error('Preencha descrição e valor'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form, tenant_id: tenantId,
        paid_at: form.status==='pago' ? new Date().toISOString() : null,
      };
      if (editing) {
        const { error } = await supabase.from('financial_transactions').update(payload).eq('id', editing.id);
        if (error) throw error; toast.success('Lançamento atualizado!');
      } else {
        const { error } = await supabase.from('financial_transactions').insert([payload]);
        if (error) throw error; toast.success('Lançamento criado!');
      }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message||'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (t: Transaction) => {
    const newStatus = t.status==='pago' ? 'pendente' : 'pago';
    const { error } = await supabase.from('financial_transactions').update({
      status: newStatus,
      paid_at: newStatus==='pago' ? new Date().toISOString() : null,
    }).eq('id', t.id);
    if (error) { toast.error('Erro'); return; }
    toast.success(newStatus==='pago' ? '✅ Marcado como pago!' : 'Reaberto');
    load();
  };

  const deleteTransaction = async (t: Transaction) => {
    if (!confirm('Excluir lançamento "'+t.description+'"?')) return;
    await supabase.from('financial_transactions').delete().eq('id', t.id);
    toast.success('Excluído'); load();
  };

  const exportCSV = () => {
    const header = 'Tipo,Descrição,Categoria,Valor,Vencimento,Status,Pagamento';
    const rows = filtered.map(t =>
      [t.type,t.description,t.category,t.amount,t.due_date,t.status,t.payment_method]
        .map(v=>'"'+(v??'')+'"').join(','));
    const blob = new Blob([header+'\n'+rows.join('\n')],{type:'text/csv'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='financeiro.csv'; a.click(); toast.success('Exportado!');
  };

  const set = (k: string, v: any) => setForm(p => ({...p,[k]:v}));

  // Resumo por categoria
  const resumoCats = useMemo(() => {
    const cats: Record<string, { receita: number; despesa: number }> = {};
    transactions.filter(t=>t.status==='pago'&&t.paid_at?.startsWith(mesAtual)).forEach(t => {
      if (!cats[t.category]) cats[t.category] = { receita:0, despesa:0 };
      cats[t.category][t.type==='receita'?'receita':'despesa'] += t.amount;
    });
    return Object.entries(cats).sort((a,b)=>(b[1].receita+b[1].despesa)-(a[1].receita+a[1].despesa));
  }, [transactions, mesAtual]);

  const IconBtn = ({ onClick, title, color, children }: any) => (
    <button onClick={onClick} title={title}
      style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
        borderRadius:7, padding:'5px 8px', cursor:'pointer', color:color||'var(--text-muted)',
        display:'flex', alignItems:'center' }}>
      {children}
    </button>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <TrendingUp size={22}/> Financeiro
          </h1>
          <p className="page-sub">Controle de receitas e despesas</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
          <button className="btn btn-secondary" style={{ color:'#f87171', borderColor:'rgba(248,113,113,.3)' }}
            onClick={() => openNew('despesa')}>
            <TrendingDown size={15}/> Nova Despesa
          </button>
          <button className="btn btn-primary" onClick={() => openNew('receita')}>
            <Plus size={16}/> Nova Receita
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginBottom:24 }}>
        {[
          { icon:<TrendingUp size={20}/>,   val:formatBRL(receitasMes), label:'Receitas do Mês',  color:'#22c55e' },
          { icon:<TrendingDown size={20}/>, val:formatBRL(despesasMes), label:'Despesas do Mês',  color:'#f87171' },
          { icon:<DollarSign size={20}/>,   val:formatBRL(saldoMes),    label:'Saldo do Mês',     color: saldoMes>=0?'#6366f1':'#f87171' },
          { icon:<Clock size={20}/>,        val:formatBRL(aVencer),     label:'A Receber/Pagar',  color:'#f59e0b' },
          { icon:<AlertTriangle size={20}/>,val:vencidas,               label:'Lançamentos Venc.',color:'#f87171' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:18, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:typeof s.val==='number'?24:15, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {[{k:'lancamentos',l:'📋 Lançamentos'},{k:'resumo',l:'📊 Resumo por Categoria'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer',
              fontSize:14, fontWeight:600,
              color: tab===t.k ? '#6366f1' : 'var(--text-muted)',
              borderBottom: tab===t.k ? '2px solid #6366f1' : '2px solid transparent' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── LANÇAMENTOS ── */}
      {tab === 'lancamentos' && (<>
        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
          <div className="search-bar" style={{ flex:1, minWidth:200 }}>
            <Search size={15}/>
            <input className="form-input" placeholder="Buscar descrição ou categoria..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="form-input" style={{ width:150 }} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
            <option value="">Todos os Tipos</option>
            <option value="receita">✅ Receitas</option>
            <option value="despesa">❌ Despesas</option>
          </select>
          <select className="form-input" style={{ width:150 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="">Todos Status</option>
            <option value="pendente">⏳ Pendente</option>
            <option value="pago">✅ Pago</option>
          </select>
          <input className="form-input" type="date" style={{ width:145 }} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
          <input className="form-input" type="date" style={{ width:145 }} value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
        </div>

        {loading ? <div className="empty-state"><p>Carregando...</p></div> :
         filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><DollarSign size={40}/></div>
            <h3>Nenhum lançamento encontrado.</h3>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button className="btn btn-primary" onClick={()=>openNew('receita')}><Plus size={15}/> Nova Receita</button>
              <button className="btn btn-secondary" onClick={()=>openNew('despesa')}><Plus size={15}/> Nova Despesa</button>
            </div>
          </div>
         ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const isReceita = t.type === 'receita';
                    const isPago    = t.status === 'pago';
                    const isVencida = !isPago && t.due_date < hoje;
                    return (
                      <tr key={t.id}>
                        <td>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12,
                            fontWeight:600, padding:'3px 10px', borderRadius:20,
                            background: isReceita?'rgba(34,197,94,.12)':'rgba(248,113,113,.12)',
                            color: isReceita?'#22c55e':'#f87171' }}>
                            {isReceita ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
                            {isReceita ? 'Receita' : 'Despesa'}
                          </span>
                        </td>
                        <td style={{ fontWeight:500 }}>{t.description}</td>
                        <td>
                          <span style={{ fontSize:12, padding:'2px 8px', borderRadius:12,
                            background:'rgba(99,102,241,.12)', color:'#6366f1' }}>
                            {t.category}
                          </span>
                        </td>
                        <td style={{ fontWeight:700,
                          color: isReceita?'#22c55e':'#f87171' }}>
                          {isReceita?'+':'-'}{formatBRL(t.amount)}
                        </td>
                        <td style={{ fontSize:13, color: isVencida?'#f87171':'var(--text)' }}>
                          {isVencida && '⚠️ '}
                          {new Date(t.due_date+'T00:00:00').toLocaleDateString('pt-BR')}
                        </td>
                        <td>
                          <button onClick={()=>toggleStatus(t)}
                            style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12,
                              fontWeight:600, padding:'4px 12px', borderRadius:20, border:'none', cursor:'pointer',
                              background: isPago?'rgba(34,197,94,.15)':'rgba(245,158,11,.15)',
                              color: isPago?'#22c55e':'#f59e0b' }}>
                            {isPago ? <CheckCircle size={12}/> : <Clock size={12}/>}
                            {isPago ? 'Pago' : 'Pendente'}
                          </button>
                        </td>
                        <td>
                          <div style={{ display:'flex', gap:5 }}>
                            <IconBtn onClick={()=>openEdit(t)} title="Editar" color="#6366f1">
                              <Eye size={14}/>
                            </IconBtn>
                            <IconBtn onClick={()=>deleteTransaction(t)} title="Excluir" color="#f87171">
                              <X size={14}/>
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)',
              display:'flex', justifyContent:'space-between' }}>
              <span>{filtered.length} lançamento(s)</span>
              <span>
                Receitas: <strong style={{ color:'#22c55e' }}>{formatBRL(filtered.filter(t=>t.type==='receita').reduce((s,t)=>s+t.amount,0))}</strong>
                {' · '}
                Despesas: <strong style={{ color:'#f87171' }}>{formatBRL(filtered.filter(t=>t.type==='despesa').reduce((s,t)=>s+t.amount,0))}</strong>
              </span>
            </div>
          </div>
         )}
      </>)}

      {/* ── RESUMO ── */}
      {tab === 'resumo' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          {/* Fluxo do mês */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20 }}>📊 Fluxo do Mês</h3>
            {[
              { label:'Total Receitas', val:receitasMes, color:'#22c55e', pct:100 },
              { label:'Total Despesas', val:despesasMes, color:'#f87171', pct: receitasMes>0?(despesasMes/receitasMes*100):0 },
            ].map(item => (
              <div key={item.label} style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:14 }}>
                  <span style={{ color:'var(--text-muted)' }}>{item.label}</span>
                  <strong style={{ color:item.color }}>{formatBRL(item.val)}</strong>
                </div>
                <div style={{ height:8, borderRadius:4, background:'rgba(255,255,255,.08)' }}>
                  <div style={{ height:'100%', borderRadius:4, width:Math.min(100,item.pct)+'%',
                    background:item.color, transition:'width .5s' }}/>
                </div>
              </div>
            ))}
            <div style={{ marginTop:20, padding:'14px 16px', borderRadius:10,
              background: saldoMes>=0?'rgba(34,197,94,.1)':'rgba(248,113,113,.1)',
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:14, fontWeight:600 }}>Saldo do Mês</span>
              <span style={{ fontSize:22, fontWeight:800, color:saldoMes>=0?'#22c55e':'#f87171' }}>
                {saldoMes>=0?'+':''}{formatBRL(saldoMes)}
              </span>
            </div>
          </div>

          {/* Por categoria */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20 }}>📂 Por Categoria</h3>
            {resumoCats.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-muted)', fontSize:14 }}>
                Nenhum lançamento pago no mês
              </div>
            ) : resumoCats.slice(0,8).map(([cat, vals]) => (
              <div key={cat} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:13, fontWeight:500 }}>{cat}</span>
                <div style={{ display:'flex', gap:12 }}>
                  {vals.receita > 0 && <span style={{ fontSize:13, color:'#22c55e', fontWeight:600 }}>+{formatBRL(vals.receita)}</span>}
                  {vals.despesa > 0 && <span style={{ fontSize:13, color:'#f87171', fontWeight:600 }}>-{formatBRL(vals.despesa)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={()=>setShowModal(false)}>
          <div className="modal" style={{ maxWidth:500, width:'95%' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: editType==='receita'?'#22c55e':'#f87171' }}>
                {editType==='receita'?'📈':'📉'} {editing?'Editar':'Novo'} {editType==='receita'?'Receita':'Despesa'}
              </h2>
              <button onClick={()=>setShowModal(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="form-label">Descrição *</label>
                    <input className="form-input" value={form.description} onChange={e=>set('description',e.target.value)} required/>
                  </div>
                  <div>
                    <label className="form-label">Categoria</label>
                    <select className="form-input" value={form.category} onChange={e=>set('category',e.target.value)}>
                      {(editType==='receita'?CATEGORIAS_RECEITA:CATEGORIAS_DESPESA).map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Valor (R$) *</label>
                    <input className="form-input" type="number" step="0.01" min="0"
                      value={form.amount||''} onChange={e=>set('amount',parseFloat(e.target.value)||0)} required/>
                  </div>
                  <div>
                    <label className="form-label">Data de Vencimento</label>
                    <input className="form-input" type="date" value={form.due_date} onChange={e=>set('due_date',e.target.value)}/>
                  </div>
                  <div>
                    <label className="form-label">Forma de Pagamento</label>
                    <select className="form-input" value={form.payment_method} onChange={e=>set('payment_method',e.target.value)}>
                      {PAGAMENTOS.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Status</label>
                    <select className="form-input" value={form.status} onChange={e=>set('status',e.target.value)}>
                      <option value="pendente">Pendente</option>
                      <option value="pago">Pago</option>
                    </select>
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="form-label">Observações</label>
                    <textarea className="form-input" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={()=>setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}
                  style={{ background: editType==='receita'?'linear-gradient(135deg,#22c55e,#16a34a)':'linear-gradient(135deg,#f87171,#dc2626)' }}>
                  <Save size={15}/> {saving?'Salvando...':'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

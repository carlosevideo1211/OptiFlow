import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatBRL } from '../types/index';
import {
  AlertTriangle, Package, Boxes, DollarSign,
  TrendingUp, TrendingDown, Search, X, Save,
  CheckCircle, Download, Plus, ArrowDownCircle,
  ArrowUpCircle, History, Bell, Edit2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Product {
  id: string; name: string; code?: string; category: string; brand?: string;
  cost_price: number; sale_price: number; stock: number; min_stock: number; active: boolean;
}
interface Movimento {
  id: string; product_id: string; product_name: string;
  type: 'entrada' | 'saida' | 'ajuste'; quantity: number;
  cost_price?: number; supplier?: string; notes?: string; created_at: string;
}

export default function EstoquePage() {
  const { tenantId } = useAuth();
  const [products, setProducts]     = useState<Product[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<'estoque'|'entrada'|'alertas'|'historico'>('estoque');
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  // Modal ajuste
  const [showModal, setShowModal]   = useState(false);
  const [selProduct, setSelProduct] = useState<Product | null>(null);
  const [adjType, setAdjType]       = useState<'entrada'|'saida'|'ajuste'>('entrada');
  const [adjQty, setAdjQty]         = useState(0);
  const [adjNotes, setAdjNotes]     = useState('');
  const [saving, setSaving]         = useState(false);
  // Entrada de produtos
  const [entForm, setEntForm] = useState({
    product_id: '', quantity: 1, cost_price: 0, supplier: '', notes: '', due_date: new Date().toISOString().split('T')[0]
  });
  const [savingEnt, setSavingEnt] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('active', true).order('name'),
      supabase.from('stock_movements').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100)
    ]);
    setProducts((p as Product[]) || []);
    setMovimentos((m as Movimento[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  // Stats
  const totalProd  = products.length;
  const totalVal   = products.reduce((s,p) => s + p.sale_price * p.stock, 0);
  const totalCusto = products.reduce((s,p) => s + p.cost_price * p.stock, 0);
  const criticos   = products.filter(p => p.stock > 0 && p.stock <= p.min_stock).length;
  const zerados    = products.filter(p => p.stock === 0).length;

  const categorias = useMemo(() => [...new Set(products.map(p => p.category))].sort(), [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (catFilter) list = list.filter(p => p.category === catFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s));
    }
    return list;
  }, [products, catFilter, search]);

  const alertas = useMemo(() =>
    products.filter(p => p.stock <= p.min_stock).sort((a,b) => a.stock - b.stock),
    [products]);

  const exportCSV = () => {
    const header = 'Nome,Código,Categoria,Marca,Estoque,Mínimo,Custo,Venda,Valor Total';
    const rows = products.map(p =>
      [p.name,p.code||'',p.category,p.brand||'',p.stock,p.min_stock,p.cost_price,p.sale_price,p.sale_price*p.stock]
        .map(v=>'"'+(v??'')+'"').join(','));
    const blob = new Blob([header+'\n'+rows.join('\n')],{type:'text/csv'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='estoque.csv'; a.click(); toast.success('Exportado!');
  };

  const openAjuste = (p: Product, type: 'entrada'|'saida'|'ajuste') => {
    setSelProduct(p); setAdjType(type); setAdjQty(0); setAdjNotes(''); setShowModal(true);
  };

  const handleAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!selProduct || adjQty <= 0) { toast.error('Informe a quantidade'); return; }
    setSaving(true);
    try {
      const delta = adjType === 'saida' ? -adjQty : adjQty;
      const newStock = Math.max(0, selProduct.stock + delta);
      await supabase.from('products').update({ stock: newStock }).eq('id', selProduct.id);
      await supabase.from('stock_movements').insert([{
        tenant_id: tenantId, product_id: selProduct.id,
        product_name: selProduct.name, type: adjType,
        quantity: adjQty, notes: adjNotes
      }]);
      toast.success('Estoque atualizado!'); setShowModal(false); load();
    } catch (err: any) { toast.error(err.message || 'Erro'); }
    finally { setSaving(false); }
  };

  const handleEntrada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingEnt) return;
    if (!entForm.product_id || entForm.quantity <= 0) { toast.error('Selecione o produto e quantidade'); return; }
    setSavingEnt(true);
    try {
      const prod = products.find(p => p.id === entForm.product_id);
      if (!prod) throw new Error('Produto não encontrado');
      const newStock = prod.stock + entForm.quantity;
      await supabase.from('products').update({ stock: newStock, cost_price: entForm.cost_price || prod.cost_price }).eq('id', prod.id);
      await supabase.from('stock_movements').insert([{
        tenant_id: tenantId, product_id: prod.id, product_name: prod.name,
        type: 'entrada', quantity: entForm.quantity,
        cost_price: entForm.cost_price, supplier: entForm.supplier, notes: entForm.notes
      }]);
      if (entForm.cost_price > 0 && entForm.supplier) {
        const total = entForm.cost_price * entForm.quantity;
        await supabase.from('financial_transactions').insert([{
          tenant_id: tenantId, type: 'despesa',
          description: 'Compra: ' + prod.name + (entForm.supplier ? ' — ' + entForm.supplier : ''),
          category: 'Fornecedor', amount: total,
          due_date: entForm.due_date, status: 'pendente',
          payment_method: 'boleto', origin: 'Estoque'
        }]);
        toast.success('Entrada registrada e lançada no Financeiro!');
      } else {
        toast.success('Entrada registrada!');
      }
      setEntForm({ product_id:'', quantity:1, cost_price:0, supplier:'', notes:'', due_date: new Date().toISOString().split('T')[0] });
      load();
    } catch (err: any) { toast.error(err.message || 'Erro'); }
    finally { setSavingEnt(false); }
  };

  const setEnt = (k: string, v: any) => setEntForm(p => ({...p,[k]:v}));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Package size={22}/> Estoque
          </h1>
          <p className="page-sub">Controle de entradas, saídas e inventário</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
          <button className="btn btn-primary" onClick={() => setTab('entrada')}>
            <ArrowDownCircle size={15}/> Entrada de Produtos
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginBottom:24 }}>
        {[
          { icon:<Package size={20}/>,      val: totalProd,           label:'Total Produtos',   color:'#6366f1' },
          { icon:<DollarSign size={20}/>,   val: formatBRL(totalVal), label:'Valor em Estoque', color:'#22c55e' },
          { icon:<TrendingDown size={20}/>, val: formatBRL(totalCusto),label:'Custo Total',     color:'#06b6d4' },
          { icon:<AlertTriangle size={20}/>,val: criticos,             label:'Estoque Crítico', color:'#f59e0b' },
          { icon:<X size={20}/>,            val: zerados,             label:'Produtos Zerados', color:'#f87171' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:18, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:typeof s.val==='number'?24:15, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
        {[
          {k:'estoque',   l:'📦 Estoque Atual'},
          {k:'entrada',   l:'📥 Entrada de Produtos'},
          {k:'alertas',   l:`🔔 Alertas ${alertas.length > 0 ? '('+alertas.length+')' : ''}`},
          {k:'historico', l:'📋 Histórico'},
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            style={{ padding:'10px 18px', background:'none', border:'none', cursor:'pointer',
              fontSize:13, fontWeight:600,
              color: tab===t.k ? '#6366f1' : 'var(--text-muted)',
              borderBottom: tab===t.k ? '2px solid #6366f1' : '2px solid transparent',
              whiteSpace:'nowrap' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── ESTOQUE ATUAL ── */}
      {tab === 'estoque' && (<>
        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
          <div className="search-bar" style={{ flex:1, minWidth:200 }}>
            <Search size={15}/>
            <input className="form-input" placeholder="Buscar produto, código ou marca..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="form-input" style={{ width:180 }} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loading ? <div className="empty-state"><p>Carregando...</p></div> :
         filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Package size={40}/></div>
            <h3>Nenhum produto encontrado.</h3>
          </div>
         ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th>Custo</th><th>Venda</th><th>Valor Total</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const critico = p.stock <= p.min_stock && p.stock > 0;
                    const zerado  = p.stock === 0;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight:500 }}>{p.name}</div>
                          {p.code && <div style={{ fontSize:11, color:'var(--text-muted)' }}>Ref: {p.code}</div>}
                          {p.brand && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{p.brand}</div>}
                        </td>
                        <td><span style={{ fontSize:12, padding:'2px 8px', borderRadius:12, background:'rgba(99,102,241,.12)', color:'#6366f1' }}>{p.category}</span></td>
                        <td>
                          <span style={{ fontWeight:700, fontSize:16,
                            color: zerado?'#f87171':critico?'#f59e0b':'#22c55e' }}>
                            {p.stock}
                          </span>
                          {zerado && <span style={{ fontSize:10, marginLeft:4, color:'#f87171' }}>ZERADO</span>}
                          {critico && <span style={{ fontSize:10, marginLeft:4, color:'#f59e0b' }}>⚠ CRÍTICO</span>}
                        </td>
                        <td style={{ fontSize:13, color:'var(--text-muted)' }}>{p.min_stock}</td>
                        <td style={{ fontSize:13 }}>{formatBRL(p.cost_price)}</td>
                        <td style={{ fontSize:13, fontWeight:600 }}>{formatBRL(p.sale_price)}</td>
                        <td style={{ fontSize:13, color:'#22c55e', fontWeight:600 }}>{formatBRL(p.sale_price * p.stock)}</td>
                        <td>
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={() => openAjuste(p,'entrada')} title="Entrada"
                              style={{ padding:'5px 8px', borderRadius:7, border:'none', cursor:'pointer', background:'rgba(34,197,94,.12)', color:'#22c55e', display:'flex', alignItems:'center' }}>
                              <ArrowDownCircle size={14}/>
                            </button>
                            <button onClick={() => openAjuste(p,'saida')} title="Saída"
                              style={{ padding:'5px 8px', borderRadius:7, border:'none', cursor:'pointer', background:'rgba(248,113,113,.12)', color:'#f87171', display:'flex', alignItems:'center' }}>
                              <ArrowUpCircle size={14}/>
                            </button>
                            <button onClick={() => openAjuste(p,'ajuste')} title="Ajuste"
                              style={{ padding:'5px 8px', borderRadius:7, border:'none', cursor:'pointer', background:'rgba(99,102,241,.12)', color:'#6366f1', display:'flex', alignItems:'center' }}>
                              <Edit2 size={14}/>
                            </button>
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
              <span>{filtered.length} produto(s)</span>
              <span>Valor total: <strong style={{color:'#22c55e'}}>{formatBRL(filtered.reduce((s,p)=>s+p.sale_price*p.stock,0))}</strong></span>
            </div>
          </div>
         )}
      </>)}

      {/* ── ENTRADA DE PRODUTOS ── */}
      {tab === 'entrada' && (
        <div style={{ maxWidth:600 }}>
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <ArrowDownCircle size={18} style={{color:'#22c55e'}}/> Registrar Entrada de Produtos
            </h3>
            <form onSubmit={handleEntrada}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Produto *</label>
                  <select className="form-input" value={entForm.product_id} onChange={e=>setEnt('product_id',e.target.value)} required>
                    <option value="">— Selecione o produto —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.code?'('+p.code+')':''} — Estoque: {p.stock}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Quantidade *</label>
                  <input className="form-input" type="number" min="1" value={entForm.quantity||''} onChange={e=>setEnt('quantity',parseInt(e.target.value)||0)} required/>
                </div>
                <div>
                  <label className="form-label">Preço de Custo (R$)</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={entForm.cost_price||''} onChange={e=>setEnt('cost_price',parseFloat(e.target.value)||0)}/>
                </div>
                <div>
                  <label className="form-label">Fornecedor</label>
                  <input className="form-input" value={entForm.supplier} onChange={e=>setEnt('supplier',e.target.value)} placeholder="Nome do fornecedor"/>
                </div>
                <div>
                  <label className="form-label">Data de Vencimento (Pagar)</label>
                  <input className="form-input" type="date" value={entForm.due_date} onChange={e=>setEnt('due_date',e.target.value)}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Observações</label>
                  <textarea className="form-input" rows={2} value={entForm.notes} onChange={e=>setEnt('notes',e.target.value)} placeholder="Nota fiscal, referência..."/>
                </div>
              </div>
              {entForm.cost_price > 0 && entForm.supplier && (
                <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)', fontSize:13, color:'#f59e0b' }}>
                  💡 Um lançamento de <strong>{formatBRL(entForm.cost_price * entForm.quantity)}</strong> será criado em <strong>Contas a Pagar</strong> no Financeiro.
                </div>
              )}
              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button type="submit" className="btn btn-primary" disabled={savingEnt} style={{ background:'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                  <Save size={15}/> {savingEnt ? 'Salvando...' : 'Registrar Entrada'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEntForm({ product_id:'', quantity:1, cost_price:0, supplier:'', notes:'', due_date: new Date().toISOString().split('T')[0] })}>
                  Limpar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ALERTAS ── */}
      {tab === 'alertas' && (
        <div>
          {alertas.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><CheckCircle size={40} style={{color:'#22c55e'}}/></div>
              <h3 style={{color:'#22c55e'}}>Estoque saudável!</h3>
              <p style={{color:'var(--text-muted)'}}>Nenhum produto abaixo do estoque mínimo.</p>
            </div>
          ) : (
            <div className="card">
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:600, fontSize:14 }}>⚠️ {alertas.length} produto(s) precisam de atenção</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Produto</th><th>Categoria</th><th>Estoque Atual</th><th>Estoque Mínimo</th><th>Situação</th><th>Ações</th></tr>
                  </thead>
                  <tbody>
                    {alertas.map(p => (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight:500 }}>{p.name}</div>
                          {p.brand && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{p.brand}</div>}
                        </td>
                        <td><span style={{ fontSize:12, padding:'2px 8px', borderRadius:12, background:'rgba(99,102,241,.12)', color:'#6366f1' }}>{p.category}</span></td>
                        <td><span style={{ fontWeight:700, fontSize:16, color: p.stock===0?'#f87171':'#f59e0b' }}>{p.stock}</span></td>
                        <td style={{ fontSize:13, color:'var(--text-muted)' }}>{p.min_stock}</td>
                        <td>
                          <span style={{ fontSize:12, padding:'3px 10px', borderRadius:20, fontWeight:600,
                            background: p.stock===0?'rgba(248,113,113,.15)':'rgba(245,158,11,.15)',
                            color: p.stock===0?'#f87171':'#f59e0b' }}>
                            {p.stock===0 ? 'ZERADO' : 'CRÍTICO'}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => { setTab('entrada'); setEntForm(f => ({...f, product_id: p.id})); }}
                            style={{ padding:'5px 12px', borderRadius:8, border:'none', cursor:'pointer', background:'rgba(34,197,94,.15)', color:'#22c55e', fontSize:12, fontWeight:600 }}>
                            + Entrada
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HISTÓRICO ── */}
      {tab === 'historico' && (
        <div>
          {movimentos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><History size={40}/></div>
              <h3>Nenhuma movimentação registrada.</h3>
            </div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Produto</th><th>Tipo</th><th>Quantidade</th><th>Custo</th><th>Fornecedor</th><th>Observações</th><th>Data</th></tr>
                  </thead>
                  <tbody>
                    {movimentos.map(m => (
                      <tr key={m.id}>
                        <td style={{ fontWeight:500 }}>{m.product_name}</td>
                        <td>
                          <span style={{ fontSize:12, padding:'3px 10px', borderRadius:20, fontWeight:600,
                            background: m.type==='entrada'?'rgba(34,197,94,.12)':m.type==='saida'?'rgba(248,113,113,.12)':'rgba(99,102,241,.12)',
                            color: m.type==='entrada'?'#22c55e':m.type==='saida'?'#f87171':'#6366f1' }}>
                            {m.type==='entrada'?'↓ Entrada':m.type==='saida'?'↑ Saída':'⟳ Ajuste'}
                          </span>
                        </td>
                        <td style={{ fontWeight:700 }}>{m.quantity}</td>
                        <td style={{ fontSize:13 }}>{m.cost_price ? formatBRL(m.cost_price) : '—'}</td>
                        <td style={{ fontSize:13 }}>{m.supplier || '—'}</td>
                        <td style={{ fontSize:13, color:'var(--text-muted)' }}>{m.notes || '—'}</td>
                        <td style={{ fontSize:13, color:'var(--text-muted)' }}>{new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Ajuste */}
      {showModal && selProduct && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth:420, width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {adjType==='entrada'?'↓ Entrada':adjType==='saida'?'↑ Saída':'⟳ Ajuste'} — {selProduct.name}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleAjuste}>
              <div className="modal-body">
                <div style={{ padding:'12px 16px', borderRadius:8, background:'var(--bg-card)', marginBottom:16, fontSize:13 }}>
                  Estoque atual: <strong style={{fontSize:16}}>{selProduct.stock}</strong>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label className="form-label">Tipo</label>
                  <div style={{ display:'flex', gap:8 }}>
                    {(['entrada','saida','ajuste'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setAdjType(t)}
                        style={{ flex:1, padding:'8px', borderRadius:8, border:'2px solid',
                          borderColor: adjType===t?'#6366f1':'rgba(255,255,255,.1)',
                          background: adjType===t?'rgba(99,102,241,.15)':'none',
                          color: adjType===t?'#6366f1':'var(--text-muted)',
                          cursor:'pointer', fontSize:13, fontWeight:600 }}>
                        {t==='entrada'?'↓ Entrada':t==='saida'?'↑ Saída':'⟳ Ajuste'}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label className="form-label">Quantidade *</label>
                  <input className="form-input" type="number" min="1" value={adjQty||''}
                    onChange={e => setAdjQty(parseInt(e.target.value)||0)} required/>
                </div>
                <div>
                  <label className="form-label">Observações</label>
                  <textarea className="form-input" rows={2} value={adjNotes} onChange={e => setAdjNotes(e.target.value)}/>
                </div>
                {adjQty > 0 && (
                  <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, background:'rgba(99,102,241,.08)', fontSize:13 }}>
                    Novo estoque: <strong style={{fontSize:16, color:'#6366f1'}}>
                      {adjType==='saida' ? Math.max(0, selProduct.stock - adjQty) : selProduct.stock + adjQty}
                    </strong>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Save size={15}/> {saving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

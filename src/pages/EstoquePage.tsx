import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatBRL } from '../types/index';
import {
  AlertTriangle, Package, Boxes, DollarSign,
  TrendingUp, TrendingDown, Search, X, Save,
  CheckCircle, Download
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Product {
  id: string; name: string; code?: string; category: string; brand?: string;
  cost_price: number; sale_price: number; stock: number; min_stock: number; active: boolean;
}

interface Movimento {
  id: string; product_id: string; product_name: string;
  type: 'entrada' | 'saida' | 'ajuste'; quantity: number;
  notes?: string; created_at: string;
}

export default function EstoquePage() {
  const { tenantId } = useAuth();
  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab]               = useState<'estoque'|'movimentos'>('estoque');
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);

  // Modal ajuste
  const [showModal, setShowModal]   = useState(false);
  const [selProduct, setSelProduct] = useState<Product | null>(null);
  const [adjType, setAdjType]       = useState<'entrada'|'saida'|'ajuste'>('entrada');
  const [adjQty, setAdjQty]         = useState(0);
  const [adjNotes, setAdjNotes]     = useState('');
  const [saving, setSaving]         = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('products').select('*')
      .eq('tenant_id', tenantId).eq('active', true).order('name');
    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  // Stats
  const totalProd   = products.length;
  const totalVal    = products.reduce((s,p) => s + p.sale_price * p.stock, 0);
  const totalCusto  = products.reduce((s,p) => s + p.cost_price * p.stock, 0);
  const criticos    = products.filter(p => p.stock > 0 && p.stock <= p.min_stock).length;
  const zerados     = products.filter(p => p.stock === 0).length;

  const categorias = [...new Set(products.map(p => p.category))];

  const filtered = useMemo(() => {
    let list = products;
    if (catFilter)   list = list.filter(p => p.category === catFilter);
    if (statusFilter === 'critico') list = list.filter(p => p.stock > 0 && p.stock <= p.min_stock);
    if (statusFilter === 'zerado')  list = list.filter(p => p.stock === 0);
    if (statusFilter === 'normal')  list = list.filter(p => p.stock > p.min_stock);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s));
    }
    return list;
  }, [products, search, catFilter, statusFilter]);

  const openAdjust = (p: Product) => {
    setSelProduct(p); setAdjType('entrada');
    setAdjQty(0); setAdjNotes(''); setShowModal(true);
  };

  const handleAdjust = async () => {
    if (!selProduct || adjQty <= 0) { toast.error('Informe uma quantidade válida'); return; }
    setSaving(true);
    try {
      let newStock = selProduct.stock;
      if (adjType === 'entrada') newStock += adjQty;
      else if (adjType === 'saida') newStock = Math.max(0, newStock - adjQty);
      else newStock = adjQty; // ajuste direto

      const { error } = await supabase.from('products')
        .update({ stock: newStock }).eq('id', selProduct.id);
      if (error) throw error;

      // Registrar movimento (em financial_transactions como proxy)
      await supabase.from('financial_transactions').insert([{
        tenant_id: tenantId,
        type: adjType === 'entrada' ? 'receita' : 'despesa',
        description: adjType === 'entrada'
          ? 'Entrada estoque: ' + selProduct.name
          : adjType === 'saida'
          ? 'Saída estoque: ' + selProduct.name
          : 'Ajuste estoque: ' + selProduct.name,
        category: 'Estoque',
        amount: adjQty * selProduct.cost_price,
        due_date: new Date().toISOString().split('T')[0],
        status: 'pago',
        notes: adjNotes || null,
        paid_at: new Date().toISOString(),
      }]);

      const label = adjType==='entrada' ? 'Entrada' : adjType==='saida' ? 'Saída' : 'Ajuste';
      toast.success(label + ' registrada! Novo estoque: ' + newStock);
      setShowModal(false);
      load();
    } catch (err: any) { toast.error(err.message || 'Erro ao ajustar'); }
    finally { setSaving(false); }
  };

  const exportCSV = () => {
    const header = 'Produto,Código,Categoria,Marca,Estoque,Mínimo,Custo Unit.,Venda Unit.,Valor Total';
    const rows = filtered.map(p =>
      [p.name,p.code,p.category,p.brand,p.stock,p.min_stock,p.cost_price,p.sale_price,p.sale_price*p.stock]
        .map(v => '"'+(v??'')+'"').join(','));
    const blob = new Blob([header+'\n'+rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'estoque.csv'; a.click(); toast.success('Exportado!');
  };

  const getStatusBadge = (p: Product) => {
    if (p.stock === 0)               return { label:'Zerado',  color:'#f87171', bg:'rgba(248,113,113,.15)' };
    if (p.stock <= p.min_stock)      return { label:'Crítico', color:'#f59e0b', bg:'rgba(245,158,11,.15)'  };
    return                                  { label:'Normal',  color:'#22c55e', bg:'rgba(34,197,94,.15)'   };
  };

  const IconBtn = ({ onClick, title, color, children }: any) => (
    <button onClick={onClick} title={title}
      style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
        borderRadius:7, padding:'5px 10px', cursor:'pointer', color:color||'var(--text-muted)',
        display:'flex', alignItems:'center', gap:5, fontSize:13, fontWeight:500 }}>
      {children}
    </button>
  );

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Boxes size={22}/> Controle de Estoque
          </h1>
          <p className="page-sub">{totalProd} produtos ativos</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginBottom:24 }}>
        {[
          { icon:<Package size={20}/>,    val: totalProd,        label:'Total Produtos',  color:'#6366f1',  sub:'' },
          { icon:<DollarSign size={20}/>, val: formatBRL(totalVal), label:'Valor em Estoque', color:'#22c55e', sub:'preço de venda' },
          { icon:<TrendingDown size={20}/>,val:formatBRL(totalCusto),label:'Custo Total',  color:'#06b6d4', sub:'preço de custo' },
          { icon:<AlertTriangle size={20}/>,val: criticos,        label:'Estoque Crítico', color:'#f59e0b',  sub:'abaixo do mínimo' },
          { icon:<X size={20}/>,          val: zerados,          label:'Produtos Zerados', color:'#f87171',  sub:'sem estoque' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:18, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:typeof s.val==='number'?24:16, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
            {s.sub && <div style={{ fontSize:11, color:'rgba(255,255,255,.25)', marginTop:1 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {[{k:'estoque',l:'📦 Estoque Atual'},{k:'movimentos',l:'📋 Histórico'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer',
              fontSize:14, fontWeight:600,
              color: tab===t.k ? '#6366f1' : 'var(--text-muted)',
              borderBottom: tab===t.k ? '2px solid #6366f1' : '2px solid transparent' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:200 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Pesquisar produto, código ou marca..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{ width:180 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Todas as Categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-input" style={{ width:160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos os Status</option>
          <option value="normal">✅ Normal</option>
          <option value="critico">⚠️ Crítico</option>
          <option value="zerado">🔴 Zerado</option>
        </select>
      </div>

      {/* ── ABA ESTOQUE ── */}
      {tab === 'estoque' && (
        loading ? <div className="empty-state"><p>Carregando...</p></div> :
        filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Boxes size={40}/></div>
            <h3>Nenhum produto encontrado.</h3>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th><th>Categoria</th><th>Estoque</th>
                    <th>Mínimo</th><th>Custo Unit.</th><th>Venda Unit.</th>
                    <th>Valor Total</th><th>Status</th><th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const st = getStatusBadge(p);
                    const valTotal = p.sale_price * p.stock;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <div style={{ width:32, height:32, borderRadius:8,
                              background:'rgba(99,102,241,.15)', display:'flex',
                              alignItems:'center', justifyContent:'center' }}>
                              <Package size={15} style={{ color:'#6366f1' }}/>
                            </div>
                            <div>
                              <div style={{ fontWeight:500 }}>{p.name}</div>
                              {p.brand && <div style={{ fontSize:12, color:'var(--text-muted)' }}>{p.brand}</div>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize:12, padding:'2px 8px', borderRadius:12,
                            background:'rgba(99,102,241,.15)', color:'#6366f1' }}>
                            {p.category}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize:18, fontWeight:800,
                            color: p.stock===0?'#f87171': p.stock<=p.min_stock?'#f59e0b':'var(--text)' }}>
                            {p.stock}
                          </span>
                          <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:4 }}>un</span>
                        </td>
                        <td style={{ fontSize:13, color:'var(--text-muted)' }}>{p.min_stock} un</td>
                        <td style={{ fontSize:13 }}>{formatBRL(p.cost_price)}</td>
                        <td style={{ fontSize:13 }}>{formatBRL(p.sale_price)}</td>
                        <td style={{ fontWeight:600 }}>{formatBRL(valTotal)}</td>
                        <td>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5,
                            fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20,
                            background:st.bg, color:st.color }}>
                            {st.label==='Normal'?<CheckCircle size={12}/>:<AlertTriangle size={12}/>}
                            {st.label}
                          </span>
                        </td>
                        <td>
                          <div style={{ display:'flex', gap:5 }}>
                            <IconBtn onClick={() => { setAdjType('entrada'); openAdjust(p); }} title="Entrada" color="#22c55e">
                              <TrendingUp size={13}/> Entrada
                            </IconBtn>
                            <IconBtn onClick={() => { setAdjType('saida'); openAdjust(p); }} title="Saída" color="#f87171">
                              <TrendingDown size={13}/> Saída
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
              {filtered.length} produto(s) | Valor total em estoque: {formatBRL(filtered.reduce((s,p)=>s+p.sale_price*p.stock,0))}
            </div>
          </div>
        )
      )}

      {/* ── ABA HISTÓRICO ── */}
      {tab === 'movimentos' && (
        <div className="card" style={{ padding:24 }}>
          <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-muted)' }}>
            <Boxes size={40} style={{ marginBottom:12, opacity:.4 }}/>
            <h3 style={{ marginBottom:8 }}>Histórico de Movimentações</h3>
            <p style={{ fontSize:14 }}>As movimentações de entrada e saída aparecerão aqui.</p>
          </div>
        </div>
      )}

      {/* Modal Ajuste */}
      {showModal && selProduct && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth:460, width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Ajuste de Estoque</h2>
              <button onClick={() => setShowModal(false)}><X size={18}/></button>
            </div>
            <div className="modal-body">
              {/* Info produto */}
              <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(99,102,241,.08)',
                border:'1px solid rgba(99,102,241,.2)', marginBottom:20 }}>
                <div style={{ fontWeight:600, fontSize:15 }}>{selProduct.name}</div>
                <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>
                  Estoque atual: <strong style={{ color:'#6366f1' }}>{selProduct.stock} un</strong>
                  {' · '}Mínimo: {selProduct.min_stock} un
                </div>
              </div>

              {/* Tipo */}
              <div style={{ marginBottom:16 }}>
                <label className="form-label">Tipo de Movimentação</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {[
                    { v:'entrada', l:'📥 Entrada', color:'#22c55e' },
                    { v:'saida',   l:'📤 Saída',   color:'#f87171' },
                    { v:'ajuste',  l:'🔧 Ajuste',  color:'#6366f1' },
                  ].map(t => (
                    <button key={t.v} onClick={() => setAdjType(t.v as any)}
                      style={{ padding:'10px 8px', borderRadius:8, border:'2px solid',
                        borderColor: adjType===t.v ? t.color : 'var(--border)',
                        background: adjType===t.v ? 'rgba(99,102,241,.08)' : 'var(--bg-card)',
                        color: adjType===t.v ? t.color : 'var(--text-muted)',
                        cursor:'pointer', fontSize:13, fontWeight:600 }}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantidade */}
              <div style={{ marginBottom:16 }}>
                <label className="form-label">
                  {adjType==='ajuste' ? 'Novo estoque total' : 'Quantidade'}
                </label>
                <input className="form-input" type="number" min="0" value={adjQty||''}
                  onChange={e => setAdjQty(parseInt(e.target.value)||0)}
                  placeholder={adjType==='ajuste' ? 'Novo total...' : 'Quantidade...'}/>
                {adjType !== 'ajuste' && adjQty > 0 && (
                  <div style={{ marginTop:6, fontSize:13, color:'var(--text-muted)' }}>
                    Novo estoque: <strong style={{ color: adjType==='entrada'?'#22c55e':'#f87171' }}>
                      {adjType==='entrada' ? selProduct.stock + adjQty : Math.max(0, selProduct.stock - adjQty)} un
                    </strong>
                  </div>
                )}
              </div>

              {/* Observação */}
              <div>
                <label className="form-label">Observação (opcional)</label>
                <input className="form-input" value={adjNotes} onChange={e => setAdjNotes(e.target.value)}
                  placeholder="Ex: Compra fornecedor, devolução cliente..."/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAdjust} disabled={saving||adjQty<=0}>
                <Save size={15}/> {saving?'Salvando...':'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

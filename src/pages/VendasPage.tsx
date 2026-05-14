import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, ShoppingCart, TrendingUp, DollarSign,
  Tag, X, Save, Eye, Trash2, Download, CreditCard,
  Banknote, Smartphone, Receipt, Package, Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL } from '../types/index';

const PAGAMENTOS = [
  { value:'dinheiro',     label:'Dinheiro',       icon:'💵' },
  { value:'pix',          label:'PIX',             icon:'📱' },
  { value:'credito',      label:'Cartão Crédito',  icon:'💳' },
  { value:'debito',       label:'Cartão Débito',   icon:'💳' },
  { value:'crediario',    label:'Crediário',       icon:'📋' },
  { value:'transferencia',label:'Transferência',   icon:'🏦' },
];

interface Product {
  id: string; name: string; sale_price: number; stock: number; category: string; brand?: string;
}
interface Customer { id: string; name: string; }
interface SaleItem {
  product_id: string; description: string; quantity: number; unit_price: number; total: number;
}
interface Sale {
  id: string; sale_number: number; customer_name: string; payment_method: string;
  installments: number; subtotal: number; discount: number; total: number;
  status: string; created_at: string; notes?: string;
}

export default function VendasPage() {
  const { tenantId } = useAuth();
  const [sales, setSales]         = useState<Sale[]>([]);
  const [products, setProducts]   = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'lista'|'pdv'>('lista');
  const [search, setSearch]       = useState('');
  const [dateFrom, setDateFrom]   = useState(new Date().toISOString().slice(0,8)+'01');
  const [dateTo, setDateTo]       = useState(new Date().toISOString().slice(0,10));
  const [viewSale, setViewSale]   = useState<Sale | null>(null);

  // PDV state
  const [cartItems, setCartItems]     = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerName, setCustomerName]         = useState('');
  const [productSearch, setProductSearch]       = useState('');
  const [discount, setDiscount]   = useState(0);
  const [payment, setPayment]     = useState('dinheiro');
  const [installments, setInstallments] = useState(1);
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [received, setReceived]   = useState(0);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: p }, { data: c }] = await Promise.all([
      supabase.from('sales').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100),
      supabase.from('products').select('id,name,sale_price,stock,category,brand').eq('tenant_id', tenantId).eq('active', true).order('name'),
      supabase.from('customers').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name'),
    ]);
    setSales((s as Sale[]) || []);
    setProducts((p as Product[]) || []);
    setCustomers((c as Customer[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  // Stats
  const totalMes   = sales.reduce((s, v) => s + (v.status==='concluida'?v.total:0), 0);
  const ticketMed  = sales.filter(v=>v.status==='concluida').length
    ? totalMes / sales.filter(v=>v.status==='concluida').length : 0;
  const totalDesc  = sales.reduce((s,v) => s + (v.discount||0), 0);
  const numVendas  = sales.filter(v=>v.status==='concluida').length;

  const filtered = useMemo(() => {
    let list = sales;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(v => v.customer_name?.toLowerCase().includes(s) || String(v.sale_number).includes(s));
    }
    if (dateFrom) list = list.filter(v => v.created_at >= dateFrom);
    if (dateTo)   list = list.filter(v => v.created_at <= dateTo+'T23:59:59');
    return list;
  }, [sales, search, dateFrom, dateTo]);

  // PDV — carrinho
  const subtotal = cartItems.reduce((s, i) => s + i.total, 0);
  const total    = Math.max(0, subtotal - discount);
  const troco    = payment === 'dinheiro' ? Math.max(0, received - total) : 0;

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 20);
    const s = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s)).slice(0, 20);
  }, [products, productSearch]);

  const addToCart = (p: Product) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.product_id === p.id);
      if (existing) {
        return prev.map(i => i.product_id === p.id
          ? { ...i, quantity: i.quantity+1, total: (i.quantity+1)*i.unit_price }
          : i);
      }
      return [...prev, { product_id:p.id, description:p.name, quantity:1, unit_price:p.sale_price, total:p.sale_price }];
    });
    setProductSearch('');
  };

  const updateQty = (idx: number, qty: number) => {
    if (qty <= 0) { removeItem(idx); return; }
    setCartItems(prev => prev.map((i,k) => k===idx ? { ...i, quantity:qty, total:qty*i.unit_price } : i));
  };

  const updatePrice = (idx: number, price: number) => {
    setCartItems(prev => prev.map((i,k) => k===idx ? { ...i, unit_price:price, total:i.quantity*price } : i));
  };

  const removeItem = (idx: number) => setCartItems(prev => prev.filter((_,k) => k!==idx));

  const clearCart = () => {
    setCartItems([]); setDiscount(0); setPayment('dinheiro');
    setInstallments(1); setNotes(''); setSelectedCustomer('');
    setCustomerName(''); setReceived(0);
  };

  const finalizeSale = async () => {
    if (cartItems.length === 0) { toast.error('Carrinho vazio!'); return; }
    if (!customerName.trim()) { toast.error('Informe o cliente'); return; }
    setSaving(true);
    try {
      // Criar venda
      const { data: saleData, error: saleErr } = await supabase.from('sales').insert([{
        tenant_id: tenantId,
        customer_id: selectedCustomer || null,
        customer_name: customerName,
        payment_method: payment,
        installments,
        subtotal, discount, total,
        status: 'concluida',
        notes: notes || null,
      }]).select().single();

      if (saleErr) throw saleErr;

      // Criar itens
      const items = cartItems.map(i => ({ ...i, sale_id: saleData.id, tenant_id: tenantId }));
      const { error: itemErr } = await supabase.from('sale_items').insert(items);
      if (itemErr) throw itemErr;

      // Atualizar estoque
      for (const item of cartItems) {
        if (item.product_id) {
          const prod = products.find(p => p.id === item.product_id);
          if (prod) {
            await supabase.from('products')
              .update({ stock: Math.max(0, prod.stock - item.quantity) })
              .eq('id', item.product_id);
          }
        }
      }

      // Se crediário, criar parcelas
      if (payment === 'crediario' && selectedCustomer && installments > 0) {
        const parcelVal = total / installments;
        const parcelas = Array.from({ length: installments }, (_, i) => {
          const due = new Date();
          due.setMonth(due.getMonth() + i + 1);
          return {
            tenant_id: tenantId,
            customer_id: selectedCustomer,
            customer_name: customerName,
            sale_id: saleData.id,
            total_amount: total,
            installments,
            status: 'ativo',
          };
        });
        const { data: credData, error: credErr } = await supabase.from('crediario').insert([parcelas[0]]).select().single();
        if (!credErr && credData) {
          const parc = Array.from({ length: installments }, (_, i) => {
            const due = new Date();
            due.setMonth(due.getMonth() + i + 1);
            return {
              crediario_id: credData.id,
              tenant_id: tenantId,
              installment_number: i + 1,
              due_date: due.toISOString().split('T')[0],
              amount: parcelVal,
              status: 'pendente',
            };
          });
          await supabase.from('crediario_parcelas').insert(parc);
        }
      }

      toast.success('Venda #' + saleData.sale_number + ' finalizada!');
      clearCart();
      setTab('lista');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao finalizar venda');
    } finally { setSaving(false); }
  };

  const exportCSV = () => {
    const header = 'Venda,Cliente,Pagamento,Subtotal,Desconto,Total,Data';
    const rows = filtered.map(v =>
      [v.sale_number, v.customer_name, v.payment_method, v.subtotal, v.discount, v.total,
       new Date(v.created_at).toLocaleDateString('pt-BR')]
        .map(x => '"'+(x??'')+'"').join(','));
    const blob = new Blob([header+'\n'+rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'vendas.csv'; a.click(); toast.success('Exportado!');
  };

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
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <ShoppingCart size={22}/> Gestão de Vendas
          </h1>
          <p className="page-sub">Acompanhamento e relatórios de desempenho</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Imprimir</button>
          <button className="btn btn-primary" onClick={() => setTab('pdv')}>
            <Plus size={16}/> Nova Venda
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {[{k:'lista',l:'📋 Lista de Vendas'},{k:'pdv',l:'🛒 PDV — Nova Venda'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer',
              fontSize:14, fontWeight:600, color: tab===t.k ? '#6366f1' : 'var(--text-muted)',
              borderBottom: tab===t.k ? '2px solid #6366f1' : '2px solid transparent',
              transition:'all .15s' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── LISTA ── */}
      {tab === 'lista' && (
        <>
          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
            {[
              { icon:<TrendingUp size={22}/>, val: numVendas, label:'Número de Vendas', color:'#6366f1' },
              { icon:<DollarSign size={22}/>, val: formatBRL(ticketMed), label:'Tíquete Médio', color:'#22c55e' },
              { icon:<Receipt size={22}/>, val: formatBRL(totalMes), label:'Total Líquido', color:'#06b6d4' },
              { icon:<Tag size={22}/>, val: formatBRL(totalDesc), label:'Descontos Conc.', color:'#f59e0b' },
            ].map((s,i) => (
              <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
                <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
                <div style={{ fontSize:typeof s.val==='number'?28:20, fontWeight:700, color:s.color }}>{s.val}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
            <div className="search-bar" style={{ flex:1, minWidth:220 }}>
              <Search size={15}/>
              <input className="form-input" placeholder="Nome, CPF, OS, ID..." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <input className="form-input" type="date" style={{ width:150 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
            <input className="form-input" type="date" style={{ width:150 }} value={dateTo} onChange={e => setDateTo(e.target.value)}/>
          </div>

          {/* Tabela */}
          {loading ? <div className="empty-state"><p>Carregando...</p></div> :
           filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><ShoppingCart size={40}/></div>
              <h3>Nenhuma venda encontrada.</h3>
              <button className="btn btn-primary" onClick={() => setTab('pdv')}><Plus size={15}/> Nova Venda</button>
            </div>
           ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Venda#</th><th>Cliente</th><th>Pagamento</th><th>Subtotal</th><th>Desconto</th><th>Total</th><th>Data</th><th>Ações</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map(v => (
                      <tr key={v.id}>
                        <td style={{ fontWeight:700, color:'#6366f1' }}>#{String(v.sale_number).padStart(4,'0')}</td>
                        <td style={{ fontWeight:500 }}>{v.customer_name||'—'}</td>
                        <td>
                          <span style={{ fontSize:12, padding:'2px 8px', borderRadius:12,
                            background:'rgba(99,102,241,.15)', color:'#6366f1' }}>
                            {PAGAMENTOS.find(p=>p.value===v.payment_method)?.icon} {PAGAMENTOS.find(p=>p.value===v.payment_method)?.label||v.payment_method}
                            {v.installments>1 ? ' ('+v.installments+'x)' : ''}
                          </span>
                        </td>
                        <td style={{ fontSize:13 }}>{formatBRL(v.subtotal)}</td>
                        <td style={{ fontSize:13, color:'#f87171' }}>{v.discount>0?'-'+formatBRL(v.discount):'—'}</td>
                        <td style={{ fontWeight:700, color:'#22c55e' }}>{formatBRL(v.total)}</td>
                        <td style={{ fontSize:13, color:'var(--text-muted)' }}>{new Date(v.created_at).toLocaleDateString('pt-BR')}</td>
                        <td>
                          <IconBtn onClick={() => setViewSale(v)} title="Ver detalhes" color="#94a3b8"><Eye size={14}/></IconBtn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
                {filtered.length} venda(s) | Total: {formatBRL(filtered.reduce((s,v)=>s+v.total,0))}
              </div>
            </div>
           )}
        </>
      )}

      {/* ── PDV ── */}
      {tab === 'pdv' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20, alignItems:'start' }}>

          {/* Coluna esquerda — produtos + itens */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Cliente */}
            <div className="card" style={{ padding:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                <Users size={16}/> Cliente
              </h3>
              <div style={{ display:'flex', gap:10 }}>
                <select className="form-input" style={{ flex:1 }} value={selectedCustomer}
                  onChange={e => {
                    const c = customers.find(c=>c.id===e.target.value);
                    setSelectedCustomer(e.target.value);
                    setCustomerName(c?.name||'');
                  }}>
                  <option value="">Selecionar cliente cadastrado...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input className="form-input" style={{ flex:1 }} placeholder="Ou digite o nome do cliente *"
                  value={customerName} onChange={e => { setCustomerName(e.target.value); setSelectedCustomer(''); }}/>
              </div>
            </div>

            {/* Busca de produtos */}
            <div className="card" style={{ padding:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                <Package size={16}/> Adicionar Produto
              </h3>
              <div className="search-bar" style={{ marginBottom:12 }}>
                <Search size={15}/>
                <input className="form-input" placeholder="Buscar produto por nome ou marca..."
                  value={productSearch} onChange={e => setProductSearch(e.target.value)}/>
              </div>
              {productSearch && (
                <div style={{ maxHeight:200, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
                  {filteredProducts.length === 0 ? (
                    <div style={{ padding:16, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Nenhum produto encontrado</div>
                  ) : filteredProducts.map(p => (
                    <div key={p.id} onClick={() => addToCart(p)}
                      style={{ padding:'10px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between',
                        alignItems:'center', borderBottom:'1px solid var(--border)', transition:'background .1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background='rgba(99,102,241,.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background='')}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{p.name}</div>
                        <div style={{ fontSize:12, color:'var(--text-muted)' }}>{p.brand} · Estoque: {p.stock}</div>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#6366f1' }}>{formatBRL(p.sale_price)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Itens do carrinho */}
            <div className="card" style={{ padding:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                <ShoppingCart size={16}/> Itens ({cartItems.length})
              </h3>
              {cartItems.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-muted)', fontSize:14 }}>
                  Nenhum item adicionado
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Produto</th><th>Qtd</th><th>Preço Unit.</th><th>Total</th><th></th></tr>
                    </thead>
                    <tbody>
                      {cartItems.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontSize:13 }}>{item.description}</td>
                          <td>
                            <input type="number" min="1" value={item.quantity}
                              onChange={e => updateQty(idx, parseInt(e.target.value)||1)}
                              style={{ width:60, padding:'4px 8px', borderRadius:6,
                                background:'var(--bg-input)', border:'1px solid var(--border)',
                                color:'var(--text)', textAlign:'center' }}/>
                          </td>
                          <td>
                            <input type="number" min="0" step="0.01" value={item.unit_price}
                              onChange={e => updatePrice(idx, parseFloat(e.target.value)||0)}
                              style={{ width:90, padding:'4px 8px', borderRadius:6,
                                background:'var(--bg-input)', border:'1px solid var(--border)', color:'var(--text)' }}/>
                          </td>
                          <td style={{ fontWeight:600 }}>{formatBRL(item.total)}</td>
                          <td>
                            <button onClick={() => removeItem(idx)} style={{ background:'none', border:'none',
                              cursor:'pointer', color:'#f87171', padding:4 }}>
                              <Trash2 size={14}/>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Coluna direita — resumo + pagamento */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Resumo */}
            <div className="card" style={{ padding:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Resumo da Venda</h3>

              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:14 }}>
                <span style={{ color:'var(--text-muted)' }}>Subtotal</span>
                <span>{formatBRL(subtotal)}</span>
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:14, color:'var(--text-muted)' }}>Desconto (R$)</span>
                <input type="number" min="0" step="0.01" value={discount}
                  onChange={e => setDiscount(parseFloat(e.target.value)||0)}
                  style={{ width:100, padding:'4px 8px', borderRadius:6, textAlign:'right',
                    background:'var(--bg-input)', border:'1px solid var(--border)', color:'#f87171', fontSize:14 }}/>
              </div>

              <div style={{ borderTop:'2px solid var(--border)', paddingTop:12, marginTop:4,
                display:'flex', justifyContent:'space-between', fontSize:20, fontWeight:800 }}>
                <span>Total</span>
                <span style={{ color:'#6366f1' }}>{formatBRL(total)}</span>
              </div>
            </div>

            {/* Pagamento */}
            <div className="card" style={{ padding:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Forma de Pagamento</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                {PAGAMENTOS.map(p => (
                  <button key={p.value} onClick={() => setPayment(p.value)}
                    style={{ padding:'10px 8px', borderRadius:8, border:'2px solid',
                      borderColor: payment===p.value ? '#6366f1' : 'var(--border)',
                      background: payment===p.value ? 'rgba(99,102,241,.12)' : 'var(--bg-card)',
                      color: payment===p.value ? '#6366f1' : 'var(--text-muted)',
                      cursor:'pointer', fontSize:12, fontWeight:600, transition:'all .15s' }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>

              {(payment==='credito'||payment==='crediario') && (
                <div style={{ marginBottom:12 }}>
                  <label className="form-label">Parcelas</label>
                  <select className="form-input" value={installments} onChange={e => setInstallments(parseInt(e.target.value))}>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                      <option key={n} value={n}>{n}x {formatBRL(total/n)}</option>
                    ))}
                  </select>
                </div>
              )}

              {payment==='dinheiro' && (
                <div style={{ marginBottom:12 }}>
                  <label className="form-label">Valor recebido (R$)</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={received||''}
                    onChange={e => setReceived(parseFloat(e.target.value)||0)}
                    placeholder="0,00"/>
                  {received >= total && total > 0 && (
                    <div style={{ marginTop:8, padding:'8px 12px', borderRadius:8,
                      background:'rgba(34,197,94,.12)', color:'#22c55e', fontSize:14, fontWeight:600 }}>
                      Troco: {formatBRL(troco)}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom:12 }}>
                <label className="form-label">Observações</label>
                <textarea className="form-input" rows={2} value={notes}
                  onChange={e => setNotes(e.target.value)} placeholder="Observação opcional..."/>
              </div>

              <button onClick={finalizeSale} disabled={saving || cartItems.length===0}
                style={{ width:'100%', padding:'14px', borderRadius:10, border:'none',
                  background: cartItems.length===0 ? 'rgba(99,102,241,.3)' : 'linear-gradient(135deg,#6366f1,#06b6d4)',
                  color:'white', fontSize:16, fontWeight:700, cursor: cartItems.length===0?'not-allowed':'pointer',
                  transition:'all .2s' }}>
                {saving ? 'Finalizando...' : '✅ Finalizar Venda — '+formatBRL(total)}
              </button>

              <button onClick={clearCart} style={{ width:'100%', marginTop:8, padding:'10px',
                borderRadius:10, border:'1px solid var(--border)', background:'none',
                color:'var(--text-muted)', fontSize:14, cursor:'pointer' }}>
                🗑️ Limpar carrinho
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal visualizar venda */}
      {viewSale && (
        <div className="modal-overlay" onClick={() => setViewSale(null)}>
          <div className="modal" style={{ maxWidth:500, width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Venda #{String(viewSale.sale_number).padStart(4,'0')}</h2>
              <button onClick={() => setViewSale(null)}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  ['Cliente', viewSale.customer_name],
                  ['Pagamento', PAGAMENTOS.find(p=>p.value===viewSale.payment_method)?.label||viewSale.payment_method],
                  ['Parcelas', viewSale.installments+'x'],
                  ['Data', new Date(viewSale.created_at).toLocaleDateString('pt-BR')],
                  ['Subtotal', formatBRL(viewSale.subtotal)],
                  ['Desconto', formatBRL(viewSale.discount)],
                ].map(([k,v]) => (
                  <div key={k as string} style={{ padding:'10px 14px', background:'var(--bg-card)', borderRadius:8 }}>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>{k}</div>
                    <div style={{ fontSize:14, fontWeight:500 }}>{v}</div>
                  </div>
                ))}
                <div style={{ gridColumn:'1/-1', padding:'12px 14px', background:'rgba(99,102,241,.1)', borderRadius:8 }}>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>TOTAL</div>
                  <div style={{ fontSize:20, fontWeight:800, color:'#6366f1' }}>{formatBRL(viewSale.total)}</div>
                </div>
                {viewSale.notes && (
                  <div style={{ gridColumn:'1/-1', padding:'10px 14px', background:'var(--bg-card)', borderRadius:8 }}>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>Observações</div>
                    <div style={{ fontSize:14 }}>{viewSale.notes}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewSale(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

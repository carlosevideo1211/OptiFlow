import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import {
  Plus, Search, ShoppingCart, X, Eye, Trash2, Download, Receipt,
  Users, FileText, Printer, Save
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL } from '../types/index';
import { norm } from '../utils/normalize';
import {
  PAGAMENTOS, formatDate, formatDateTime,
  type Product, type Customer, type SaleItem, type Sale, type OS, type StoreSettings,
} from './vendas/vendasTypes';
import {
  imprimirComprovante as imprimirComprovanteDoc,
  imprimirCarne as imprimirCarneDoc,
  imprimirInstrumentoDivida as imprimirInstrumentoDividaDoc,
  imprimirQuitacao as imprimirQuitacaoDoc,
} from './vendas/vendaDocumentos';

export default function VendasPage() {
  const { tenantId } = useAuth();
  const [sales, setSales]         = useState<Sale[]>([]);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 50;
  const [products, setProducts]   = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders]       = useState<OS[]>([]);
  const [profissionais, setProfissionais] = useState<{id:string;name:string}[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [boletoHabilitado, setBoletoHabilitado] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'lista' | 'pdv' | 'caixa'>('lista');
  const [caixaData, setCaixaData] = useState<any[]>([]);
  const [caixaLoading, setCaixaLoading] = useState(false);
  const [search, setSearch]       = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [dateFrom, setDateFrom]   = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo]       = useState(new Date().toISOString().slice(0, 10));
  const [viewSale, setViewSale]   = useState<Sale | null>(null);

  // PDV
  const [cartItems, setCartItems]               = useState<SaleItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerName, setCustomerName]         = useState('');
  const [productSearch, setProductSearch]       = useState('');
  const [osSearch, setOsSearch]                 = useState('');
  const [showOsSug, setShowOsSug]               = useState(false);
  const [showProductSug, setShowProductSug]     = useState(false);
  const [discount, setDiscount]     = useState(0);
  const [entrada, setEntrada]       = useState(0);
  const [payment, setPayment]       = useState('dinheiro');
  const [installments, setInstallments] = useState(1);
  const [dueDate, setDueDate]       = useState('');
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [parcelasEdit, setParcelasEdit] = useState<{amount:number;due_date:string}[]>([]);
  const gerarParcelasEdit = (n:number,saldoVal:number,firstDate:string) => {
    const base=firstDate?new Date(firstDate+'T12:00:00'):new Date();
    const vBase=Math.floor((saldoVal/n)*100)/100;
    const resto=Math.round((saldoVal-vBase*n)*100)/100;
    return Array.from({length:n},(_,i)=>{const d=new Date(base);d.setMonth(d.getMonth()+i);return{amount:i===0?vBase+resto:vBase,due_date:d.toISOString().split('T')[0]};});
  };
  const [received, setReceived]     = useState(0);
  const [funcionario, setFuncionario] = useState('');
  const [osVinculada, setOsVinculada] = useState<OS | null>(null);
  const [saleDate, setSaleDate]     = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    setLoading(true);
    const [s, { data: o }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from('sales').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).range(from, to)),
      supabase.from('service_orders').select('id,os_number,customer_name,customer_id,frame_brand,frame_model,frame_color,frame_price,lens_type,lens_brand,lens_price,total,discount,entrada,od_esf,od_cil,od_eixo,oe_esf,oe_cil,oe_eixo,medico,obs_cliente,status').eq('tenant_id', tenantId).neq('status','entregue').neq('status','cancelada').order('created_at', { ascending: false }).limit(100),
    ]);
    const [pAll, cAll] = await Promise.all([
      fetchAllRows<Product>((from, to) => supabase.from('products').select('id,name,sale_price,stock,category,brand,code').eq('tenant_id', tenantId).eq('active', true).order('name').range(from, to)),
      fetchAllRows<Customer>((from, to) => supabase.from('customers').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name').range(from, to)),
    ]);
    setSales((s as Sale[]) || []);
    setProducts(pAll);
    setCustomers(cAll);
    setOrders((o as OS[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);
  useEffect(() => {
    if (!tenantId) return;
    supabase.from('funcionarios').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setProfissionais((data || []) as {id:string;name:string}[]));
    supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single()
      .then(({ data }) => { if (data) setStoreSettings(data as StoreSettings); });
    supabase.from('tenants').select('boleto_habilitado').eq('id', tenantId).single()
      .then(({ data }) => { setBoletoHabilitado(!!data?.boleto_habilitado); });
  }, [tenantId]);

  // Caixa do Dia - adicionado 22/07/2026, pedido da Larissa (Otica Evangelista Castanho).
  // Fonte unica: financial_transactions, que ja recebe tanto a entrada/pagamento a vista
  // de vendas quanto os pagamentos de parcelas do crediario (corrigido para usar a forma
  // de pagamento real, nao mais fixo como 'crediario').
  const loadCaixa = async () => {
    if (!tenantId) return;
    setCaixaLoading(true);
    const hojeStr = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('type', 'receita')
      .eq('status', 'pago')
      .gte('paid_at', hojeStr + 'T00:00:00')
      .lte('paid_at', hojeStr + 'T23:59:59')
      .order('paid_at', { ascending: false });
    setCaixaData(data || []);
    setCaixaLoading(false);
  };
  useEffect(() => { if (tab === 'caixa' && tenantId) loadCaixa(); }, [tab, tenantId]);

  const FORMA_LABELS: Record<string, { label: string; icon: string }> = {
    dinheiro: { label: 'Dinheiro', icon: '💵' },
    pix: { label: 'Pix', icon: '📱' },
    cartao: { label: 'Cartão', icon: '💳' },
    credito: { label: 'Cartão Crédito', icon: '💳' },
    debito: { label: 'Cartão Débito', icon: '🏧' },
    transferencia: { label: 'Transferência', icon: '🏦' },
    boleto: { label: 'Boleto', icon: '📄' },
  };
  const caixaPorForma = useMemo(() => {
    const map: Record<string, number> = {};
    caixaData.forEach((t: any) => { const k = t.payment_method || 'outro'; map[k] = (map[k] || 0) + Number(t.amount || 0); });
    return map;
  }, [caixaData]);
  const caixaTotal = caixaData.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

  const totalPeriodo = sales.reduce((s, v) => s + (v.status === 'concluida' ? v.total : 0), 0);
  const ticketMed    = sales.filter(v => v.status === 'concluida').length ? totalPeriodo / sales.filter(v => v.status === 'concluida').length : 0;
  const totalDesc    = sales.reduce((s, v) => s + (v.discount || 0), 0);
  const numVendas    = sales.filter(v => v.status === 'concluida').length;
  const vendedores   = useMemo(() => [...new Set(sales.map(v => v.vendedor).filter(Boolean))], [sales]);

  const filtered = useMemo(() => {
    let list = sales;
    const buscando = search.trim().length > 0;
    if (buscando) {
      const s = norm(search);
      list = list.filter(v => norm(v.customer_name).includes(s) || String(v.sale_number).includes(s) || norm(v.vendedor).includes(s));
    }
    if (vendedorFilter) list = list.filter(v => v.vendedor === vendedorFilter);
    // O filtro de data so se aplica quando NAO ha busca por nome/OS/ID ativa —
    // buscar um cliente deve sempre achar a compra dele, seja de que data for.
    if (!buscando) {
      if (dateFrom) list = list.filter(v => v.created_at >= dateFrom);
      if (dateTo)   list = list.filter(v => v.created_at <= dateTo + 'T23:59:59');
    }
    return list;
  }, [sales, search, vendedorFilter, dateFrom, dateTo]);

  const subtotal = cartItems.reduce((s, i) => s + i.total + i.acrescimo, 0);
  const total    = Math.max(0, subtotal - discount);
  const saldo    = Math.max(0, total - entrada);
  const troco    = payment === 'dinheiro' ? Math.max(0, received - saldo) : 0;

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const s = norm(productSearch);
    return products.filter(p => norm(p.name).includes(s) || norm(p.brand).includes(s) || norm(p.code).includes(s)).slice(0, 15);
  }, [products, productSearch]);

  const filteredOS = useMemo(() => {
    const available = orders.filter(o => o.status !== 'entregue' && o.status !== 'cancelada');
    if (!osSearch.trim()) return available.slice(0, 8);
    const s = norm(osSearch);
    return available.filter(o => norm(o.customer_name).includes(s) || String(o.os_number).includes(s)).slice(0, 8);
  }, [orders, osSearch]);

  const importarOS = async (os: OS) => {
    setOsVinculada(os); setCustomerName(os.customer_name); setSelectedCustomer(os.customer_id || '');
    setEntrada(os.entrada || 0); setDiscount(os.discount || 0);
    const { data: itens } = await supabase.from('os_itens').select('*').eq('os_id', os.id).order('created_at');
    const newItems: SaleItem[] = (itens || []).map((i: any) => ({ product_id: i.product_id || '', description: i.descricao, quantity: i.quantidade, unit_price: i.valor_unitario, total: i.valor_total, acrescimo: 0 }));
    if (newItems.length > 0) setCartItems(newItems);
    setOsSearch(''); setShowOsSug(false);
    toast.success('OS #' + String(os.os_number).padStart(4, '0') + ' importada!');
  };

  const addToCart = (p: Product) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.product_id === p.id);
      if (existing) return prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unit_price } : i);
      return [...prev, { product_id: p.id, description: p.name, quantity: 1, unit_price: p.sale_price, total: p.sale_price, acrescimo: 0 }];
    });
    setProductSearch(''); setShowProductSug(false);
  };

  const updateQty = (idx: number, qty: number) => { if (qty <= 0) { removeItem(idx); return; } setCartItems(prev => prev.map((i, k) => k === idx ? { ...i, quantity: qty, total: qty * i.unit_price } : i)); };
  const updatePrice = (idx: number, price: number) => setCartItems(prev => prev.map((i, k) => k === idx ? { ...i, unit_price: price, total: i.quantity * price } : i));
  const updateAcrescimo = (idx: number, val: number) => setCartItems(prev => prev.map((i, k) => k === idx ? { ...i, acrescimo: val } : i));
  const removeItem = (idx: number) => setCartItems(prev => prev.filter((_, k) => k !== idx));

  const clearCart = () => {
    setCartItems([]); setDiscount(0); setEntrada(0); setPayment('dinheiro');
    setInstallments(1); setNotes(''); setSelectedCustomer(''); setCustomerName('');
    setReceived(0); setOsVinculada(null); setFuncionario(''); setDueDate('');
    setSaleDate(new Date().toISOString().slice(0, 10));
  };

  const excluirVenda = async (v: Sale) => {
    if (!confirm('Excluir permanentemente a venda #' + String(v.sale_number).padStart(4, '0') + '?')) return;
    await supabase.from('sale_items').delete().eq('sale_id', v.id);
    await supabase.from('sales').delete().eq('id', v.id);
    toast.success('Venda excluída'); load();
  };

  const gerarBoleto = async () => {
  if (saving) return;
    if (cartItems.length === 0) { toast.error('Carrinho vazio!'); return; }
    if (!customerName.trim()) { toast.error('Informe o cliente'); return; }
    if (!selectedCustomer) { toast.error('Selecione um cliente cadastrado'); return; }
    setSaving(true);
    try {
      const { data: cust } = await supabase.from('customers').select('name,cpf,email').eq('id', selectedCustomer).single();
      if (!cust?.cpf) { toast.error('Cliente sem CPF cadastrado. Cadastre o CPF para gerar boleto.'); setSaving(false); return; }
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 3);
      const dueDateStr = dueDate.toISOString().split('T')[0];
      const { data, error } = await supabase.functions.invoke('create-boleto', {
        body: { customer_name: cust.name, customer_cpf: cust.cpf, customer_email: cust.email || '', amount: total, due_date: dueDateStr, description: 'Venda OptiFlow - ' + customerName, asaas_key: (storeSettings as any)?.asaas_key || '', asaas_env: (storeSettings as any)?.asaas_env || 'sandbox' }
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro ao gerar boleto');
      toast.success('Boleto gerado com sucesso!');
      if (data.boleto_url) window.open(data.boleto_url, '_blank');
      else if (data.invoice_url) window.open(data.invoice_url, '_blank');
    } catch(e: any) { toast.error(e.message || 'Erro ao gerar boleto'); }
    finally { setSaving(false); }
  };

  const finalizeSale = async () => {
    if (saving) return;
    if (cartItems.length === 0) { toast.error('Carrinho vazio!'); return; }
    if (!customerName.trim()) { toast.error('Informe o cliente'); return; }
    if (!osVinculada) { toast.error('⚠ Obrigatório vincular uma Ordem de Serviço!', { duration: 5000 }); return; }
    setSaving(true);
    try {
      const { data: saleData, error: saleErr } = await supabase.from('sales').insert([{
        tenant_id: tenantId, customer_id: selectedCustomer || null, customer_name: customerName,
        payment_method: payment, installments, subtotal, discount, total: Math.max(0, subtotal - (discount||0) - (entrada||0)),
        entrada: entrada || 0, vendedor: funcionario || null,
        os_id: osVinculada?.id || null, os_number: osVinculada?.os_number || null, status: 'concluida',
        notes: [notes, osVinculada ? 'OS #' + String(osVinculada.os_number).padStart(4, '0') : '', funcionario ? 'Funcionário: ' + funcionario : ''].filter(Boolean).join(' | ') || null,
      }]).select().single();
      if (saleErr) throw saleErr;
      await supabase.from('sale_items').insert(cartItems.map(i => ({ product_id: i.product_id || null, description: i.description, quantity: i.quantity, unit_price: i.unit_price, total: i.total + i.acrescimo, sale_id: saleData.id, tenant_id: tenantId })));
      for (const item of cartItems) { if (item.product_id) { const prod = products.find(p => p.id === item.product_id); if (prod) await supabase.from('products').update({ stock: Math.max(0, prod.stock - item.quantity) }).eq('id', item.product_id); } }
      if (osVinculada?.id) { await supabase.from('service_orders').update({ status: 'entregue' }).eq('id', osVinculada.id); }
      if (payment === 'crediario' && selectedCustomer && installments > 0) {
        const { data: credData } = await supabase.from('crediario').insert([{ tenant_id: tenantId, customer_id: selectedCustomer, customer_name: customerName, sale_id: saleData.id, total_amount: saldo, installments, status: 'ativo' }]).select().single();
        if (credData) {
          const totalDevedor = Math.max(0, subtotal - (discount||0) - (entrada||0));
          const parcelas = parcelasEdit.length === installments ? parcelasEdit : Array.from({ length: installments }, (_, i) => { const due = dueDate ? new Date(dueDate + 'T12:00:00') : new Date(); due.setMonth(due.getMonth() + i); return { amount: totalDevedor/installments, due_date: due.toISOString().split('T')[0] }; });
          await supabase.from('crediario_parcelas').insert(parcelas.map((p, i) => ({ crediario_id: credData.id, tenant_id: tenantId, installment_number: i+1, due_date: p.due_date, amount: p.amount, status: 'pendente' })));
        }
      }
      try {
        // Lançamento da entrada ou pagamento à vista
        const entradaAmount = payment === 'crediario' ? (entrada||0) : Math.max(0, total - (discount||0));
        if (entradaAmount > 0) {
          await supabase.from('financial_transactions').insert([{
            tenant_id: tenantId, type: 'receita',
            description: 'Venda #' + saleData.sale_number + (customerName ? ' — ' + customerName : ''),
            category: 'Vendas', amount: entradaAmount,
            due_date: new Date().toISOString().split('T')[0],
            paid_at: new Date().toISOString(), status: 'pago', payment_method: payment
          }]);
        }
        // Lançar parcelas do crediário como contas a receber
        const parcelasFinanceiro = parcelasEdit.length > 0 ? parcelasEdit : Array.from({length: installments||1}, (_,i) => { const due = dueDate ? new Date(dueDate+'T12:00:00') : new Date(); due.setMonth(due.getMonth()+i); return {amount: Math.max(0,total-(discount||0)-(entrada||0))/(installments||1), due_date: due.toISOString().split('T')[0]}; });
        if (payment === 'crediario' && parcelasFinanceiro.length > 0) {
          const parcelasTransactions = parcelasFinanceiro.map((p: any, i: number) => ({
            tenant_id: tenantId, type: 'receita',
            description: 'Crediário Venda #' + saleData.sale_number + ' — Parcela ' + (i+1) + '/' + parcelasFinanceiro.length + (customerName ? ' — ' + customerName : ''),
            category: 'Crediário', amount: p.amount,
            due_date: p.due_date, paid_at: null, status: 'pendente', payment_method: 'crediario'
          }));
          await supabase.from('financial_transactions').insert(parcelasTransactions);
        }
      } catch (finErr) { console.error('FINANCEIRO ERRO:', finErr); }
      toast.success('✅ Venda #' + saleData.sale_number + ' finalizada!');
      clearCart(); setTab('lista'); load();
    } catch (err: any) { toast.error(err.message || 'Erro ao finalizar venda'); }
    finally { setSaving(false); }
  };

  const exportCSV = () => {
    const header = 'Venda,Cliente,Vendedor,Pagamento,Subtotal,Desconto,Entrada,Total,Data';
    const rows = filtered.map(v => [v.sale_number, v.customer_name, v.vendedor || '', v.payment_method, v.subtotal, v.discount, v.entrada || 0, v.total, formatDate(v.created_at)].map(x => '"' + (x ?? '') + '"').join(','));
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'vendas.csv'; a.click();
    toast.success('Exportado!');
  };

  // Geração dos documentos imprimíveis da venda (comprovante, carnê,
  // instrumento de dívida, quitação) — lógica movida pra ./vendas/vendaDocumentos.ts
  // pra este arquivo não ficar tão grande. Comportamento idêntico ao de antes,
  // só passando `storeSettings` explicitamente em vez de via closure.
  const imprimirComprovante = (v: Sale) => imprimirComprovanteDoc(v, storeSettings);
  const imprimirCarne = (v: Sale) => imprimirCarneDoc(v, storeSettings);
  const imprimirInstrumentoDivida = (v: Sale) => imprimirInstrumentoDividaDoc(v, storeSettings);
  const imprimirQuitacao = (v: Sale) => imprimirQuitacaoDoc(v, storeSettings);
  const IconBtn = ({ onClick, title, color, children }: any) => (
    <button onClick={onClick} title={title} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '5px 7px', cursor: 'pointer', color: color || 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
      {children}
    </button>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShoppingCart size={22} /> Gestão de Vendas</h1>
          <p className="page-sub">PDV e acompanhamento de desempenho</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15} /> Exportar</button>
          <button className="btn btn-primary" onClick={() => setTab('pdv')}><Plus size={16} /> Nova Venda</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {[{ k: 'lista', l: '📋 Lista de Vendas' }, { k: 'pdv', l: '🛒 PDV — Nova Venda' }, { k: 'caixa', l: '🧾 Caixa do Dia' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)} style={{ padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: tab === t.k ? '#6366f1' : 'var(--text-muted)', borderBottom: tab === t.k ? '2px solid #6366f1' : '2px solid transparent', transition: 'all .15s' }}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'lista' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { val: numVendas, label: 'Número de Vendas', color: '#6366f1' },
              { val: formatBRL(ticketMed), label: 'Tíquete Médio', color: '#22c55e' },
              { val: formatBRL(totalPeriodo), label: 'Total Líquido', color: '#06b6d4' },
              { val: formatBRL(totalDesc), label: 'Descontos Conc.', color: '#f59e0b' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: 20, borderTop: '3px solid ' + s.color }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
              <Search size={15} />
              <input className="form-input" placeholder="Nome, CPF, OS, ID..." value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)} />
            </div>
            <button className="btn btn-secondary" onClick={() => setSearch(searchInput)} style={{ padding: '0 16px', height: 38 }}><Search size={15} /></button>
            <input className="form-input" type="date" style={{ width: 150 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <input className="form-input" type="date" style={{ width: 150 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            <select className="form-input" style={{ width: 180 }} value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)}>
              <option value="">Todos vendedores</option>
              {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {loading ? <div className="empty-state"><p>Carregando...</p></div> :
            filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><ShoppingCart size={40} /></div>
                <h3>Nenhuma venda encontrada.</h3>
                <button className="btn btn-primary" onClick={() => setTab('pdv')}><Plus size={15} /> Nova Venda</button>
              </div>
            ) : (
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Cliente / Vendedor</th>
                        <th style={{ textAlign: 'center' }}>Venda / Data</th>
                        <th style={{ textAlign: 'center' }}>Valor Total</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA).map(v => {
                        const pag = PAGAMENTOS.find(p => p.value === v.payment_method);
                        return (
                          <tr key={v.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{v.customer_name || '—'}</div>
                              {v.vendedor && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Vendedor: {v.vendedor}</div>}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 700, color: '#6366f1' }}>#{String(v.sale_number).padStart(4, '0')}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{formatDateTime(v.created_at)}</div>
                              <div style={{ marginTop: 4 }}>
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(99,102,241,.15)', color: '#6366f1', display: 'inline-block' }}>
                                  {pag?.icon} {pag?.label || v.payment_method}{v.installments > 1 ? ' ' + v.installments + 'x' : ''}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, marginTop: 3, color: v.status === 'concluida' ? '#22c55e' : v.status === 'cancelada' ? '#f87171' : 'var(--text-muted)' }}>
                                {v.status === 'concluida' ? '✓ Concluída' : v.status === 'cancelada' ? '✗ Cancelada' : v.status}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 700, color: '#22c55e', fontSize: 15 }}>{formatBRL(v.total)}</div>
                              {(v.entrada || 0) > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>— {formatBRL(v.entrada || 0)} entrada</div>}
                              {v.discount > 0 && <div style={{ fontSize: 11, color: '#f87171' }}>— {formatBRL(v.discount)} desc.</div>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <IconBtn onClick={() => setViewSale(v)} title="Ver detalhes" color="#94a3b8"><Eye size={14} /></IconBtn>
                                <IconBtn onClick={() => imprimirComprovante(v)} title="Comprovante de pagamento" color="#06b6d4"><FileText size={14} /></IconBtn>
                                <IconBtn onClick={() => imprimirCarne(v)} title="Carnê de pagamento" color="#f59e0b"><Receipt size={14} /></IconBtn>
                                <IconBtn onClick={() => imprimirInstrumentoDivida(v)} title="Instrumento de dívida" color="#a855f7"><Save size={14} /></IconBtn>
                                <IconBtn onClick={() => imprimirQuitacao(v)} title="Comprovante de quitação" color="#22c55e"><FileText size={14} /></IconBtn>
                                <IconBtn onClick={() => imprimirComprovante(v)} title="Imprimir" color="#6366f1"><Printer size={14} /></IconBtn>
                                <IconBtn onClick={() => excluirVenda(v)} title="Excluir venda" color="#f87171"><Trash2 size={14} /></IconBtn>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                  {filtered.length} venda(s) | Total: {formatBRL(filtered.reduce((s, v) => s + v.total, 0))} — Pag. {pagina}/{Math.ceil(filtered.length/POR_PAGINA)}
                  <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                    <button onClick={() => setPagina(p => Math.max(1,p-1))} disabled={pagina===1} style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:pagina===1?'transparent':'var(--primary)', color:pagina===1?'var(--text-muted)':'#fff', cursor:pagina===1?'not-allowed':'pointer', fontSize:12 }}>← Ant</button>
                    {Array.from({length:Math.ceil(filtered.length/POR_PAGINA)},(_,i)=>i+1).filter(n=>Math.abs(n-pagina)<=2).map(n=>(<button key={n} onClick={()=>setPagina(n)} style={{ padding:'3px 8px', borderRadius:6, border:'1px solid var(--border)', background:n===pagina?'var(--primary)':'transparent', color:n===pagina?'#fff':'var(--text-muted)', cursor:'pointer', fontWeight:n===pagina?700:400, fontSize:12 }}>{n}</button>))}
                    <button onClick={() => setPagina(p => Math.min(Math.ceil(filtered.length/POR_PAGINA),p+1))} disabled={pagina===Math.ceil(filtered.length/POR_PAGINA)} style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:pagina===Math.ceil(filtered.length/POR_PAGINA)?'transparent':'var(--primary)', color:pagina===Math.ceil(filtered.length/POR_PAGINA)?'var(--text-muted)':'#fff', cursor:pagina===Math.ceil(filtered.length/POR_PAGINA)?'not-allowed':'pointer', fontSize:12 }}>Prox →</button>
                  </div>
                </div>
              </div>
            )}
        </>
      )}

      {tab === 'caixa' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Caixa do Dia</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <button className="btn btn-secondary" onClick={loadCaixa}>🔄 Atualizar</button>
          </div>

          {caixaLoading ? (
            <div className="empty-state"><p>Carregando...</p></div>
          ) : caixaData.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Receipt size={40} /></div>
              <h3>Nenhum recebimento hoje ainda.</h3>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 20 }}>
                {Object.entries(caixaPorForma).map(([forma, valor]) => {
                  const info = FORMA_LABELS[forma] || { label: forma, icon: '💰' };
                  return (
                    <div key={forma} className="card" style={{ padding: 16, borderTop: '3px solid #6366f1' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{info.icon} {info.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{formatBRL(valor)}</div>
                    </div>
                  );
                })}
                <div className="card" style={{ padding: 16, borderTop: '3px solid #22c55e', background: 'rgba(34,197,94,.06)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL DO DIA</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#22c55e' }}>{formatBRL(caixaTotal)}</div>
                </div>
              </div>

              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Hora</th>
                        <th style={{ textAlign: 'left' }}>Descrição</th>
                        <th style={{ textAlign: 'left' }}>Categoria</th>
                        <th style={{ textAlign: 'center' }}>Forma</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caixaData.map((t: any) => {
                        const info = FORMA_LABELS[t.payment_method] || { label: t.payment_method || '--', icon: '' };
                        return (
                          <tr key={t.id}>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.paid_at ? new Date(t.paid_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--'}</td>
                            <td style={{ fontSize: 13 }}>{t.description}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.category || '--'}</td>
                            <td style={{ textAlign: 'center', fontSize: 12 }}>{info.icon} {info.label}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>{formatBRL(Number(t.amount || 0))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'pdv' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Dados Principais</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div><label className="form-label">Data da Venda</label><input className="form-input" type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} /></div>
                <div>
                  <label className="form-label">Funcionário / Vendedor</label>
                  <select className="form-input" value={funcionario} onChange={e => setFuncionario(e.target.value)} style={{ cursor: 'pointer' }}>
                    <option value="">— Selecione o vendedor —</option>
                    {profissionais.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div><label className="form-label">Filial / Unidade</label><input className="form-input" defaultValue="Matriz" /></div>
              </div>

              <div style={{ position: 'relative', marginBottom: 14 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={13} style={{ color: '#6366f1' }} /> Importar Ordem de Serviço * <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>— obrigatório</span>
                </label>
                <input className="form-input" placeholder="Nº da OS ou nome do cliente..." value={osSearch} onChange={e => { setOsSearch(e.target.value); setShowOsSug(true); }} onFocus={() => setShowOsSug(true)} style={{ background: 'rgba(99,102,241,.05)', borderColor: osVinculada ? 'rgba(34,197,94,.5)' : 'rgba(99,102,241,.3)' }} />
                {showOsSug && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 240, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.4)', marginTop: 2 }}>
                    {filteredOS.length === 0 ? <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma OS encontrada</div>
                    : filteredOS.map(os => (
                      <div key={os.id} onClick={() => importarOS(os)} style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,.08)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <div>
                          <span style={{ color: '#6366f1', fontWeight: 700, marginRight: 10 }}>OS #{String(os.os_number).padStart(4, '0')}</span>
                          <span style={{ fontWeight: 500 }}>{os.customer_name}</span>
                          {os.frame_brand && <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>{os.frame_brand}</span>}
                        </div>
                        <span style={{ color: '#22c55e', fontWeight: 700 }}>{formatBRL(os.total || 0)}</span>
                      </div>
                    ))}
                    <div onClick={() => setShowOsSug(false)} style={{ padding: '8px 16px', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border)' }}>Fechar</div>
                  </div>
                )}
                {osVinculada && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 8, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#22c55e' }}>✓ OS #{String(osVinculada.os_number).padStart(4, '0')} — {osVinculada.customer_name}</span>
                    <button onClick={() => { setOsVinculada(null); setCartItems([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 11 }}>Remover</button>
                  </div>
                )}
              </div>

              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Users size={13} style={{ color: '#06b6d4' }} /> Cliente *</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <select className="form-input" style={{ flex: 1 }} value={selectedCustomer} onChange={e => { const c = customers.find(c => c.id === e.target.value); setSelectedCustomer(e.target.value); setCustomerName(c?.name || ''); }}>
                    <option value="">Selecionar cliente cadastrado...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input className="form-input" style={{ flex: 1 }} placeholder="Ou digite o nome *" value={customerName} onChange={e => { setCustomerName(e.target.value); setSelectedCustomer(''); }} />
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Produtos e Serviços</div>
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="search-bar" style={{ flex: 1 }}>
                    <Search size={15} />
                    <input className="form-input" placeholder="Pesquise produto por nome, referência ou código de barras..." value={productSearch} onChange={e => { setProductSearch(e.target.value); setShowProductSug(true); }} onFocus={() => setShowProductSug(true)} />
                  </div>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '0 16px' }} onClick={() => { if (productSearch.trim()) { const found = products.find(p => p.name.toLowerCase().includes(productSearch.toLowerCase())); if (found) addToCart(found); } }}>+ Incluir Item</button>
                </div>
                {showProductSug && filteredProducts.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 80, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.4)', marginTop: 2 }}>
                    {filteredProducts.map(p => (
                      <div key={p.id} onClick={() => addToCart(p)} style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,.08)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <div><div style={{ fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.code ? 'Ref: ' + p.code + ' · ' : ''}{p.brand ? p.brand + ' · ' : ''}Estoque: {p.stock}</div></div>
                        <div style={{ fontWeight: 700, color: '#22c55e' }}>{formatBRL(p.sale_price)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th style={{ textAlign: 'left', fontSize: 11 }}>Referência</th><th style={{ textAlign: 'left', fontSize: 11 }}>Produto / Serviço</th><th style={{ fontSize: 11 }}>Qtde</th><th style={{ fontSize: 11 }}>Val. Unit.</th><th style={{ fontSize: 11 }}>Acrés./Desc.</th><th style={{ fontSize: 11 }}>Val. Total</th><th></th></tr></thead>
                  <tbody>
                    {cartItems.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum item adicionado</td></tr>
                    ) : cartItems.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{products.find(p => p.id === item.product_id)?.code || '—'}</td>
                        <td style={{ fontSize: 13, fontWeight: 500 }}>{item.description}</td>
                        <td><input type="number" min="1" value={item.quantity} onChange={e => updateQty(idx, parseInt(e.target.value) || 1)} style={{ width: 55, padding: '4px 6px', borderRadius: 6, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', textAlign: 'center', fontSize: 12 }} /></td>
                        <td><input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updatePrice(idx, parseFloat(e.target.value) || 0)} style={{ width: 85, padding: '4px 6px', borderRadius: 6, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }} /></td>
                        <td><input type="number" step="0.01" value={item.acrescimo} onChange={e => updateAcrescimo(idx, parseFloat(e.target.value) || 0)} style={{ width: 80, padding: '4px 6px', borderRadius: 6, background: 'var(--bg-input)', border: '1px solid var(--border)', color: item.acrescimo >= 0 ? '#22c55e' : '#f87171', fontSize: 12, textAlign: 'center' }} /></td>
                        <td style={{ fontWeight: 700, color: '#6366f1', fontSize: 13 }}>{formatBRL(item.total + item.acrescimo)}</td>
                        <td><button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4 }}><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <label className="form-label">Observação</label>
              <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações relevantes..." />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 20 }}>
            <div className="card" style={{ padding: 20, borderTop: '3px solid #6366f1' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL DA VENDA</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#6366f1', marginBottom: 16 }}>{formatBRL(total)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}><span style={{ color: 'var(--text-muted)' }}>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Desconto (R$)</span>
                <input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} style={{ width: 90, padding: '4px 8px', borderRadius: 6, textAlign: 'right', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#f87171', fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Entrada / Sinal (R$)</span>
                <input type="number" min="0" step="0.01" value={entrada} onChange={e => setEntrada(parseFloat(e.target.value) || 0)} style={{ width: 90, padding: '4px 8px', borderRadius: 6, textAlign: 'right', background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#22c55e', fontSize: 13 }} />
              </div>
              {entrada > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(248,113,113,.1)', borderRadius: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>Saldo a Pagar</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#f87171' }}>{formatBRL(saldo)}</span>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Dados de Pagamento</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {PAGAMENTOS.filter(p => p.value !== 'boleto' || boletoHabilitado).map(p => (
                  <button key={p.value} onClick={() => setPayment(p.value)} style={{ padding: '10px 8px', borderRadius: 8, border: '2px solid', borderColor: payment === p.value ? '#6366f1' : 'var(--border)', background: payment === p.value ? 'rgba(99,102,241,.12)' : 'var(--bg-card)', color: payment === p.value ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all .15s' }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
              {(payment === 'credito' || payment === 'crediario') && (
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">Parcelas</label>
                  <select className="form-input" value={installments} onChange={e => { const n=parseInt(e.target.value); setInstallments(n); if(payment==='crediario') setParcelasEdit(gerarParcelasEdit(n,saldo,dueDate)); }}>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}x {formatBRL(saldo/n)}</option>)}
                  </select>
                </div>
              )}
              {payment === 'crediario' && (
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">1º Vencimento</label>
                  <input className="form-input" type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); setParcelasEdit(gerarParcelasEdit(installments,saldo,e.target.value)); }} />
                </div>
              )}
              {payment === 'crediario' && parcelasEdit.length > 0 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', marginBottom:6 }}>EDITAR PARCELAS</div>
                  {parcelasEdit.map((p,i) => (
                    <div key={i} style={{ display:'flex', gap:6, alignItems:'center', marginBottom:6 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:'#6366f1', minWidth:22 }}>{i+1}x</span>
                      <input type="number" step="0.01" value={p.amount} onChange={e => { const novoVal=parseFloat(e.target.value)||0; setParcelasEdit(prev => { const totAntes=prev.slice(0,i).reduce((s,x)=>s+x.amount,0); const resto=saldo-totAntes-novoVal; const restoParcelas=prev.length-i-1; const novaParc=restoParcelas>0?Math.round((resto/restoParcelas)*100)/100:0; return prev.map((x,j)=>j===i?{...x,amount:novoVal}:j>i?{...x,amount:novaParc}:x); }); }} style={{ width:90, padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text)', fontSize:12 }}/>
                      <input type="date" value={p.due_date} onChange={e => { const novaData=e.target.value; setParcelasEdit(prev => prev.map((x,j) => { if(j===i) return {...x,due_date:novaData}; if(j>i && novaData){ const d=new Date(novaData+'T12:00:00'); d.setMonth(d.getMonth()+(j-i)); return {...x,due_date:d.toISOString().split('T')[0]}; } return x; })); }} style={{ flex:1, padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg-input)', color:'var(--text)', fontSize:12 }}/>
                    </div>
                  ))}
                </div>
              )}
              {payment === 'dinheiro' && (
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">Valor Recebido (R$)</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={received || ''} onChange={e => setReceived(parseFloat(e.target.value) || 0)} placeholder="0,00" />
                  {received >= saldo && saldo > 0 && <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,.12)', color: '#22c55e', fontSize: 14, fontWeight: 700 }}>Troco: {formatBRL(troco)}</div>}
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">Cód. Autorização</label>
                <input className="form-input" placeholder="0001" />
              </div>
            </div>

            {payment === 'boleto' ? (
              <button onClick={gerarBoleto} disabled={saving || cartItems.length === 0} style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: cartItems.length === 0 ? 'rgba(99,102,241,.3)' : '#f59e0b', color: 'white', fontSize: 15, fontWeight: 700, cursor: cartItems.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                📄 {saving ? 'Gerando boleto...' : 'Gerar Boleto — ' + formatBRL(saldo || total)}
              </button>
            ) : (
            <button onClick={finalizeSale} disabled={saving || cartItems.length === 0} style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: cartItems.length === 0 ? 'rgba(99,102,241,.3)' : '#6366f1', color: 'white', fontSize: 15, fontWeight: 700, cursor: cartItems.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Receipt size={18} /> {saving ? 'Finalizando...' : 'Receber Pagamento — ' + formatBRL(saldo || total)}
            </button>
            )}
            <button onClick={clearCart} style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>🗑️ Limpar carrinho</button>
            <button onClick={() => setTab('lista')} style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>← Voltar</button>
          </div>
        </div>
      )}

      {viewSale && (
        <div className="modal-overlay" onClick={() => setViewSale(null)}>
          <div className="modal" style={{ maxWidth: 520, width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Venda #{String(viewSale.sale_number).padStart(4, '0')}</h2>
              <button onClick={() => setViewSale(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Cliente', viewSale.customer_name], ['Vendedor', viewSale.vendedor || '—'],
                  ['Pagamento', PAGAMENTOS.find(p => p.value === viewSale.payment_method)?.label || viewSale.payment_method],
                  ['Parcelas', viewSale.installments + 'x'], ['Subtotal', formatBRL(viewSale.subtotal)],
                  ['Desconto', '-' + formatBRL(viewSale.discount)], ['Entrada', formatBRL(viewSale.entrada || 0)],
                  ['TOTAL', formatBRL(viewSale.total)], ['Status', viewSale.status], ['Data', formatDate(viewSale.created_at)],
                ].map(([label, val]) => (
                  <div key={label + val} style={{ padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: label === 'TOTAL' ? 700 : 500, color: label === 'TOTAL' ? '#6366f1' : 'inherit' }}>{val}</div>
                  </div>
                ))}
              </div>
              {viewSale.notes && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Observações</div>
                  <div style={{ fontSize: 13 }}>{viewSale.notes}</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => imprimirComprovante(viewSale)} style={{ fontSize: 12 }}><FileText size={13} /> Comprovante</button>
                <button className="btn btn-secondary" onClick={() => imprimirCarne(viewSale)} style={{ fontSize: 12 }}><Receipt size={13} /> Carnê</button>
                <button className="btn btn-secondary" onClick={() => imprimirInstrumentoDivida(viewSale)} style={{ fontSize: 12 }}><Save size={13} /> Instr. Dívida</button>
                <button className="btn btn-secondary" onClick={() => imprimirQuitacao(viewSale)} style={{ fontSize: 12 }}><Printer size={13} /> Quitação</button>
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

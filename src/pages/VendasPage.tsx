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

const PAGAMENTOS = [
  { value: 'dinheiro',      label: 'Dinheiro',      icon: '💵' },
  { value: 'pix',           label: 'PIX',            icon: '📱' },
  { value: 'credito',       label: 'Crédito',        icon: '💳' },
  { value: 'debito',        label: 'Débito',         icon: '🏧' },
  { value: 'crediario',     label: 'Crediário',      icon: '📋' },
  { value: 'transferencia', label: 'Transferência',  icon: '🏦' },
  { value: 'boleto', label: 'Boleto', icon: '📄' },
];

interface Product { id: string; name: string; sale_price: number; stock: number; category: string; brand?: string; code?: string; }
interface Customer { id: string; name: string; }
interface SaleItem { product_id: string; description: string; quantity: number; unit_price: number; total: number; acrescimo: number; }
interface Sale {
  id: string; sale_number: number; customer_name: string; payment_method: string;
  installments: number; subtotal: number; discount: number; total: number; entrada?: number;
  status: string; created_at: string; notes?: string; vendedor?: string; os_number?: number; os_id?: string; customer_id?: string;
}
interface OS {
  id: string; os_number: number; customer_name: string; customer_id?: string;
  frame_brand?: string; frame_model?: string; frame_color?: string; frame_price?: number;
  lens_type?: string; lens_brand?: string; lens_price?: number;
  total?: number; discount?: number; entrada?: number;
  od_esf?: number; od_cil?: number; od_eixo?: number;
  oe_esf?: number; oe_cil?: number; oe_eixo?: number;
  medico?: string; obs_cliente?: string; status?: string;
}
interface StoreSettings {
  name: string; cnpj: string; phone: string; email: string;
  address: string; city: string; state: string; logo_url?: string; pix_key?: string;
}

function formatDate(d: string) { return new Date(d).toLocaleDateString('pt-BR'); }
function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

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
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'lista' | 'pdv'>('lista');
  const [search, setSearch]       = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
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
  }, [tenantId]);

  const totalPeriodo = sales.reduce((s, v) => s + (v.status === 'concluida' ? v.total : 0), 0);
  const ticketMed    = sales.filter(v => v.status === 'concluida').length ? totalPeriodo / sales.filter(v => v.status === 'concluida').length : 0;
  const totalDesc    = sales.reduce((s, v) => s + (v.discount || 0), 0);
  const numVendas    = sales.filter(v => v.status === 'concluida').length;
  const vendedores   = useMemo(() => [...new Set(sales.map(v => v.vendedor).filter(Boolean))], [sales]);

  const filtered = useMemo(() => {
    let list = sales;
    if (search.trim()) {
      const s = norm(search);
      list = list.filter(v => norm(v.customer_name).includes(s) || String(v.sale_number).includes(s) || norm(v.vendedor).includes(s));
    }
    if (vendedorFilter) list = list.filter(v => v.vendedor === vendedorFilter);
    if (dateFrom) list = list.filter(v => v.created_at >= dateFrom);
    if (dateTo)   list = list.filter(v => v.created_at <= dateTo + 'T23:59:59');
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

  // ── Cabeçalho empresa para documentos ──
  const getCabecalho = (s: StoreSettings | null) => {
    if (!s) return '<h2 style="text-align:center">ÓPTICA</h2>';
    return `
      <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:16px">
        ${s.logo_url ? `<img src="${s.logo_url}" style="max-height:60px;margin-bottom:8px"><br>` : ''}
        <h2 style="margin:0;font-size:18px;text-transform:uppercase">${s.name}</h2>
        <div style="font-size:11px;color:#555;margin-top:4px">
          ${s.cnpj ? 'CNPJ: ' + s.cnpj : ''}${s.cnpj && s.phone ? ' | ' : ''}${s.phone ? 'Tel: ' + s.phone : ''}<br>
          ${s.address ? s.address + (s.city ? ' — ' + s.city + '/' + s.state : '') : ''}
          ${s.email ? '<br>' + s.email : ''}
        </div>
      </div>`;
  };

  const getPagLabel = (v: Sale) => {
    const pag = PAGAMENTOS.find(p => p.value === v.payment_method);
    return (pag?.label || v.payment_method) + (v.installments > 1 ? ' ' + v.installments + 'x' : '');
  };

  const baseStyle = `body{font-family:Arial,sans-serif;font-size:13px;padding:24px;max-width:620px;margin:0 auto;line-height:1.5}
    table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px}
    th{background:#f5f5f5;font-weight:bold}.assinatura{margin-top:40px;text-align:center}.linha{border-top:1px solid #333;margin:40px 0 6px}
    @media print{button{display:none}}`;

  const imprimirComprovante = (v: Sale) => {
    const win = window.open('', '_blank', 'width=500,height=700'); if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Comprovante</title><style>${baseStyle}
    .total{font-size:20px;font-weight:bold;text-align:center;padding:12px;border:2px solid #333;border-radius:8px;margin:16px 0}</style></head><body>
    ${getCabecalho(storeSettings)}
    <h3 style="text-align:center;text-transform:uppercase;margin:0 0 16px">Comprovante de Pagamento</h3>
    <table><tr><th>Venda</th><th>Data</th><th>Cliente</th><th>Vendedor</th></tr>
    <tr><td>#${String(v.sale_number).padStart(4,'0')}</td><td>${formatDateTime(v.created_at)}</td><td>${v.customer_name}</td><td>${v.vendedor||'—'}</td></tr></table>
    <table><tr><th>Forma de Pagamento</th><th>Parcelas</th><th>Subtotal</th><th>Desconto</th><th>Entrada</th><th>Total</th></tr>
    <tr><td>${getPagLabel(v)}</td><td>${v.installments}x</td><td>${formatBRL(v.subtotal)}</td><td>${formatBRL(v.discount)}</td><td>${formatBRL(v.entrada||0)}</td><td><b>${formatBRL(v.total)}</b></td></tr></table>
    <div class="total">TOTAL PAGO: ${formatBRL(v.total)}</div>
    ${v.notes ? `<p style="font-size:11px;color:#666">Obs: ${v.notes}</p>` : ''}
    <div class="linha"></div><p class="assinatura">Assinatura do Cliente — ${v.customer_name}</p>
    <p style="text-align:center;font-size:10px;color:#999">${storeSettings?.city||''}, ${formatDate(v.created_at)}</p>
    <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  const imprimirCarne = async (v: Sale) => {
    const { data: cred } = await supabase.from('crediario').select('id').eq('sale_id', v.id).single();
    const { data: parc } = cred ? await supabase.from('crediario_parcelas').select('*').eq('crediario_id', cred.id).order('installment_number', { ascending: true }) : { data: [] };
    const lista = (parc || []) as any[];
    const nP = lista.length || v.installments || 1;
    const w = window.open('', '_blank', 'width=800,height=960');
    if (!w) return;
    const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const fmtD = (d: string) => { if (!d) return '--'; const dt = d.includes('T') ? new Date(d) : new Date(d+'T12:00:00'); return isNaN(dt.getTime()) ? '--' : dt.toLocaleDateString('pt-BR'); };
    const sName = storeSettings?.name || 'Otica';
    const sPix = storeSettings?.pix_key || '';
    const sLogo = storeSettings?.logo_url || '';
    const sCnpj = storeSettings?.cnpj || '';
    const sAddr = storeSettings?.address || '';
    const sCity = storeSettings?.city || '';
    const sState = storeSettings?.state || '';
    const sPhone = storeSettings?.phone || '';
    const mkBC = (seed: number) => { const pat=[3,1,4,1,2,1,1,4,2,1,3,1,1,2,1,4,2,1,1,3,4,1,2,1,3,1,1,2,3,1,4,1,2,1,1,3,2,1,1,2,4,1,3,1]; return pat.map((b,i)=>'<span style="display:inline-block;height:42px;width:'+(b+(seed*3+i)%2)+'px;background:'+(i%2===0?'#000':'#fff')+'"></span>').join(''); };
    const pixEMV = (chave: string, valor: number, nome: string): string => { const f=(id:string,vv:string)=>id+String(vv.length).padStart(2,'0')+vv; const mai=f('00','BR.GOV.BCB.PIX')+f('01',chave); const amt=valor>0?valor.toFixed(2):''; let p=f('00','01')+f('26',mai)+f('52','0000')+f('53','986')+(amt?f('54',amt):'')+f('58','BR')+f('59',nome.substring(0,25).replace(/[^A-Za-z0-9 ]/g,''))+f('60','SAO PAULO')+f('62',f('05','***'))+'6304'; let crc=0xFFFF; for(let i=0;i<p.length;i++){crc^=p.charCodeAt(i)<<8;for(let j=0;j<8;j++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;} return p+(crc&0xFFFF).toString(16).toUpperCase().padStart(4,'0'); };
    const slip = (p: any, idx: number) => { const pN=p.installment_number||idx+1; const sd=String(v.sale_number||'').padStart(4,'0'); const ld=sd+String(pN).padStart(3,'0')+'0000000000000000000'; const vc=p.due_date?fmtD(p.due_date):'--'; const em=fmtD(v.created_at); const vs=fmtV(p.amount).replace('R$ ','').replace('R$','').trim(); const pp=sPix?pixEMV(sPix,p.amount,sName):''; const qi='qr_'+String(p.id||idx).replace(/-/g,''); return '<div class="sr"><div class="mn"><div class="sh"><span class="ss">'+sName+'</span><span class="sm"></span><span class="sp">'+pN+'/'+nP+'</span><span class="sd">'+sd+' / '+ld.slice(0,12)+'...</span></div><div class="fr"><div class="fb s"><span class="fl">Parcela</span><span class="fv">'+pN+'</span></div><div class="fb s"><span class="fl">Vencimento</span><span class="fv">'+vc+'</span></div><div class="fb xl"><span class="fl">Cliente</span><span class="fv">'+v.customer_name+'</span></div><div class="fb s"><span class="fl">Emissao</span><span class="fv">'+em+'</span></div></div><div class="in">O nao pagamento acarretara juros de R$ 0,07 ao dia. Pagavel somente na loja de origem.</div><div class="bc">'+mkBC(pN*11)+'</div><div class="fr" style="margin-top:4px"><div class="fb xs"><span class="fl">Nr.Doc</span><span class="fv">'+sd+'</span></div><div class="fb xxl"><span class="fl">&nbsp;</span><span class="fv fm">'+ld.slice(0,30)+'</span></div><div class="fb s"><span class="fl">Emissao</span><span class="fv">'+em+'</span></div><div class="fb sv"><span class="fl">Valor</span><span class="fv fb2">R$ '+vs+'</span></div></div></div><div class="ct">&#9986;</div><div class="st"><div class="s2"><span class="s2p">'+pN+'/'+nP+'</span><span class="s2d">'+sd+'</span></div><div class="sr2"><span class="sl">Vencimento</span><span class="sv">'+vc+'</span></div><div class="sr2 hi"><span class="sl">Valor Cobrado</span><span class="sv sb">R$ '+vs+'</span></div><div class="sr2" style="border:none;text-align:center;padding:4px 0"><span style="font-size:12px;font-weight:800;color:#000">'+v.customer_name+'</div>'+(pp?'<div id="'+qi+'" data-pix="'+pp+'" style="width:90px;height:90px;margin:2px auto"></div>':'')+'</div></div>'; };
    const capa = '<div class="cp"><div class="ch"><div class="lw">'+(sLogo?'<img src="'+sLogo+'" style="width:62px;height:62px;object-fit:cover;border-radius:4px"/>':'<div class="ls"><div class="lg"></div></div>')+'</div><div class="ct2"><div class="ctit">CARNE DE PAGAMENTO</div><div class="csn">'+sName+'</div>'+(sCnpj?'<div class="csi">CNPJ: '+sCnpj+'</div>':'')+((sAddr||sCity)?'<div class="csi">'+( sAddr||'')+( sCity?', '+sCity:'')+(sState?' - '+sState:'')+'</div>':'')+( sPhone?'<div class="csi">Tel: '+sPhone+'</div>':'')+'</div></div><div class="cb"><div class="cl">CLIENTE / DEVEDOR</div><div class="cn">'+v.customer_name+'</div></div><div class="cf"><div class="ci"><span class="ck">Total da Divida</span><span class="cv">'+fmtV(v.total||0)+'</span></div><div class="ci"><span class="ck">No Parcelas</span><span class="cv">'+nP+'</span></div><div class="ci"><span class="ck">Valor/Parcela</span><span class="cv">'+fmtV((v.total||0)/nP)+'</span></div><div class="ci"><span class="ck">Emissao</span><span class="cv">'+fmtD(v.created_at)+'</span></div></div></div>';
    const css = '@page{size:A4 portrait;margin:8mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000;background:#fff;display:flex;flex-direction:column}.cp{border:2px solid #1a3a8f;border-radius:4px;overflow:hidden;margin-bottom:0;flex-shrink:0}.ch{background:#1a3a8f;color:#fff;display:flex;align-items:center;gap:12px;padding:18px 14px}.lw{flex-shrink:0}.ls{width:62px;height:62px;border:2px solid rgba(255,255,255,.4);border-radius:4px;background:rgba(255,255,255,.1)}.lg{width:100%;height:100%;background:repeating-linear-gradient(90deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 1px,transparent 6px) top/6px 6px,repeating-linear-gradient(rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 1px,transparent 6px)}.ct2{flex:1;text-align:center}.ctit{font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.7);margin-bottom:3px}.csn{font-size:22px;font-weight:900}.csi{font-size:10px;color:rgba(255,255,255,.8);margin-top:2px}.cb{padding:20px 14px;border-bottom:1px solid #1a3a8f;flex:1}.cl{font-size:9px;font-weight:700;color:#1a3a8f;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}.cn{font-size:18px;font-weight:800}.cf{display:flex;background:#f0f4ff;border-top:1px solid #1a3a8f}.ci{flex:1;padding:14px 12px;border-right:1px solid #c7d2fe}.ci:last-child{border-right:none}.ck{display:block;font-size:9px;color:#1a3a8f;font-weight:700;text-transform:uppercase;margin-bottom:2px}.cv{font-size:13px;font-weight:800;color:#111}.sr{display:flex;align-items:stretch;border-top:2px dashed #aaa;padding:3px 0;break-inside:avoid;page-break-inside:avoid;width:100%;height:65mm}.mn{flex:6.5;border:1px solid #444;padding:6px 8px;display:flex;flex-direction:column;gap:3px}.ct{width:18px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#bbb;flex-shrink:0}.st{flex:3;border:1px solid #444;padding:6px 8px;background:#fafafa;display:flex;flex-direction:column;gap:3px}.sh{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1a3a8f;padding-bottom:4px;gap:4px}.ss{font-size:11px;font-weight:800;flex:1;color:#1a3a8f}.sm{flex:1}.sp{font-size:11px;font-weight:800;flex-shrink:0;color:#1a3a8f}.sd{font-size:8px;color:#666;flex-shrink:0}.fr{display:flex;gap:3px}.fb{border:1px solid #bbb;padding:3px 5px;min-height:30px}.fb.s{flex:1.2}.fb.xs{flex:0.7}.fb.xl{flex:3}.fb.xxl{flex:4}.fb.sv{flex:1.4}.fl{display:block;font-size:7.5px;color:#777;margin-bottom:2px;font-weight:600;text-transform:uppercase}.fv{font-size:10px;font-weight:700;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fb2{font-size:13px;font-weight:900;color:#1a3a8f}.fm{font-family:monospace;font-size:9px}.in{border:1px solid #e5c840;background:#fffbe6;padding:4px 7px;font-size:9px;color:#555;line-height:1.6}.bc{display:flex;align-items:center;height:46px;border:1px solid #bbb;padding:3px 8px;overflow:hidden}.s2{display:flex;justify-content:space-between;border-bottom:2px solid #1a3a8f;padding-bottom:4px;margin-bottom:3px}.s2p{font-size:12px;font-weight:900;color:#1a3a8f}.s2d{font-size:10px;color:#666}.sr2{border:1px solid #bbb;padding:4px 6px;min-height:32px}.sr2.hi{background:#f0f4ff;border-color:#1a3a8f}.sl{display:block;font-size:8px;color:#777;font-weight:700;text-transform:uppercase;margin-bottom:1px}.sv{font-size:10px;font-weight:700;display:block}.sb{font-size:14px;font-weight:900;color:#1a3a8f}.sbl{min-height:18px;border-bottom:1px solid #555;margin-top:6px}.sc{font-size:10px;font-weight:700;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sig{border-top:1px solid #555;margin-top:auto;padding-top:3px;font-size:11px;text-align:center;color:#000;font-weight:700}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sr{break-inside:avoid;page-break-inside:avoid}}';
    const listaFinal = lista.length > 0 ? lista : Array.from({length: nP}, (_, i) => {
      const due = new Date(); due.setMonth(due.getMonth() + i);
      return { installment_number: i+1, amount: v.total/nP, due_date: due.toISOString().split('T')[0], id: String(i) };
    });
    const pg1=listaFinal.slice(0,3);const rest=listaFinal.slice(3);
    let html='<div style="height:277mm;display:flex;flex-direction:column;page-break-after:always">'+capa+pg1.map((p: any,i: number)=>slip(p,i)).join('')+'</div>';
    for(let c=0;c<rest.length;c+=4){const grp=rest.slice(c,c+4);html+='<div style="height:277mm;display:flex;flex-direction:column;page-break-after:always">'+grp.map((p: any,i: number)=>slip(p,c+3+i)).join('')+'</div>';}
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Carne</title><style>'+css+'</style></head><body>'+html+'<scr'+'ipt src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></sc'+'ript><scr'+'ipt>window.addEventListener("load",function(){document.querySelectorAll("[data-pix]").forEach(function(el){var px=el.getAttribute("data-pix");if(px&&window.QRCode){new QRCode(el,{text:px,width:90,height:90,colorDark:"#000",colorLight:"#fff"})}})});</scr'+'ipt></body></html>');
    w.document.close();
    setTimeout(()=>w.print(),1500);
  };
  const imprimirInstrumentoDivida = async (v: Sale) => {
    const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', v.id);
    const { data: cred } = await supabase.from('crediario').select('id').eq('sale_id', v.id).single();
    const { data: parc } = cred ? await supabase.from('crediario_parcelas').select('*').eq('crediario_id', cred.id).order('installment_number', { ascending: true }) : { data: [] };
    const win = window.open('', '_blank', 'width=800,height=960'); if (!win) return;
    const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const fmtD2 = (d: string) => { if (!d) return '--'; const dt=d.includes('T')?new Date(d):new Date(d+'T12:00:00'); return isNaN(dt.getTime())?'--':dt.toLocaleDateString('pt-BR'); };
    const sName = storeSettings?.name || 'Otica';
    const sCnpj = storeSettings?.cnpj || '';
    const sAddr = storeSettings?.address || '';
    const sCity = storeSettings?.city || '';
    const sState = storeSettings?.state || '';
    const sPhone = storeSettings?.phone || '';
    const sLogo = storeSettings?.logo_url || '';
    const saldo = v.total - (v.entrada || 0);
    const nP = v.installments || 1;
    const lista = (parc || []) as any[];
    const itensList = (items || []) as any[];
    const itensHtml = itensList.map((item: any, i: number) =>
      '<tr><td style="text-align:center">'+(i+1)+'</td><td>'+item.description+'</td><td style="text-align:center">'+item.quantity+'</td><td style="text-align:right">'+fmtV(item.unit_price)+'</td><td style="text-align:right">'+fmtV(item.total)+'</td></tr>'
    ).join('');
    const parcelasDemo = lista.length > 0
      ? lista.map((p: any, i: number) => '<div class="pd"><div class="pl">Parcela '+(p.installment_number||i+1)+'</div><div class="pv">Venc: '+fmtD2(p.due_date)+'</div><div class="pa">'+fmtV(p.amount)+'</div></div>').join('')
      : Array.from({length: nP}, (_, i) => { const due = new Date(); due.setMonth(due.getMonth()+i+1); return '<div class="pd"><div class="pl">Parcela '+(i+1)+'</div><div class="pv">Venc: '+due.toLocaleDateString('pt-BR')+'</div><div class="pa">'+fmtV(saldo/nP)+'</div></div>'; }).join('');
    const dataLocal = sCity && sState ? sCity+' - '+sState+', '+new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'}) : new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
    const css = '@page{size:A4 portrait;margin:15mm 15mm 15mm 15mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000;background:#fff}.hdr{text-align:center;border-bottom:2px solid #1a3a8f;padding-bottom:12px;margin-bottom:16px}.hdr img{max-height:60px;margin-bottom:4px}.hn{font-size:20px;font-weight:900;color:#1a3a8f}.hs{font-size:11px;color:#444;margin-top:2px}h3{text-align:center;text-transform:uppercase;text-decoration:underline;margin:0 0 16px;font-size:14px}p{margin:6px 0;text-align:justify;font-size:12px;line-height:1.6}.info{background:#f5f8ff;border:1px solid #c7d2fe;border-radius:4px;padding:10px 14px;margin:10px 0}.info p{margin:3px 0}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px}th{background:#1a3a8f;color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #e2e8f0}.tot{background:#f0f4ff;font-weight:700}.totv{background:#1a3a8f;color:#fff;font-weight:900;font-size:13px}.demo{margin-top:16px}.demo-title{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;color:#1a3a8f;border-bottom:2px solid #1a3a8f;padding-bottom:4px}.demo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.pd{border:1px solid #c7d2fe;border-radius:4px;padding:8px;background:#f5f8ff}.pl{font-size:10px;font-weight:700;color:#1a3a8f;text-transform:uppercase}.pv{font-size:10px;color:#555;margin:2px 0}.pa{font-size:13px;font-weight:800;color:#111}.sigs{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:50px}.sig-line{border-top:1px solid #000;padding-top:6px;text-align:center;font-size:11px}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Instrumento</title><style>'+css+'</style></head><body>'
      +'<div class="hdr">'+(sLogo?'<img src="'+sLogo+'"/><br/>':'')+'<div class="hn">'+sName+'</div>'+(sCnpj?'<div class="hs">CNPJ: '+sCnpj+'</div>':'')+(sAddr?'<div class="hs">'+sAddr+(sCity?', '+sCity:'')+(sState?' - '+sState:'')+'</div>':'')+(sPhone?'<div class="hs">Tel: '+sPhone+'</div>':'')+'</div>'
      +'<h3>Instrumento de Confissao de Divida</h3>'
      +'<div class="info"><p><b>CONTRATANTE (DEVEDOR):</b> '+v.customer_name+'</p></div>'
      +'<p>Pelo presente instrumento de Confissao de Divida, o(a) Confitente Devedor(a) acima identificado(a), reconhece e confessa dever a esta empresa as parcelas declaradas abaixo, conformas demonstrativo (a) de debito (a) que integra (m) o presente instrumento.</p>'
      +'<p>De acordo com o art. 49 do Codigo de Defesa do Consumidor (Lei n. 8.078/1990), o consumidor pode desistir do contrato no prazo de 7 dias a contar de sua assinatura ou do ato de recebimento do produto, sempre que a contratacao ocorrer fora do estabelecimento comercial. Sendo exercido o direito, os valores pagos serao devolvidos monetariamente atualizados.</p>'
      +'<p>Venda: '+fmtD2(v.created_at)+(v.os_number?' | OS: #'+String(v.os_number).padStart(4,'0'):'')+(v.notes?' | '+v.notes:'')+'</p>'
      +'<table><thead><tr><th>#</th><th>Descricao dos Produtos/Servicos</th><th>Qtd</th><th>Val. Unit.</th><th>Total Item</th></tr></thead><tbody>'+itensHtml+'</tbody>'
      +'<tfoot><tr class="tot"><td colspan="4" style="text-align:right">Subtotal:</td><td style="text-align:right">'+fmtV(v.subtotal||v.total)+'</td></tr>'
      +((v.entrada||0)>0?'<tr class="tot"><td colspan="4" style="text-align:right">Entrada / Sinal:</td><td style="text-align:right">- '+fmtV(v.entrada||0)+'</td></tr>':'')
      +(v.discount>0?'<tr class="tot"><td colspan="4" style="text-align:right">Desconto:</td><td style="text-align:right">- '+fmtV(v.discount)+'</td></tr>':'')
      +'<tr class="totv"><td colspan="4" style="text-align:right">VALOR DA CONFISSAO:</td><td style="text-align:right">'+fmtV(saldo)+'</td></tr></tfoot></table>'
      +(nP>1?'<div class="demo"><div class="demo-title">Demonstrativo de Parcelamento (Carne)</div><div class="demo-grid">'+parcelasDemo+'</div></div>':'')
      +'<p style="margin-top:20px">'+dataLocal+'</p>'
      +'<div class="sigs"><div class="sig-line">'+v.customer_name+'<br/><span style="font-size:10px;color:#666">Assinatura do Devedor</span></div><div class="sig-line">'+sName+'<br/><span style="font-size:10px;color:#666">Assinatura da Empresa</span></div></div>'
      +'<script>window.onload=()=>window.print()<\/script></body></html>';
    win.document.write(html);
    win.document.close();
  };
  const imprimirQuitacao = async (v: Sale) => {
    const { data: custData } = await supabase.from('customers').select('cpf,rg,phone,address,city,state').eq('id', v.customer_id || '').single();
    const cust = custData as any || {};
    const win = window.open('', '_blank', 'width=800,height=960'); if (!win) return;
    const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const fmtD2 = (d: string) => { if (!d) return '--'; const dt=d.includes('T')?new Date(d):new Date(d+'T12:00:00'); return isNaN(dt.getTime())?'--':dt.toLocaleDateString('pt-BR'); };
    const sName = storeSettings?.name || 'Otica';
    const sCnpj = storeSettings?.cnpj || '';
    const sAddr = storeSettings?.address || '';
    const sCity = storeSettings?.city || '';
    const sState = storeSettings?.state || '';
    const sPhone = storeSettings?.phone || '';
    const sLogo = storeSettings?.logo_url || '';
    const custCpf = cust.cpf || '';
    const custRg = cust.rg || '';
    const dataExtenso = new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
    const dataVenda = fmtD2(v.created_at);
    const css = '@page{size:A4 portrait;margin:15mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000;background:#fff}.hdr{text-align:center;border-bottom:2px solid #1a3a8f;padding-bottom:12px;margin-bottom:24px}.hdr img{max-height:60px;margin-bottom:4px}.hn{font-size:20px;font-weight:900;color:#1a3a8f}.hs{font-size:11px;color:#444;margin-top:2px}.wrap{overflow:hidden;margin-bottom:16px}.selo{float:right;border:3px solid #e53e3e;color:#e53e3e;padding:6px 14px;border-radius:4px;font-weight:900;font-size:14px;transform:rotate(-12deg);margin-top:-8px;letter-spacing:1px}h3{text-align:center;text-decoration:underline;font-size:14px;margin:0 0 20px;text-transform:uppercase}p{margin:10px 0;text-align:justify;line-height:1.7}.sig{margin-top:50px;text-align:center}.sig-line{display:inline-block;min-width:260px;border-top:1px solid #000;padding-top:6px;font-size:11px}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
    const cnpjLine = sCnpj ? ', inscrita no CNPJ sob o n. '+sCnpj+',' : ',';
    const cpfLine = custCpf ? ', inscrito(a) no CPF sob o n. '+custCpf+(custRg?', RG n. '+custRg:'') : '';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quitacao</title><style>'+css+'</style></head><body>'
      +'<div class="hdr">'+(sLogo?'<img src="'+sLogo+'"/><br/>':'')+'<div class="hn">'+sName+'</div>'+(sCnpj?'<div class="hs">CNPJ: '+sCnpj+'</div>':'')+(sAddr?'<div class="hs">'+sAddr+(sCity?', '+sCity:'')+(sState?' - '+sState:'')+'</div>':'')+(sPhone?'<div class="hs">Tel: '+sPhone+'</div>':'')+'</div>'
      +'<div class="wrap"><div class="selo">DEBITO QUITADO</div><h3>Termo de Quitacao Total</h3></div>'
      +'<p>Pelo presente instrumento particular, a empresa <b>'+sName+'</b>'+cnpjLine+' declara para os devidos fins que o(a) Sr(a). <b>'+v.customer_name+'</b>'+cpfLine+', efetuou o pagamento integral de todos os debitos referentes a venda efetuada em <b>'+dataVenda+'</b>.</p>'
      +'<p>O valor total liquidado foi de <b>'+fmtV(v.total)+'</b>, correspondente a <b>'+v.installments+'</b> parcela(s) do crediario proprio, todas devidamente quitadas ate a presente data.</p>'
      +'<p>Desta forma, damos plena, geral e irrevogavel quitacao de todos os valores e obrigacoes decorrentes deste contrato, nada mais havendo o que reclamar ou exigir a qualquer titulo.</p>'
      +'<p>Por ser a expressao da verdade, firmamos o presente.</p>'
      +'<p style="margin-top:30px">, '+dataExtenso+'</p>'
      +'<div class="sig"><div class="sig-line">'+sName+'<br/><span style="font-size:10px;color:#666">Assinatura da Empresa</span></div></div>'
      +'<script>window.onload=()=>window.print()<\/script></body></html>';
    win.document.write(html);
    win.document.close();
  };
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
        {[{ k: 'lista', l: '📋 Lista de Vendas' }, { k: 'pdv', l: '🛒 PDV — Nova Venda' }].map(t => (
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
                {PAGAMENTOS.map(p => (
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

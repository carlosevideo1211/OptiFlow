import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import {
  Plus, Search, Edit2, Eye, ClipboardList,
  Clock, CheckCircle, Truck, Package, X, Save,
  Download, Trash2, Printer, Circle, User, ShoppingBag
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL, formatDate } from '../types/index';
import { norm } from '../utils/normalize';
import { abrirDocumentoImprimivel } from '../utils/printDoc';

const STATUS_LIST = [
  { value:'orcamento',  label:'Orçamento',        color:'#94a3b8', bg:'rgba(148,163,184,.15)' },
  { value:'confirmada', label:'Confirmada',        color:'#6366f1', bg:'rgba(99,102,241,.15)'  },
  { value:'lab',        label:'No Laboratório',    color:'#f59e0b', bg:'rgba(245,158,11,.15)'  },
  { value:'montagem',   label:'Em Montagem',       color:'#06b6d4', bg:'rgba(6,182,212,.15)'   },
  { value:'pronta',     label:'Pronta p/ Entrega', color:'#22c55e', bg:'rgba(34,197,94,.15)'   },
  { value:'entregue',   label:'Entregue',          color:'#a855f7', bg:'rgba(168,85,247,.15)'  },
  { value:'cancelada',  label:'Cancelada',         color:'#f87171', bg:'rgba(248,113,113,.15)' },
];
function getStatus(v: string) { return STATUS_LIST.find(s => s.value===v)||STATUS_LIST[0]; }

function emptyForm() {
  return {
    customer_id:'', customer_name:'',
    medico:'', data_receita:'',
    od_esf:'', od_cil:'', od_eixo:'', od_adicao:'', od_dnp:'',
    oe_esf:'', oe_cil:'', oe_eixo:'', oe_adicao:'', oe_dnp:'',
    dp_total:'',
    entrada:0, discount:0,
    delivery_date:'', obs_cliente:'', obs_lab:'',
    status:'orcamento', lab_name:'',
  };
}

interface OsItem {
  id?: string;
  product_id?: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface OS {
  id:string; os_number:number; tenant_id:string; customer_id?:string; customer_name:string;
  frame_price:number; lens_price:number; total:number; discount:number; status:string;
  lab_name?:string; delivery_date?:string; notes?:string; created_at:string;
  medico?:string; data_receita?:string; entrada?:number;
  od_esf?:number; od_cil?:number; od_eixo?:number; od_adicao?:number; od_dnp?:number;
  oe_esf?:number; oe_cil?:number; oe_eixo?:number; oe_adicao?:number; oe_dnp?:number;
  dp_total?:string; obs_lab?:string; obs_cliente?:string;
}

interface Product { id:string; name:string; category:string; brand?:string; sale_price:number; stock:number; }
interface Customer { id:string; name:string; phone?:string; }
interface Consultation {
  id:string; date:string; professional_name?:string;
  rx_re_esf?:number; rx_re_cil?:number; rx_re_eixo?:number; rx_re_dnp?:number;
  rx_le_esf?:number; rx_le_cil?:number; rx_le_eixo?:number; rx_le_dnp?:number;
  rx_adicao?:number; rx_tipo_lente?:string;
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, marginTop:4,
      paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
      <span style={{ color:'#6366f1' }}>{icon}</span>
      <span style={{ fontWeight:700, fontSize:13, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{title}</span>
    </div>
  );
}

export default function OrdemServicoPage() {
  const { tenantId } = useAuth();
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [orders, setOrders]       = useState<OS[]>([]);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 50;
  const [products, setProducts]   = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing]     = useState<OS|null>(null);
  const [editing, setEditing]     = useState<OS|null>(null);
  const [form, setForm]           = useState(emptyForm());
  const [saving, setSaving]       = useState(false);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [osItens, setOsItens]     = useState<OsItem[]>([]);
  const [prodSearch, setProdSearch] = useState('');
  const [showProdSug, setShowProdSug] = useState(false);
  const prodSearchRef = useRef<HTMLInputElement>(null);
  const avancandoRef = useRef(false);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [os, prods, cust] = await Promise.all([
      fetchAllRows<OS>((from, to) => supabase.from('service_orders').select('*').eq('tenant_id', tenantId).order('os_number', { ascending: false }).range(from, to)),
      fetchAllRows<Product>((from, to) => supabase.from('products').select('*').eq('tenant_id', tenantId).eq('active', true).order('name').range(from, to)),
      fetchAllRows<Customer>((from, to) => supabase.from('customers').select('id,name,phone').eq('tenant_id', tenantId).eq('active', true).order('name').range(from, to)),
    ]);
    setOrders(os || []);
    setProducts(prods || []);
    setCustomers(cust || []);
    setLoading(false);
  };

  useEffect(() => {
    if (tenantId) supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single().then(({data}) => { if (data) setStoreSettings(data); });
  }, [tenantId]);

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const loadConsultations = async (customerId: string) => {
    const { data } = await supabase.from('consultations')
      .select('id,date,professional_name,rx_re_esf,rx_re_cil,rx_re_eixo,rx_re_dnp,rx_le_esf,rx_le_cil,rx_le_eixo,rx_le_dnp,rx_adicao,rx_tipo_lente')
      .eq('tenant_id', tenantId).eq('customer_id', customerId)
      .order('created_at', { ascending: false }).limit(5);
    setConsultations((data as Consultation[]) || []);
  };

  const fmtRx = (v: number|null|undefined, tipo: string): string => {
    if (v == null) return '';
    if (tipo === 'eixo') return String(Math.round(v));
    if (tipo === 'adicao') return Math.abs(v).toFixed(2).replace('.', ',');
    const abs = Math.abs(v).toFixed(2).replace('.', ',');
    return (v >= 0 ? '+' : '-') + abs;
  };
  const preencherRX = (c: Consultation) => {
    set('od_esf', fmtRx(c.rx_re_esf, 'esf'));
    set('od_cil', fmtRx(c.rx_re_cil, 'cil'));
    set('od_eixo', fmtRx(c.rx_re_eixo, 'eixo'));
    set('od_adicao', fmtRx(c.rx_adicao, 'adicao'));
    set('od_dnp', c.rx_re_dnp != null ? String(c.rx_re_dnp) : '');
    set('oe_esf', fmtRx(c.rx_le_esf, 'esf'));
    set('oe_cil', fmtRx(c.rx_le_cil, 'cil'));
    set('oe_eixo', fmtRx(c.rx_le_eixo, 'eixo'));
    set('oe_adicao', fmtRx(c.rx_adicao, 'adicao'));
    set('oe_dnp', c.rx_le_dnp != null ? String(c.rx_le_dnp) : '');
    if (c.professional_name) set('medico', c.professional_name);
    toast.success('RX importado!');
  };

  const totalItens = osItens.reduce((s, i) => s + i.valor_total, 0);
  const total  = Math.max(0, totalItens - (form.discount || 0));
  const saldo  = Math.max(0, total - (form.entrada || 0));

  const openNew = () => {
    setEditing(null); setViewing(null);
    setForm(emptyForm());
    setOsItens([]);
    setProdSearch('');
    setConsultations([]);
    setShowModal(true);
  };

  const openEdit = (os: OS) => {
    setViewing(null); setEditing(os);
    setForm({
      customer_id: os.customer_id || '',
      customer_name: os.customer_name,
      medico: os.medico || '',
      data_receita: os.data_receita || '',
      od_esf: fmtRx(os.od_esf, 'esf'),
      od_cil: fmtRx(os.od_cil, 'cil'),
      od_eixo: fmtRx(os.od_eixo, 'eixo'),
      od_adicao: fmtRx(os.od_adicao, 'adicao'),
      od_dnp: os.od_dnp != null ? String(os.od_dnp) : '',
      oe_esf: fmtRx(os.oe_esf, 'esf'),
      oe_cil: fmtRx(os.oe_cil, 'cil'),
      oe_eixo: fmtRx(os.oe_eixo, 'eixo'),
      oe_adicao: fmtRx(os.oe_adicao, 'adicao'),
      oe_dnp: os.oe_dnp != null ? String(os.oe_dnp) : '',
      dp_total: os.dp_total || '',
      entrada: os.entrada || 0,
      discount: os.discount || 0,
      delivery_date: os.delivery_date || '',
      obs_cliente: os.obs_cliente || os.notes || '',
      obs_lab: os.obs_lab || '',
      status: os.status,
      lab_name: os.lab_name || '',
    });
    loadOsItens(os.id);
    if (os.customer_id) loadConsultations(os.customer_id);
    setShowModal(true);
  };

  const loadOsItens = async (osId: string) => {
    const { data } = await supabase.from('os_itens').select('*').eq('os_id', osId).order('created_at');
    setOsItens((data as OsItem[]) || []);
  };

  const addProduto = (p: Product) => {
    setOsItens(prev => {
      const existing = prev.find(i => i.product_id === p.id);
      if (existing) {
        return prev.map(i => i.product_id === p.id
          ? { ...i, quantidade: i.quantidade + 1, valor_total: (i.quantidade + 1) * i.valor_unitario }
          : i
        );
      }
      return [...prev, { product_id: p.id, descricao: p.name, quantidade: 1, valor_unitario: p.sale_price, valor_total: p.sale_price }];
    });
    setProdSearch('');
    setShowProdSug(false);
  };

  const updateItemQtd = (idx: number, qtd: number) => {
    if (qtd <= 0) { removeItem(idx); return; }
    setOsItens(prev => prev.map((i, k) => k === idx ? { ...i, quantidade: qtd, valor_total: qtd * i.valor_unitario } : i));
  };

  const updateItemPreco = (idx: number, preco: number) => {
    setOsItens(prev => prev.map((i, k) => k === idx ? { ...i, valor_unitario: preco, valor_total: i.quantidade * preco } : i));
  };

  const removeItem = (idx: number) => setOsItens(prev => prev.filter((_, k) => k !== idx));

  const prodSugestoes = useMemo(() => {
    if (!prodSearch.trim()) return products.slice(0, 8);
    return products.filter(p =>
      p.name.toLowerCase().includes(prodSearch.toLowerCase()) ||
      (p.brand || '').toLowerCase().includes(prodSearch.toLowerCase())
    ).slice(0, 10);
  }, [prodSearch, products]);

  const parseRxNum = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name.trim()) { toast.error('Informe o cliente'); return; }
    setSaving(true);
    try {
      const totalCalculado = Math.max(0, totalItens - (form.discount || 0) - (form.entrada || 0));
      const payload: any = {
        tenant_id: tenantId,
        customer_id: form.customer_id || null,
        customer_name: form.customer_name,
        medico: form.medico || null,
        data_receita: form.data_receita || null,
        od_esf: parseRxNum(form.od_esf),
        od_cil: parseRxNum(form.od_cil),
        od_eixo: parseRxNum(form.od_eixo),
        od_adicao: parseRxNum(form.od_adicao),
        od_dnp: parseRxNum(form.od_dnp),
        oe_esf: parseRxNum(form.oe_esf),
        oe_cil: parseRxNum(form.oe_cil),
        oe_eixo: parseRxNum(form.oe_eixo),
        oe_adicao: parseRxNum(form.oe_adicao),
        oe_dnp: parseRxNum(form.oe_dnp),
        dp_total: form.dp_total || null,
        frame_price: 0, lens_price: 0, servicos_price: 0,
        total: totalCalculado,
        discount: form.discount || 0,
        entrada: form.entrada || 0,
        status: form.status,
        lab_name: form.lab_name || null,
        delivery_date: form.delivery_date || null,
        notes: form.obs_cliente || null,
        obs_lab: form.obs_lab || null,
        obs_cliente: form.obs_cliente || null,
      };

      let osId: string;
      if (editing) {
        const { error } = await supabase.from('service_orders').update(payload).eq('id', editing.id);
        if (error) throw error;
        osId = editing.id;
        await supabase.from('os_itens').delete().eq('os_id', osId);
      } else {
        const { data, error } = await supabase.from('service_orders').insert([payload]).select().single();
        if (error) throw error;
        osId = (data as any).id;
      }

      if (osItens.length > 0) {
        const itensPayload = osItens.map(i => ({
          os_id: osId, tenant_id: tenantId,
          product_id: i.product_id || null,
          descricao: i.descricao, quantidade: i.quantidade,
          valor_unitario: i.valor_unitario, valor_total: i.valor_total,
        }));
        await supabase.from('os_itens').insert(itensPayload);
      }

      toast.success(editing ? 'OS atualizada!' : '✅ OS aberta com sucesso!');
      setShowModal(false);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar OS');
    } finally {
      setSaving(false);
    }
  };

  const excluirOS = async (o: OS) => {
    if (!confirm('Excluir OS #' + String(o.os_number).padStart(4,'0') + '?')) return;
    await supabase.from('os_itens').delete().eq('os_id', o.id);
    await supabase.from('service_orders').delete().eq('id', o.id);
    toast.success('OS excluída!');
    load();
  };

  const avancarStatus = async (o: OS) => {
    if (avancandoRef.current) return;
    avancandoRef.current = true;
    try {
      const idx = STATUS_LIST.findIndex(s => s.value === o.status);
      const next = STATUS_LIST[(idx + 1) % STATUS_LIST.length];
      await supabase.from('service_orders').update({ status: next.value }).eq('id', o.id);
      toast.success('Status: ' + next.label);
      load();
    } finally {
      avancandoRef.current = false;
    }
  };

  const exportCSV = () => {
    const header = 'OS,Cliente,Status,Total,Data';
    const rows = filtered.map(o => [o.os_number, o.customer_name, getStatus(o.status).label, o.total, formatDate(o.created_at)].map(x => '"'+(x??'')+'"').join(','));
    const blob = new Blob([header+'\n'+rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'os.csv'; a.click();
  };

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter) list = list.filter(o => o.status === statusFilter);
    if (search.trim()) {
      const s = norm(search);
      list = list.filter(o => norm(o.customer_name).includes(s) || String(o.os_number).includes(s));
    }
    return list;
  }, [orders, search, statusFilter]);

  const emAberto  = orders.filter(o => !['entregue','cancelada'].includes(o.status)).length;
  const prontas   = orders.filter(o => o.status === 'pronta').length;
  const entregues = orders.filter(o => o.status === 'entregue').length;

  const inp = (label: string, field: string, type = 'text', placeholder = '') => (
    <div>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} placeholder={placeholder}
        value={(form as any)[field]} onChange={e => set(field, type==='number' ? parseFloat(e.target.value)||0 : e.target.value)}/>
    </div>
  );

  const rxCell = (field: string) => (
    <input className="form-input" style={{ textAlign:'center', padding:'6px 4px', fontSize:12 }}
      placeholder={field.includes('eixo') ? '1-180' : '+0,00'}
      value={(form as any)[field]}
      onChange={e => set(field, e.target.value)}/>
  );

  const btnStyle = (color: string, bg: string) => ({
    background: bg, border: `1px solid ${color}40`,
    borderRadius:7, padding:'5px 8px', cursor:'pointer',
    color: color, display:'flex', alignItems:'center'
  });

  const printOS = async (os: OS) => {
    // Buscar itens da OS
    const { data: itens } = await supabase.from('os_itens').select('*').eq('os_id', os.id).order('created_at');
    const osItensData = itens || [];
    const s = storeSettings;
    const sName = (s?.name || 'OPTIFLOW').toUpperCase();
    const sCnpj = s?.cnpj || '';
    const sAddr = [s?.address, s?.city, s?.state].filter(Boolean).join(', ');
    const sTel = s?.phone || '';
    const sLogo = s?.logo_url || '';
    const fmtD = (d: string) => d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR') : '--';
    const fmtV = (n: number) => (n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const fmtRxVal = (v: any, tipo: string) => {
      if (v === null || v === undefined || v === '') return '--';
      const n = parseFloat(String(v));
      if (isNaN(n)) return String(v);
      if (tipo === 'eixo') return String(Math.round(n));
      if (tipo === 'adicao') return '+' + Math.abs(n).toFixed(2).replace('.',',');
      const abs = Math.abs(n).toFixed(2).replace('.',',');
      return (n >= 0 ? '+' : '-') + abs;
    };
    const STATUS_LABELS: Record<string,string> = {orcamento:'Orçamento',aprovado:'Aprovado',producao:'Em Produção',pronto:'Pronto',entregue:'Entregue',cancelado:'Cancelado',garantia:'Garantia'};
    const css = '@page{size:A4;margin:12mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;color:#222;font-size:13px}.header{text-align:center;padding-bottom:14px;border-bottom:2px solid #1e3a5f;margin-bottom:16px}.store-name{font-size:20px;font-weight:800;color:#1e3a5f}.store-info{font-size:11px;color:#555;margin-top:2px}.title{font-size:15px;font-weight:700;text-align:center;margin:14px 0;padding:8px;background:#1e3a5f;color:white;border-radius:4px}.section{margin-bottom:12px;padding:12px;border:1px solid #ddd;border-radius:6px}.section-title{font-size:11px;font-weight:700;color:#1e3a5f;text-transform:uppercase;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.field-label{color:#888;font-size:10px;text-transform:uppercase}.field-value{font-weight:600;font-size:12px;margin-top:1px}.rx-table{width:100%;border-collapse:collapse;font-size:11px}.rx-table th{background:#f0f4f8;padding:6px;text-align:center;font-weight:600;border:1px solid #ddd}.rx-table td{padding:6px;text-align:center;border:1px solid #ddd}.total-box{text-align:center;border:2px solid #1e3a5f;border-radius:8px;padding:12px;margin:14px 0}.total-value{font-size:26px;font-weight:800;color:#1e3a5f}.sig{display:flex;justify-content:space-around;margin-top:50px}.sig-line{text-align:center;width:200px}.sig-line hr{border:none;border-top:1px solid #333;margin-bottom:6px}';
    const html = `<div class="header">${sLogo?`<img src="${sLogo}" style="max-height:60px;margin-bottom:6px"><br>`:''}<div class="store-name">${sName}</div>${sCnpj?`<div class="store-info">CNPJ: ${sCnpj}</div>`:''} ${sAddr?`<div class="store-info">${sAddr}</div>`:''} ${sTel?`<div class="store-info">Tel: ${sTel}</div>`:''}</div><div class="title">ORDEM DE SERVIÇO #${os.os_number}</div><div class="section"><div class="section-title">Dados</div><div class="grid2"><div><div class="field-label">Cliente</div><div class="field-value">${os.customer_name}</div></div><div><div class="field-label">Status</div><div class="field-value">${STATUS_LABELS[os.status]||os.status}</div></div><div><div class="field-label">Entrada</div><div class="field-value">${fmtD(os.created_at?.split('T')[0]||'')}</div></div><div><div class="field-label">Entrega</div><div class="field-value">${fmtD(os.delivery_date||'')}</div></div></div></div>${(os.od_esf||os.oe_esf)?`<div class="section"><div class="section-title">Receitário</div><table class="rx-table"><tr><th>Olho</th><th>ESF</th><th>CIL</th><th>EIXO</th><th>Adição</th></tr><tr><td>OD</td><td>${fmtRxVal(os.od_esf,'esf')}</td><td>${fmtRxVal(os.od_cil,'cil')}</td><td>${fmtRxVal(os.od_eixo,'eixo')}</td><td>${fmtRxVal(os.od_adicao,'adicao')}</td></tr><tr><td>OE</td><td>${fmtRxVal(os.oe_esf,'esf')}</td><td>${fmtRxVal(os.oe_cil,'cil')}</td><td>${fmtRxVal(os.oe_eixo,'eixo')}</td><td>${fmtRxVal(os.oe_adicao,'adicao')}</td></tr></table>${os.medico?`<div style="margin-top:8px"><div class="field-label">Médico</div><div class="field-value">${os.medico}</div></div>`:''}</div>`:''}<div class="section"><div class="section-title">Observações</div><div style="font-size:12px;min-height:30px">${os.notes||'—'}</div></div>${osItensData.length>0?`<div class="section"><div class="section-title">Produtos e Servicos</div><table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="background:#f0f4f8"><th style="padding:5px 8px;text-align:left;border:1px solid #ddd">Item</th><th style="padding:5px 8px;text-align:center;border:1px solid #ddd">Qtd</th><th style="padding:5px 8px;text-align:right;border:1px solid #ddd">Unit.</th><th style="padding:5px 8px;text-align:right;border:1px solid #ddd">Total</th></tr>${osItensData.map(it=>`<tr><td style="padding:5px 8px;border:1px solid #eee">${it.descricao||''}</td><td style="padding:5px 8px;text-align:center;border:1px solid #eee">${it.quantidade||1}</td><td style="padding:5px 8px;text-align:right;border:1px solid #eee">${fmtV(it.valor_unitario||0)}</td><td style="padding:5px 8px;text-align:right;border:1px solid #eee">${fmtV(it.valor_total||0)}</td></tr>`).join('')}</table></div>`:''}<div class="total-box"><div class="field-label">VALOR TOTAL</div><div class="total-value">${fmtV(os.total||0)}</div>${os.entrada?`<div style="display:flex;justify-content:center;gap:32px;margin-top:8px"><div><div class="field-label">Entrada paga</div><div style="font-size:14px;font-weight:700;color:#22c55e">${fmtV(os.entrada)}</div></div><div><div class="field-label">Saldo restante</div><div style="font-size:14px;font-weight:700;color:#f59e0b">${fmtV((os.total||0)-(os.entrada||0))}</div></div></div>`:''}</div><div class="sig"><div class="sig-line"><hr><span style="font-size:12px">${os.customer_name}</span><br><span style="font-size:10px;color:#888">Assinatura do Cliente</span></div><div class="sig-line"><hr><span style="font-size:12px">${sName}</span><br><span style="font-size:10px;color:#888">Assinatura da Empresa</span></div></div>`;

    abrirDocumentoImprimivel({
      title: 'OS #' + os.os_number,
      filename: 'os-' + String(os.os_number).padStart(4,'0') + '.pdf',
      css,
      body: html,
      windowFeatures: 'width=800,height=900',
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <ClipboardList size={22}/> Ordens de Serviço
          </h1>
          <p className="page-sub">Acompanhamento de laboratório e montagem em tempo real</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Nova OS</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { icon:<Clock size={22}/>, val:emAberto, label:'Ordens em Aberto', color:'#f59e0b' },
          { icon:<CheckCircle size={22}/>, val:prontas, label:'Prontas p/ Entrega', color:'#22c55e' },
          { icon:<Truck size={22}/>, val:entregues, label:'Entregues (Total)', color:'#a855f7' },
          { icon:<Package size={22}/>, val:orders.length, label:'Total de OS', color:'#6366f1' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:28, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Buscar por cliente ou nº OS..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{ width:200 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value={''}>Todos os status</option>
          {STATUS_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><ClipboardList size={40}/></div>
          <h3>Nenhuma OS encontrada.</h3>
          <button className="btn btn-primary" onClick={openNew}><Plus size={15}/> Nova OS</button>
        </div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>OS</th><th>Cliente</th><th>Status</th>
                  <th>Total</th><th>Entrega</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA).map(o => {
                  const st = getStatus(o.status);
                  return (
                    <tr key={o.id}>
                      <td><span style={{ fontFamily:'monospace', fontWeight:700, color:'#6366f1' }}>#{String(o.os_number).padStart(4,'0')}</span></td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'white' }}>
                            {(o.customer_name||'?').slice(0,2).toUpperCase()}
                          </div>
                          <span style={{ fontWeight:500 }}>{o.customer_name}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600, padding:'4px 10px', borderRadius:20, background:st.bg, color:st.color }}>
                          <Circle size={6} fill={st.color}/> {st.label}
                        </span>
                      </td>
                      <td style={{ fontWeight:600 }}>{formatBRL(o.total)}</td>
                      <td style={{ fontSize:13, color:'var(--text-muted)' }}>{o.delivery_date ? formatDate(o.delivery_date) : '—'}</td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={() => { setViewing(o); setShowModal(true); }} title="Ver detalhes" style={btnStyle('#f59e0b','rgba(245,158,11,.1)')}>
                            <Eye size={14}/>
                          </button>
                          <button onClick={() => avancarStatus(o)} title="Avançar status" style={btnStyle('#22c55e','rgba(34,197,94,.1)')}>
                            <CheckCircle size={14}/>
                          </button>
                          <button onClick={() => printOS(o)} title="Imprimir OS" style={btnStyle('#f59e0b','rgba(245,158,11,0.15)')}><Printer size={14}/></button>
                          <button onClick={() => openEdit(o)} title="Editar" style={btnStyle('#6366f1','rgba(99,102,241,.1)')}>
                            <Edit2 size={14}/>
                          </button>
                          <button onClick={() => excluirOS(o)} title="Excluir" style={btnStyle('#f87171','rgba(248,113,113,.1)')}>
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
            {filtered.length} OS no total — Pag. {pagina}/{Math.ceil(filtered.length/POR_PAGINA)}
            <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
              <button onClick={() => setPagina(p => Math.max(1,p-1))} disabled={pagina===1} style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:pagina===1?'transparent':'var(--primary)', color:pagina===1?'var(--text-muted)':'#fff', cursor:pagina===1?'not-allowed':'pointer', fontSize:12 }}>← Ant</button>
              {Array.from({length:Math.ceil(filtered.length/POR_PAGINA)},(_,i)=>i+1).filter(n=>Math.abs(n-pagina)<=2).map(n=>(<button key={n} onClick={()=>setPagina(n)} style={{ padding:'3px 8px', borderRadius:6, border:'1px solid var(--border)', background:n===pagina?'var(--primary)':'transparent', color:n===pagina?'#fff':'var(--text-muted)', cursor:'pointer', fontWeight:n===pagina?700:400, fontSize:12 }}>{n}</button>))}
              <button onClick={() => setPagina(p => Math.min(Math.ceil(filtered.length/POR_PAGINA),p+1))} disabled={pagina===Math.ceil(filtered.length/POR_PAGINA)} style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:pagina===Math.ceil(filtered.length/POR_PAGINA)?'transparent':'var(--primary)', color:pagina===Math.ceil(filtered.length/POR_PAGINA)?'var(--text-muted)':'#fff', cursor:pagina===Math.ceil(filtered.length/POR_PAGINA)?'not-allowed':'pointer', fontSize:12 }}>Prox →</button>
            </div>
          </div>
        </div>
       )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth:780, width:'95%', maxHeight:'92vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {viewing ? 'OS #'+String(viewing.os_number).padStart(4,'0')+' — '+viewing.customer_name
                  : editing ? 'Editar OS #'+String(editing.os_number).padStart(4,'0')
                  : 'Nova Ordem de Serviço'}
              </h2>
              <button onClick={() => setShowModal(false)}><X size={18}/></button>
            </div>

            {viewing ? (
              <div className="modal-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[['Cliente',viewing.customer_name],['Status',getStatus(viewing.status).label],
                    ['Laboratório',viewing.lab_name||'—'],
                    ['Entrega',viewing.delivery_date?formatDate(viewing.delivery_date):'—'],
                    ['Desconto','-'+formatBRL(viewing.discount)],['TOTAL',formatBRL(viewing.total)],
                  ].map(([label,val]) => (
                    <div key={label+val} style={{ padding:'10px 14px', background:'var(--bg-card)', borderRadius:8 }}>
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>{label}</div>
                      <div style={{ fontSize:14, fontWeight:label==='TOTAL'?700:500, color:label==='TOTAL'?'#6366f1':'inherit' }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Fechar</button>
                  <button className="btn btn-primary" onClick={() => openEdit(viewing)}><Edit2 size={15}/> Editar</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave}>
                <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:20 }}>

                  {/* CLIENTE */}
                  <div>
                    <SectionTitle icon={<User size={15}/>} title="Cliente" />
                    <div style={{ position:'relative' }}>
                      <label className="form-label">Nome do Cliente *</label>
                      <input className="form-input" placeholder="Digite para buscar..." value={form.customer_name}
                        onChange={e => { set('customer_name', e.target.value); set('customer_id', ''); setConsultations([]); }}
                        autoComplete="off" />
                      {form.customer_name.length > 1 && !form.customer_id && (
                        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:50, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, maxHeight:200, overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,.4)' }}>
                          {customers.filter(c => norm(c.name).includes(norm(form.customer_name))).slice(0,8).map(c => (
                            <div key={c.id} onClick={() => { set('customer_id', c.id); set('customer_name', c.name); loadConsultations(c.id); }}
                              style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:13 }}
                              onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background='')}>
                              {c.name}
                            </div>
                          ))}
                          {customers.filter(c => norm(c.name).includes(norm(form.customer_name))).length === 0 && (
                            <div style={{ padding:'10px 14px', color:'var(--text-muted)', fontSize:13 }}>Nenhum cliente encontrado</div>
                          )}
                        </div>
                      )}
                    </div>
                    {consultations.length > 0 && (
                      <div style={{ background:'rgba(99,102,241,.08)', borderRadius:8, padding:'12px 14px', border:'1px solid rgba(99,102,241,.2)', marginTop:12 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'#a5b4fc', marginBottom:8 }}>📋 Consultas recentes — clique para importar o RX:</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {consultations.map(c => (
                            <button key={c.id} type="button" onClick={() => preencherRX(c)}
                              style={{ textAlign:'left', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:6, padding:'8px 12px', cursor:'pointer', color:'var(--text)', fontSize:12, display:'flex', gap:12, alignItems:'center' }}>
                              <span style={{ color:'#a5b4fc', fontWeight:600 }}>{c.date ? new Date(c.date+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span>
                              {c.professional_name && <span style={{ color:'var(--text-muted)' }}>Dr. {c.professional_name}</span>}
                              {c.rx_tipo_lente && <span style={{ color:'#06b6d4' }}>{c.rx_tipo_lente}</span>}
                              {c.rx_re_esf != null && <span>OD: {c.rx_re_esf}</span>}
                              {c.rx_le_esf != null && <span>OE: {c.rx_le_esf}</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RECEITA MÉDICA */}
                  <div>
                    <SectionTitle icon={<Eye size={15}/>} title="Receita Médica" />
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                      {inp('Médico / Optometrista','medico',undefined,'Dr. Nome')}
                      {inp('Data da Receita','data_receita','date')}
                    </div>
                    <div style={{ overflowX:'auto', marginBottom:8 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr>
                            <th style={{ width:40, padding:'6px 8px', color:'var(--text-muted)', textAlign:'left' }}></th>
                            {['Esférico','Cilíndrico','Eixo','Adição','DNP'].map(h => (
                              <th key={h} style={{ padding:'6px 8px', color:'var(--text-muted)', fontWeight:600, textAlign:'center' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding:'4px 8px', fontWeight:700, fontSize:12 }}>OD</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('od_esf')}</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('od_cil')}</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('od_eixo')}</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('od_adicao')}</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('od_dnp')}</td>
                          </tr>
                          <tr>
                            <td style={{ padding:'4px 8px', fontWeight:700, fontSize:12 }}>OE</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('oe_esf')}</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('oe_cil')}</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('oe_eixo')}</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('oe_adicao')}</td>
                            <td style={{ padding:'3px 4px' }}>{rxCell('oe_dnp')}</td>
                          </tr>
                        </tbody>
                      </table>
                      <div style={{ marginTop:8 }}>
                        <label className="form-label">DP Total</label>
                        <input className="form-input" value={form.dp_total} onChange={e => set('dp_total', e.target.value)} style={{ width:120 }} placeholder="DP"/>
                      </div>
                    </div>
                  </div>

                  {/* PRODUTOS E SERVIÇOS */}
                  <div>
                    <SectionTitle icon={<ShoppingBag size={15}/>} title="Produtos e Serviços" />
                    <div style={{ position:'relative', marginBottom:12 }}>
                      <div style={{ position:'relative' }}>
                        <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
                        <input
                          ref={prodSearchRef}
                          className="form-input"
                          style={{ paddingLeft:32 }}
                          placeholder="Pesquisa produtos por nome, referência ou código de barras..."
                          value={prodSearch}
                          onChange={e => { setProdSearch(e.target.value); setShowProdSug(true); }}
                          onFocus={() => setShowProdSug(true)}
                        />
                      </div>
                      {showProdSug && (
                        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:50, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, maxHeight:220, overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,.4)' }}>
                          {prodSugestoes.length > 0 ? prodSugestoes.map(p => (
                            <div key={p.id} onClick={() => addProduto(p)}
                              style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}
                              onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background='')}>
                              <div>
                                <span style={{ fontWeight:500 }}>{p.name}</span>
                                {p.brand && <span style={{ color:'var(--text-muted)', marginLeft:8 }}>{p.brand}</span>}
                                <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:8 }}>{p.category}</span>
                              </div>
                              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                                <span style={{ fontSize:11, color: p.stock > 0 ? '#22c55e' : '#f87171' }}>Estq: {p.stock}</span>
                                <span style={{ color:'#22c55e', fontWeight:700 }}>{formatBRL(p.sale_price)}</span>
                              </div>
                            </div>
                          )) : (
                            <div style={{ padding:'10px 14px', color:'var(--text-muted)', fontSize:13 }}>Nenhum produto encontrado</div>
                          )}
                        </div>
                      )}
                    </div>

                    {osItens.length > 0 ? (
                      <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                          <thead>
                            <tr style={{ background:'rgba(255,255,255,.04)' }}>
                              <th style={{ padding:'10px 12px', textAlign:'left', color:'var(--text-muted)', fontWeight:600, fontSize:11 }}>PRODUTO / SERVIÇO</th>
                              <th style={{ padding:'10px 8px', textAlign:'center', color:'var(--text-muted)', fontWeight:600, fontSize:11, width:80 }}>QTDE</th>
                              <th style={{ padding:'10px 8px', textAlign:'right', color:'var(--text-muted)', fontWeight:600, fontSize:11, width:110 }}>VAL. UNIT.</th>
                              <th style={{ padding:'10px 8px', textAlign:'right', color:'var(--text-muted)', fontWeight:600, fontSize:11, width:110 }}>VAL. TOTAL</th>
                              <th style={{ width:40 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {osItens.map((item, idx) => (
                              <tr key={idx} style={{ borderTop:'1px solid var(--border)' }}>
                                <td style={{ padding:'10px 12px', fontWeight:500 }}>{item.descricao}</td>
                                <td style={{ padding:'6px 8px', textAlign:'center' }}>
                                  <input type="number" min="1" step="1" value={item.quantidade}
                                    onChange={e => updateItemQtd(idx, parseInt(e.target.value)||1)}
                                    style={{ width:60, textAlign:'center', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 6px', color:'var(--text)', fontSize:13 }}/>
                                </td>
                                <td style={{ padding:'6px 8px', textAlign:'right' }}>
                                  <input type="number" min="0" step="0.01" value={item.valor_unitario}
                                    onChange={e => updateItemPreco(idx, parseFloat(e.target.value)||0)}
                                    style={{ width:90, textAlign:'right', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 6px', color:'var(--text)', fontSize:13 }}/>
                                </td>
                                <td style={{ padding:'10px 8px', textAlign:'right', fontWeight:600, color:'#22c55e' }}>{formatBRL(item.valor_total)}</td>
                                <td style={{ padding:'6px 8px', textAlign:'center' }}>
                                  <button type="button" onClick={() => removeItem(idx)}
                                    style={{ background:'none', border:'none', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}>
                                    <Trash2 size={14}/>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ padding:'12px 16px', background:'rgba(255,255,255,.03)', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                          <div style={{ fontSize:13, color:'var(--text-muted)' }}>Valor Total: <strong style={{ color:'var(--text)', marginLeft:8 }}>{formatBRL(totalItens)}</strong></div>
                          {(form.discount || 0) > 0 && <div style={{ fontSize:13, color:'#f87171' }}>Desconto: <strong style={{ marginLeft:8 }}>-{formatBRL(form.discount)}</strong></div>}
                          <div style={{ fontSize:15, fontWeight:700, color:'#6366f1' }}>Valor Líquido: {formatBRL(total)}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding:'24px', textAlign:'center', border:'2px dashed var(--border)', borderRadius:8, color:'var(--text-muted)', fontSize:13 }}>
                        <ShoppingBag size={28} style={{ marginBottom:8, opacity:0.4 }}/>
                        <div>Nenhum produto adicionado. Use a busca acima para incluir itens.</div>
                      </div>
                    )}
                  </div>

                  {/* FINANCEIRO */}
                  <div>
                    <SectionTitle icon={<CheckCircle size={15}/>} title="Financeiro" />
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
                      <div style={{ padding:'12px 14px', borderRadius:8, background:'rgba(99,102,241,.1)', textAlign:'center' }}>
                        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>TOTAL (R$)</div>
                        <div style={{ fontSize:18, fontWeight:700, color:'#6366f1' }}>{formatBRL(total)}</div>
                        <div style={{ fontSize:10, color:'var(--text-muted)' }}>calculado automaticamente</div>
                      </div>
                      <div>
                        <label className="form-label">Entrada / Sinal (R$)</label>
                        <input className="form-input" type="number" step="0.01" min="0" value={form.entrada} onChange={e => set('entrada', parseFloat(e.target.value)||0)}/>
                      </div>
                      <div style={{ padding:'12px 14px', borderRadius:8, background:'rgba(248,113,113,.1)', textAlign:'center' }}>
                        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>SALDO A PAGAR</div>
                        <div style={{ fontSize:18, fontWeight:700, color:'#f87171' }}>{formatBRL(saldo)}</div>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      {inp('Desconto (R$)','discount','number')}
                      <div>
                        <label className="form-label">Status</label>
                        <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                          {STATUS_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* PRAZO E OBSERVAÇÕES */}
                  <div>
                    <SectionTitle icon={<Clock size={15}/>} title="Prazo e Observações" />
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                      {inp('Previsão de Entrega','delivery_date','date')}
                      {inp('Laboratório','lab_name',undefined,'Nome do laboratório')}
                    </div>
                    <div style={{ marginBottom:12 }}>
                      <label className="form-label">Observações para o Cliente</label>
                      <textarea className="form-input" rows={2} style={{ resize:'vertical' }}
                        value={form.obs_cliente} onChange={e => set('obs_cliente', e.target.value)}
                        placeholder="Observações para o cliente"/>
                    </div>
                    <div>
                      <label className="form-label">Observações para o Laboratório</label>
                      <textarea className="form-input" rows={2} style={{ resize:'vertical' }}
                        value={form.obs_lab} onChange={e => set('obs_lab', e.target.value)}
                        placeholder="Instruções específicas para o laboratório"/>
                    </div>
                  </div>

                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    <Save size={15}/> {saving ? 'Salvando...' : editing ? 'Salvar' : 'Abrir OS'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

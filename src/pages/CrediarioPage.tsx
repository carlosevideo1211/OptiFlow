import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import {
  CreditCard, Search, CheckCircle, Trash2,
  AlertTriangle, Download, MessageCircle, Calendar, Printer, Lock, User, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL } from '../types/index';

async function hashPassword(password: string): Promise<string> {
  if (!password) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface Parcela {
  id: string; crediario_id: string; tenant_id: string;
  installment_number: number; due_date: string; amount: number;
  paid_at?: string; paid_amount?: number; status: string;
  customer_name?: string; customer_id?: string; whatsapp?: string;
  total_installments?: number; sale_id?: string;
}

const JUROS_DIA = 0.07;

function calcJuros(p: Parcela): number {
  if (p.status === 'pago' || !p.due_date) return 0;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(p.due_date + 'T00:00:00');
  if (venc >= hoje) return 0;
  const dias = Math.floor((hoje.getTime() - venc.getTime()) / (1000*60*60*24));
  return Math.round(dias * JUROS_DIA * 100) / 100;
}

export default function CrediarioPage() {
  const { tenantId } = useAuth();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [renegociando, setRenegociando] = useState<string|null>(null); // crediario_id
  const [renegoSummary, setRenegoSummary] = useState<any>(null);
  const [renegociados, setRenegociados] = useState<Set<string>>(new Set());
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 50;
  const [renego, setRenego] = useState({ novoValor:'', numParcelas:'1', dataInicio:'', destino:'cancelar' });
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  // Reset pagina ao mudar filtros
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedParcela, setSelectedParcela] = useState<Parcela | null>(null);
  const [editingDateParcela, setEditingDateParcela] = useState<string|null>(null);
  const [newDate, setNewDate] = useState('');
  const [payForm, setPayForm] = useState({ operator_name: '', operator_pass: '', is_partial: false, paid_amount: '', partial_due_date: '', desconto: '0' });
  const [payingSaving, setPayingSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const creds = await fetchAllRows<any>((from, to) => supabase
      .from('crediario')
      .select('id, customer_id, customer_name, total_amount, installments, sale_id, status, parcelas:crediario_parcelas(*)')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelado')
      .range(from, to));
    // Carregar carnês renegociados
  const renegoData = await supabase
    .from('crediario')
    .select('id, notes')
    .eq('tenant_id', tenantId)
    .like('notes', 'Renegociacao:%');
  const rs = new Set<string>();
  (renegoData.data||[]).forEach((r:any) => {
    const id = r.notes?.replace('Renegociacao:','');
    if (id) rs.add(id);
  });
  setRenegociados(rs);

  const custs = await fetchAllRows<any>((from, to) => supabase
      .from('customers')
      .select('id, whatsapp, phone')
      .eq('tenant_id', tenantId)
      .range(from, to));
    const custMap: Record<string, any> = {};
    (custs || []).forEach((c: any) => { custMap[c.id] = c; });
    const lista: Parcela[] = [];
    (creds || []).forEach((cr: any) => {
      const nP = cr.installments || 1;
      (cr.parcelas || []).forEach((p: any) => {
        lista.push({
          ...p,
          customer_name: cr.customer_name,
          customer_id: cr.customer_id,
          whatsapp: custMap[cr.customer_id]?.whatsapp || custMap[cr.customer_id]?.phone || '',
          total_installments: nP,
          sale_id: cr.sale_id,
        });
      });
    });
    lista.sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
    setParcelas(lista);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const hoje = new Date().toISOString().split('T')[0];

  const filtered = useMemo(() => {
    return parcelas.filter(p => {
      if (search.trim() && !p.customer_name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter === 'vencida' && (p.status === 'pago' || !p.due_date || p.due_date >= hoje)) return false;
      if (statusFilter === 'aberta' && p.status !== 'pendente') return false;
      if (statusFilter === 'pago' && p.status !== 'pago') return false;
      if (dateFrom && p.due_date < dateFrom) return false;
      if (dateTo && p.due_date > dateTo) return false;
      return true;
    });
  }, [parcelas, search, statusFilter, dateFrom, dateTo, hoje]);

  const totalAberto = parcelas.filter(p => p.status !== 'pago').reduce((s, p) => s + p.amount, 0);
  const totalVencido = parcelas.filter(p => p.status !== 'pago' && p.due_date && p.due_date < hoje).reduce((s, p) => s + p.amount, 0);
  const totalRecebidoMes = parcelas.filter(p => p.status === 'pago' && p.paid_at && p.paid_at.startsWith(new Date().toISOString().slice(0,7))).reduce((s, p) => s + (p.paid_amount || p.amount), 0);

  const imprimirReciboParcial = (p: Parcela, pago: number, operador: string) => {
    const saldo = Math.round((p.amount + calcJuros(p) - pago) * 100) / 100;
    const dt = new Date().toLocaleDateString('pt-BR');
    const hr = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const w = window.open('','_blank','width=400,height=600');
    if (!w) return;
    const html = '<html><head><meta charSet="UTF-8"><title>Recibo</title>'
      + '<style>body{font-family:Arial;padding:24px;max-width:380px;margin:0 auto}'
      + 'h2{text-align:center;font-size:16px}'
      + '.val{text-align:center;font-size:32px;font-weight:bold;margin:16px 0}'
      + '.box{border:1px solid #e5a500;background:#fffbea;border-radius:8px;padding:12px;margin:16px 0;font-size:13px}'
      + '.row{display:flex;justify-content:space-between;padding:4px 0}'
      + '.sd{color:#e5a500;font-weight:bold}'
      + '@media print{button{display:none}}</style></head><body>'
      + '<p style="text-align:right;font-size:11px;color:#777">Recebido em: ' + dt + ' as ' + hr + '</p>'
      + '<h2>RECIBO DE PAGAMENTO</h2>'
      + '<p style="text-align:center;font-size:13px">Recebemos de <strong>' + (p.customer_name||'') + '</strong>, a importancia de:</p>'
      + '<div class="val">R$ ' + pago.toFixed(2).replace('.',',') + '</div>'
      + '<div class="box">'
      + '<div class="row"><span>Valor total da parcela</span><span>R$ ' + (p.amount+calcJuros(p)).toFixed(2).replace('.',',') + '</span></div>'
      + '<div class="row"><span>Valor recebido</span><span>R$ ' + pago.toFixed(2).replace('.',',') + '</span></div>'
      + '<div class="row"><span class="sd">Saldo restante</span><span class="sd">R$ ' + saldo.toFixed(2).replace('.',',') + '</span></div>'
      + '</div>'
      + '<p style="font-size:12px;color:#555">Referente a parcela n. ' + p.installment_number + ' de ' + (p.total_installments||'?') + '. Operador: ' + operador + '</p>'
      + '<p style="font-size:12px;color:#555">Damos por paga a referida parcela (parcialmente).</p>'
      + '<script>window.onload=function(){window.print();}<\/script></body></html>';
    w.document.write(html);
    w.document.close();
  };

  const pagarParcela = (p: Parcela) => {
    setSelectedParcela(p);
    setPayForm({ operator_name: '', operator_pass: '', is_partial: false, paid_amount: '', partial_due_date: '', desconto: '0' });
    setShowPayModal(true);
  };

  const fmtM = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  const handleConfirmPay = async () => {
    if (!selectedParcela) return;
    const p = selectedParcela;
    if (!payForm.operator_name.trim()) { toast.error('Informe o nome do operador'); return; }
    if (!payForm.operator_pass.trim()) { toast.error('Informe a senha do operador'); return; }
    const { data: funcs } = await supabase.from('funcionarios').select('id,name,access_password').eq('tenant_id', tenantId).ilike('name', payForm.operator_name.trim());
    if (!funcs || funcs.length === 0) { toast.error('Funcionario nao encontrado'); return; }
    const hashedOp = await hashPassword(payForm.operator_pass.trim());
    const storedOp = String(funcs[0].access_password).trim();
    const opMatch = storedOp === hashedOp || storedOp === payForm.operator_pass.trim();
    if (!opMatch) { toast.error('Senha incorreta'); return; }
    const juros = calcJuros(p);
    const desconto = Math.max(0, parseFloat((payForm.desconto||'0').replace(',','.')) || 0);
    const total = Math.max(0, p.amount + juros - desconto);
    const pago = payForm.is_partial ? parseFloat(payForm.paid_amount.replace(',','.')) : total;
    if (payForm.is_partial && (!pago || pago <= 0 || pago >= total)) { toast.error('Valor parcial invalido'); return; }
    if (payForm.is_partial && !payForm.partial_due_date) { toast.error('Informe o vencimento do saldo'); return; }
    setPayingSaving(true);
    try {
      const saldo = payForm.is_partial ? Math.round((total - pago) * 100) / 100 : 0;
      await supabase.from('crediario_parcelas').update({ status: 'pago', paid_at: new Date().toISOString(), paid_amount: pago }).eq('id', p.id);
      if (payForm.is_partial && saldo > 0) {
        await supabase.from('crediario_parcelas').insert([{ crediario_id: p.crediario_id, tenant_id: tenantId, installment_number: p.installment_number, due_date: payForm.partial_due_date, amount: saldo, status: 'aberta' }]);
      }
      await supabase.from('financial_transactions').insert([{ tenant_id: tenantId, type: 'receita', description: 'Parcela ' + p.installment_number + ' - ' + p.customer_name, category: 'Crediario', amount: pago, due_date: hoje, paid_at: new Date().toISOString(), status: 'pago', payment_method: 'crediario' }]);
      await supabase.from('baixas_log').insert([{ tenant_id: tenantId, parcela_id: p.id, customer_name: p.customer_name, installment_number: p.installment_number, amount: p.amount+calcJuros(p), paid_amount: pago, is_partial: payForm.is_partial, balance: payForm.is_partial?Math.round((p.amount+calcJuros(p)-pago)*100)/100:0, operator_name: funcs[0].name, paid_date: new Date().toISOString().split('T')[0] }]);
      await supabase.from('baixas_log').insert([{ tenant_id: tenantId, parcela_id: p.id, customer_name: p.customer_name, installment_number: p.installment_number, amount: p.amount + calcJuros(p), paid_amount: pago, is_partial: payForm.is_partial, balance: payForm.is_partial ? Math.round((p.amount+calcJuros(p)-pago)*100)/100 : 0, operator_name: funcs[0].name, paid_date: new Date().toISOString().split('T')[0] }]);
      // Verificar se todas as parcelas do crediario estao pagas -> quitar
      if (!payForm.is_partial) {
        const { data: todasParcelas } = await supabase
          .from('crediario_parcelas')
          .select('id, status')
          .eq('crediario_id', p.crediario_id);
        const todasPagas = todasParcelas && todasParcelas.every(pp => pp.id === p.id || pp.status === 'pago');
        if (todasPagas) {
          await supabase.from('crediario').update({ status: 'quitado' }).eq('id', p.crediario_id);
          toast.success('Crediario quitado! Todas as parcelas foram pagas.');
        } else {
          toast.success('Parcela recebida!');
        }
      } else {
        toast.success('Pagamento parcial registrado!');
        imprimirReciboParcial(p, pago, funcs[0].name);
      }
      setShowPayModal(false);
      load();
      load();
    } catch(e: any) { toast.error(e.message || 'Erro'); }
    finally { setPayingSaving(false); }
  };

;

  const abrirWhatsApp = (p: Parcela) => {
    const num = (p.whatsapp || '').replace(/\D/g, '');
    if (!num) { toast.error('Cliente sem WhatsApp cadastrado'); return; }
    const juros = calcJuros(p);
    const total = p.amount + juros;
    const venc = p.due_date ? new Date(p.due_date+'T00:00:00').toLocaleDateString('pt-BR') : '--';
    const msg = encodeURIComponent(
      'Ola ' + p.customer_name + '! Passando para lembar sobre sua parcela ' +
      p.installment_number + '/' + p.total_installments +
      ' no valor de R$ ' + total.toFixed(2).replace('.',',') +
      (juros > 0 ? ' (incluindo R$ ' + juros.toFixed(2).replace('.',',') + ' de juros)' : '') +
      ' com vencimento em ' + venc + '. Qualquer duvida estamos a disposicao!'
    );
    window.open('https://wa.me/55' + num + '?text=' + msg, '_blank');
  };

  const exportCSV = () => {
    const rows = [['Cliente','Parcela','Valor','Juros','Total','Vencimento','Status']];
    filtered.forEach(p => {
      const j = calcJuros(p);
      rows.push([p.customer_name||'',p.installment_number+'/'+p.total_installments,p.amount.toFixed(2),j.toFixed(2),(p.amount+j).toFixed(2),p.due_date||'',p.status]);
    });
    const csv = rows.map(r => r.join(';')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
    a.download = 'crediario.csv'; a.click();
  };

  const imprimirCarneIndividual = async (p: Parcela) => {
    const { data: creds } = await supabase.from('crediario').select('*').eq('id', p.crediario_id).single();
    const cr = creds as any || {};
    const { data: todasParcelas } = await supabase.from('crediario_parcelas').select('*').eq('crediario_id', p.crediario_id).order('installment_number', { ascending: true });
    const lista = (todasParcelas || []) as any[];
    const nP = lista.length || cr.installments || 1;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const fmtD2 = (d: string) => { if (!d) return '--'; const dt=d.includes('T')?new Date(d):new Date(d+'T12:00:00'); return dt.toLocaleDateString('pt-BR'); };
    const pNum = p.installment_number;
    const nP2 = p.total_installments || '?';
    const venc = p.due_date ? fmtD2(p.due_date) : '--';
    const hoje = new Date().toLocaleDateString('pt-BR');
    // Buscar dados da loja do Supabase
    let storeName = 'OPTIFLOW';
    let storeCnpj = '';
    let storeAddr = '';
    let storeTel = '';
    let storeLogo = '';
    try {
      const { data: ss } = await supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single();
      if (ss) {
        storeName = (ss.name || ss.company_name || 'OPTIFLOW').toUpperCase();
        storeCnpj = ss.cnpj || '';
        storeAddr = [ss.address, ss.city, ss.state].filter(Boolean).join(', ');
        storeTel = ss.phone || '';
        storeLogo = ss.logo_url || '';
      }
    } catch(e) {}
    const logoHtml = storeLogo
      ? '<img src="'+storeLogo+'" style="width:60px;height:60px;object-fit:contain;border-radius:8px;" />'
      : '<div style="width:60px;height:60px;background:linear-gradient(135deg,#6366f1,#06b6d4);border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:18px;">O</div>';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprovante</title>'
      +'<style>@page{size:A4 portrait;margin:12mm}*{margin:0;padding:0;box-sizing:border-box}'
      +'body{font-family:Arial,sans-serif;color:#222;background:#fff}'
      +'.header{text-align:center;padding-bottom:16px;border-bottom:2px solid #1e3a5f;margin-bottom:20px}'
      +'.logo-row{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:8px}'
      +'.store-name{font-size:22px;font-weight:800;color:#1e3a5f;letter-spacing:1px}'
      +'.store-info{font-size:11px;color:#555;margin-top:2px}'
      +'.title{font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:14px 0 18px;text-align:center;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:8px 0}'
      +'.table{width:100%;border-collapse:collapse;margin-bottom:16px}'
      +'.table th{background:#1e3a5f;color:#fff;padding:8px 12px;font-size:12px;text-align:left}'
      +'.table td{padding:8px 12px;font-size:12px;border-bottom:1px solid #eee}'
      +'.value-box{text-align:center;border:2px solid #1e3a5f;border-radius:8px;padding:16px;margin:20px 0}'
      +'.value-label{font-size:12px;color:#666;margin-bottom:4px}'
      +'.value-amount{font-size:32px;font-weight:800;color:#1e3a5f}'
      +'.footer{margin-top:40px;text-align:center;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:14px}'
      +'.sig{display:flex;justify-content:space-around;margin-top:50px}'
      +'.sig-line{text-align:center;width:200px}'
      +'.sig-line hr{border:none;border-top:1px solid #333;margin-bottom:6px}'
      +'</style></head><body>'
      +'<div class="header">'
      +'<div class="logo-row">'+logoHtml+'<span class="store-name">'+storeName+'</span></div>'
      +(storeCnpj?'<div class="store-info">CNPJ: '+storeCnpj+'</div>':'')
      +(storeAddr?'<div class="store-info">'+storeAddr+'</div>':'')
      +(storeTel?'<div class="store-info">Tel: '+storeTel+'</div>':'')
      +'</div>'
      +'<div class="title">Recibo de Pagamento de Parcela</div>'
      +'<table class="table"><thead><tr><th>Parcela</th><th>Cliente</th><th>Vencimento</th><th>Emissão</th></tr></thead>'
      +'<tbody><tr><td>'+pNum+'/'+nP2+'</td><td>'+p.customer_name+'</td><td>'+venc+'</td><td>'+hoje+'</td></tr></tbody></table>'
      +'<div class="value-box">'
      +'<div class="value-label">VALOR DA PARCELA</div>'
      +'<div class="value-amount">'+fmtV(p.amount)+'</div>'
      +'</div>'
      +'<p style="font-size:11px;color:#888;text-align:center;">O não pagamento acarretará juros de R$ 0,07 ao dia. Pagável somente na loja de origem.</p>'
      +'<div class="sig">'
      +'<div class="sig-line"><hr><span>'+p.customer_name+'</span><br><span style="font-size:10px;color:#888">Assinatura do Cliente</span></div>'
      +'<div class="sig-line"><hr><span>'+storeName+'</span><br><span style="font-size:10px;color:#888">Assinatura da Empresa</span></div>'
      +'</div>'
      +'<div class="footer">'+storeName+' &mdash; '+hoje+'</div>'
      +'<script>window.onload=()=>window.print()<\/script></body></html>';
    w.document.write(html);
    w.document.close();
  };

  const imprimirCarneCompleto = async (p: Parcela) => {
    const { data: cred } = await supabase.from('crediario').select('*').eq('id', p.crediario_id).single();
    const cr = cred as any || {};
    const { data: parc } = await supabase.from('crediario_parcelas').select('*').eq('crediario_id', p.crediario_id).order('installment_number', { ascending: true });
    const lista = (parc || []) as any[];
    const nP = lista.length || p.total_installments || 1;
    const w = window.open('', '_blank', 'width=800,height=960');
    if (!w) return;
    const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const fmtD = (d: string) => { if (!d) return '--'; const dt = d.includes('T') ? new Date(d) : new Date(d+'T12:00:00'); return isNaN(dt.getTime()) ? '--' : dt.toLocaleDateString('pt-BR'); };
    let sName = 'Otica'; let sPix = ''; let sLogo = ''; let sCnpj = ''; let sAddr = ''; let sCity = ''; let sState = ''; let sPhone = '';
    try { const { data: ss } = await supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single(); if (ss) { sName = ss.name || ss.company_name || 'Otica'; sPix = ss.pix_key || ''; sLogo = ss.logo_url || ''; sCnpj = ss.cnpj || ''; sAddr = ss.address || ''; sCity = ss.city || ''; sState = ss.state || ''; sPhone = ss.phone || ''; } } catch(e2) {}
    const mkBC = (seed: number) => { const pat=[3,1,4,1,2,1,1,4,2,1,3,1,1,2,1,4,2,1,1,3,4,1,2,1,3,1,1,2,3,1,4,1,2,1,1,3,2,1,1,2,4,1,3,1]; return pat.map((b,i)=>'<span style="display:inline-block;height:42px;width:'+(b+(seed*3+i)%2)+'px;background:'+(i%2===0?'#000':'#fff')+'"></span>').join(''); };
    const pixEMV = (chave: string, valor: number, nome: string): string => { const f=(id:string,vv:string)=>id+String(vv.length).padStart(2,'0')+vv; const mai=f('00','BR.GOV.BCB.PIX')+f('01',chave); const amt=valor>0?valor.toFixed(2):''; let p=f('00','01')+f('26',mai)+f('52','0000')+f('53','986')+(amt?f('54',amt):'')+f('58','BR')+f('59',nome.substring(0,25).replace(/[^A-Za-z0-9 ]/g,''))+f('60','SAO PAULO')+f('62',f('05','***'))+'6304'; let crc=0xFFFF; for(let i=0;i<p.length;i++){crc^=p.charCodeAt(i)<<8;for(let j=0;j<8;j++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;} return p+(crc&0xFFFF).toString(16).toUpperCase().padStart(4,'0'); };
    const custName = p.customer_name;
    const slip = (p: any, idx: number) => { const pN=p.installment_number||idx+1; const sd=String(p.crediario_id||'').slice(-4).padStart(4,'0'); const ld=sd+String(pN).padStart(3,'0')+'0000000000000000000'; const vc=p.due_date?fmtD(p.due_date):'--'; const em=fmtD(cr.created_at || new Date().toISOString()); const vs=fmtV(p.amount).replace('R$ ','').replace('R$','').trim(); const pp=sPix?pixEMV(sPix,p.amount,sName):''; const qi='qr_'+String(p.id||idx).replace(/-/g,''); return '<div class="sr"><div class="mn"><div class="sh"><span class="ss">'+sName+'</span><span class="sm"></span><span class="sp">'+pN+'/'+nP+'</span><span class="sd">'+sd+' / '+ld.slice(0,12)+'...</span></div><div class="fr"><div class="fb s"><span class="fl">Parcela</span><span class="fv">'+pN+'</span></div><div class="fb s"><span class="fl">Vencimento</span><span class="fv">'+vc+'</span></div><div class="fb xl"><span class="fl">Cliente</span><span class="fv">'+custName+'</span></div><div class="fb s"><span class="fl">Emissao</span><span class="fv">'+em+'</span></div></div><div class="in">O nao pagamento acarretara juros de R$ 0,07 ao dia. Pagavel somente na loja de origem.</div><div class="bc">'+mkBC(pN*11)+'</div><div class="fr" style="margin-top:4px"><div class="fb xs"><span class="fl">Nr.Doc</span><span class="fv">'+sd+'</span></div><div class="fb xxl"><span class="fl">&nbsp;</span><span class="fv fm">'+ld.slice(0,30)+'</span></div><div class="fb s"><span class="fl">Emissao</span><span class="fv">'+em+'</span></div><div class="fb sv"><span class="fl">Valor</span><span class="fv fb2">R$ '+vs+'</span></div></div></div><div class="ct">&#9986;</div><div class="st"><div class="s2"><span class="s2p">'+pN+'/'+nP+'</span><span class="s2d">'+sd+'</span></div><div class="sr2"><span class="sl">Vencimento</span><span class="sv">'+vc+'</span></div><div class="sr2 hi"><span class="sl">Valor Cobrado</span><span class="sv sb">R$ '+vs+'</span></div><div class="sr2" style="border:none;text-align:center;padding:4px 0"><span style="font-size:12px;font-weight:800;color:#000">'+custName+'</div>'+(pp?'<div id="'+qi+'" data-pix="'+pp+'" style="width:90px;height:90px;margin:2px auto"></div>':'')+'</div></div>'; };
    const capa = '<div class="cp"><div class="ch"><div class="lw">'+(sLogo?'<img src="'+sLogo+'" style="width:62px;height:62px;object-fit:cover;border-radius:4px"/>':'<div class="ls"><div class="lg"></div></div>')+'</div><div class="ct2"><div class="ctit">CARNE DE PAGAMENTO</div><div class="csn">'+sName+'</div>'+(sCnpj?'<div class="csi">CNPJ: '+sCnpj+'</div>':'')+((sAddr||sCity)?'<div class="csi">'+( sAddr||'')+( sCity?', '+sCity:'')+(sState?' - '+sState:'')+'</div>':'')+( sPhone?'<div class="csi">Tel: '+sPhone+'</div>':'')+'</div></div><div class="cb"><div class="cl">CLIENTE / DEVEDOR</div><div class="cn">'+p.customer_name+'</div></div><div class="cf"><div class="ci"><span class="ck">Total da Divida</span><span class="cv">'+fmtV(lista.reduce((s: number,x: any)=>s+x.amount,0))+'</span></div><div class="ci"><span class="ck">No Parcelas</span><span class="cv">'+nP+'</span></div><div class="ci"><span class="ck">Valor/Parcela</span><span class="cv">'+fmtV(lista.reduce((s: number,x: any)=>s+x.amount,0)/nP)+'</span></div><div class="ci"><span class="ck">Emissao</span><span class="cv">'+fmtD(cr.created_at || new Date().toISOString())+'</span></div></div></div>';
    const css = '@page{size:A4 portrait;margin:8mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000;background:#fff;display:flex;flex-direction:column}.cp{border:2px solid #1a3a8f;border-radius:4px;overflow:hidden;margin-bottom:0;flex-shrink:0}.ch{background:#1a3a8f;color:#fff;display:flex;align-items:center;gap:12px;padding:18px 14px}.lw{flex-shrink:0}.ls{width:62px;height:62px;border:2px solid rgba(255,255,255,.4);border-radius:4px;background:rgba(255,255,255,.1)}.lg{width:100%;height:100%;background:repeating-linear-gradient(90deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 1px,transparent 6px) top/6px 6px,repeating-linear-gradient(rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 1px,transparent 6px)}.ct2{flex:1;text-align:center}.ctit{font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.7);margin-bottom:3px}.csn{font-size:22px;font-weight:900}.csi{font-size:10px;color:rgba(255,255,255,.8);margin-top:2px}.cb{padding:20px 14px;border-bottom:1px solid #1a3a8f;flex:1}.cl{font-size:9px;font-weight:700;color:#1a3a8f;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}.cn{font-size:18px;font-weight:800}.cf{display:flex;background:#f0f4ff;border-top:1px solid #1a3a8f}.ci{flex:1;padding:14px 12px;border-right:1px solid #c7d2fe}.ci:last-child{border-right:none}.ck{display:block;font-size:9px;color:#1a3a8f;font-weight:700;text-transform:uppercase;margin-bottom:2px}.cv{font-size:13px;font-weight:800;color:#111}.sr{display:flex;align-items:stretch;border-top:2px dashed #aaa;padding:3px 0;break-inside:avoid;page-break-inside:avoid;width:100%;height:65mm}.mn{flex:6.5;border:1px solid #444;padding:6px 8px;display:flex;flex-direction:column;gap:3px}.ct{width:18px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#bbb;flex-shrink:0}.st{flex:3;border:1px solid #444;padding:6px 8px;background:#fafafa;display:flex;flex-direction:column;gap:3px}.sh{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1a3a8f;padding-bottom:4px;gap:4px}.ss{font-size:11px;font-weight:800;flex:1;color:#1a3a8f}.sm{flex:1}.sp{font-size:11px;font-weight:800;flex-shrink:0;color:#1a3a8f}.sd{font-size:8px;color:#666;flex-shrink:0}.fr{display:flex;gap:3px}.fb{border:1px solid #bbb;padding:3px 5px;min-height:30px}.fb.s{flex:1.2}.fb.xs{flex:0.7}.fb.xl{flex:3}.fb.xxl{flex:4}.fb.sv{flex:1.4}.fl{display:block;font-size:7.5px;color:#777;margin-bottom:2px;font-weight:600;text-transform:uppercase}.fv{font-size:10px;font-weight:700;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fb2{font-size:13px;font-weight:900;color:#1a3a8f}.fm{font-family:monospace;font-size:9px}.in{border:1px solid #e5c840;background:#fffbe6;padding:4px 7px;font-size:9px;color:#555;line-height:1.6}.bc{display:flex;align-items:center;height:46px;border:1px solid #bbb;padding:3px 8px;overflow:hidden}.s2{display:flex;justify-content:space-between;border-bottom:2px solid #1a3a8f;padding-bottom:4px;margin-bottom:3px}.s2p{font-size:12px;font-weight:900;color:#1a3a8f}.s2d{font-size:10px;color:#666}.sr2{border:1px solid #bbb;padding:4px 6px;min-height:32px}.sr2.hi{background:#f0f4ff;border-color:#1a3a8f}.sl{display:block;font-size:8px;color:#777;font-weight:700;text-transform:uppercase;margin-bottom:1px}.sv{font-size:10px;font-weight:700;display:block}.sb{font-size:14px;font-weight:900;color:#1a3a8f}.sbl{min-height:18px;border-bottom:1px solid #555;margin-top:6px}.sc{font-size:10px;font-weight:700;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sig{border-top:1px solid #555;margin-top:auto;padding-top:3px;font-size:11px;text-align:center;color:#000;font-weight:700}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sr{break-inside:avoid;page-break-inside:avoid}}';
    const listaFinal = lista.length > 0 ? lista : Array.from({length: nP}, (_, i) => {
      const due = new Date(); due.setMonth(due.getMonth() + i);
      return { installment_number: i+1, amount: (cr.total_amount||p.amount*nP)/nP, due_date: due.toISOString().split('T')[0], id: String(i) };
    });
    const pg1=listaFinal.slice(0,3);const rest=listaFinal.slice(3);
    let html='<div style="height:277mm;display:flex;flex-direction:column;page-break-after:always">'+capa+pg1.map((p: any,i: number)=>slip(p,i)).join('')+'</div>';
    for(let c=0;c<rest.length;c+=4){const grp=rest.slice(c,c+4);html+='<div style="height:277mm;display:flex;flex-direction:column;page-break-after:always">'+grp.map((p: any,i: number)=>slip(p,c+3+i)).join('')+'</div>';}
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Carne</title><style>'+css+'</style></head><body>'+html+'<scr'+'ipt src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></sc'+'ript><scr'+'ipt>window.addEventListener("load",function(){document.querySelectorAll("[data-pix]").forEach(function(el){var px=el.getAttribute("data-pix");if(px&&window.QRCode){new QRCode(el,{text:px,width:90,height:90,colorDark:"#000",colorLight:"#fff"})}})});</scr'+'ipt></body></html>');
    w.document.close();
    setTimeout(()=>w.print(),1500);
  };
  const payModal = showPayModal && selectedParcela ? (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.85)',zIndex:99999,display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={()=>setShowPayModal(false)}>
      <div style={{background:'var(--card,#1e2130)',borderRadius:12,padding:28,width:'100%',maxWidth:460,boxShadow:'0 20px 60px rgba(0,0,0,0.5)',border:'1px solid rgba(255,255,255,0.08)'}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h2 style={{fontSize:16,fontWeight:700,margin:0}}>Receber Parcela</h2>
          <button onClick={()=>setShowPayModal(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted,#888)',padding:4}}><X size={18}/></button>
        </div>
        <div style={{background:'rgba(255,255,255,0.05)',borderRadius:8,padding:12,marginBottom:16,fontSize:13}}>
          <div style={{fontWeight:600,fontSize:14}}>{selectedParcela.customer_name}</div>
          <div style={{color:'var(--text-muted,#888)',marginTop:2}}>Parcela {selectedParcela.installment_number} &mdash; Venc: {selectedParcela.due_date ? new Date(selectedParcela.due_date+'T00:00:00').toLocaleDateString('pt-BR') : '--'}</div>
          <div style={{fontSize:22,fontWeight:700,color:'#6366f1',marginTop:6}}>{fmtM(selectedParcela.amount + calcJuros(selectedParcela))}</div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}>Valor Recebido (R$)</label>
          <input className="form-input" value={payForm.is_partial ? payForm.paid_amount : (Math.max(0, selectedParcela.amount + calcJuros(selectedParcela) - (parseFloat((payForm.desconto||'0').replace(',','.')) || 0))).toFixed(2).replace('.',',')}
            onChange={e=>setPayForm(f=>({...f,paid_amount:e.target.value}))} readOnly={!payForm.is_partial} style={{marginBottom:10}}/>
          <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}>Data do Pagamento</label>
          <input className="form-input" type="date" value={payForm.partial_due_date || new Date().toISOString().split('T')[0]}
            onChange={e=>setPayForm(f=>({...f,partial_due_date:e.target.value}))}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6,color:'#22c55e'}}>Desconto (R$)</label>
          <input className="form-input" type="number" min="0" step="0.01" value={payForm.desconto}
            onChange={e=>setPayForm(f=>({...f,desconto:e.target.value}))}
            placeholder="0,00" style={{borderColor:'rgba(34,197,94,.3)'}}/>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,fontSize:13,cursor:'pointer'}}>
          <input type="checkbox" checked={payForm.is_partial} onChange={e=>setPayForm(f=>({...f,is_partial:e.target.checked}))} style={{width:16,height:16}}/>
          Pagamento Parcial
        </label>
        {payForm.is_partial && (
          <div style={{marginBottom:14,padding:12,background:'rgba(234,179,8,0.1)',borderRadius:8}}>
            <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}>Valor pago *</label>
            <input className="form-input" placeholder="0,00" value={payForm.paid_amount} onChange={e=>setPayForm(f=>({...f,paid_amount:e.target.value}))} style={{marginBottom:10}}/>
            <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}>Vencimento do saldo *</label>
            <input className="form-input" type="date" value={payForm.partial_due_date} onChange={e=>setPayForm(f=>({...f,partial_due_date:e.target.value}))}/>
            {payForm.paid_amount && parseFloat(payForm.paid_amount.replace(',','.')) > 0 && (
              <div style={{marginTop:10,padding:10,background:'rgba(234,179,8,0.15)',borderRadius:8,fontSize:13}}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>Valor total da parcela:</span>
                  <span style={{fontWeight:600}}>{fmtM(selectedParcela.amount + calcJuros(selectedParcela))}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                  <span>Valor recebido:</span>
                  <span style={{fontWeight:600,color:'#22c55e'}}>{fmtM(parseFloat(payForm.paid_amount.replace(',','.')))}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:4,borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:6}}>
                  <span style={{fontWeight:700}}>Saldo restante:</span>
                  <span style={{fontWeight:700,color:'#f59e0b'}}>{fmtM(Math.max(0, selectedParcela.amount + calcJuros(selectedParcela) - parseFloat(payForm.paid_amount.replace(',','.'))))}</span>
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:14,marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10,fontSize:12,color:'var(--text-muted,#888)'}}><Lock size={12}/> Autorização do Operador</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}><User size={11} style={{marginRight:3,verticalAlign:'middle'}}/> Nome *</label>
              <input className="form-input" placeholder="Nome do funcionário" value={payForm.operator_name} onChange={e=>setPayForm(f=>({...f,operator_name:e.target.value}))}/>
            </div>
            <div>
              <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}><Lock size={11} style={{marginRight:3,verticalAlign:'middle'}}/> Senha *</label>
              <input className="form-input" type="password" placeholder="••••••" value={payForm.operator_pass} onChange={e=>setPayForm(f=>({...f,operator_pass:e.target.value}))}/>
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button className="btn btn-secondary" onClick={()=>setShowPayModal(false)} style={{flex:1}}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirmPay} disabled={payingSaving} style={{flex:1}}>{payingSaving ? 'Processando...' : 'Confirmar Baixa'}</button>
        </div>
      </div>
    </div>
  ) : null;

  // Modal de Renegociacao
  const parcelasDoCarneRenegociando = renegociando ? parcelas.filter(p => p.crediario_id === renegociando && p.status !== 'pago') : [];
  const totalRenegociando = parcelasDoCarneRenegociando.reduce((s, p) => s + p.amount, 0);
  const clienteRenegociando = parcelasDoCarneRenegociando[0]?.customer_name || '';

  const handleSaveDate = async (parcelaId: string) => {
    if (!newDate) { toast.error('Informe a nova data'); return; }
    const { error } = await supabase.from('crediario_parcelas').update({ due_date: newDate }).eq('id', parcelaId);
    if (error) { toast.error('Erro ao salvar data'); return; }
    toast.success('Data atualizada!');
    setEditingDateParcela(null);
    setNewDate('');
    load();
  };
  const handleRenego = async (crediarioId: string) => {
    const { data: existing } = await supabase.from('crediario').select('id,total_amount,installments,created_at,status,notes').eq('tenant_id', tenantId).like('notes', 'Renegociacao:'+crediarioId).maybeSingle();
    if (existing) {
      const { data: origP } = await supabase.from('crediario_parcelas').select('*').eq('crediario_id', crediarioId).order('installment_number', { ascending: true });
      const { data: novoP } = await supabase.from('crediario_parcelas').select('*').eq('crediario_id', existing.id).order('installment_number', { ascending: true });
      setRenegoSummary({ original: origP||[], novo: novoP||[], cred: existing });
    } else {
      setRenegociando(crediarioId);
    }
  };

  const confirmarRenegociacao = async () => {
    if (!renegociando) return;
    const novoValor = parseFloat(renego.novoValor.replace(',', '.'));
    const numP = parseInt(renego.numParcelas);
    if (!novoValor || novoValor <= 0) { toast.error('Informe o novo valor total'); return; }
    if (!numP || numP <= 0) { toast.error('Informe o numero de parcelas'); return; }
    if (!renego.dataInicio) { toast.error('Informe a data da primeira parcela'); return; }
    const valorParcela = novoValor / numP;

    // Criar novo crediario
    const { data: novoCred, error: credErr } = await supabase.from('crediario').insert([{
      tenant_id: tenantId,
      customer_id: parcelasDoCarneRenegociando[0]?.customer_id || null,
      customer_name: clienteRenegociando,
      total_amount: novoValor,
      installments: numP,
      status: 'ativo',
      notes: 'Renegociacao:' + renegociando,
      sale_id: null,
    }]).select().single();
    if (credErr || !novoCred) { toast.error('Erro ao criar renegociacao'); return; }

    // Criar novas parcelas
    const novasParcelas = [];
    const dtBase = new Date(renego.dataInicio + 'T12:00:00');
    for (let i = 0; i < numP; i++) {
      const dt = new Date(dtBase);
      dt.setMonth(dt.getMonth() + i);
      novasParcelas.push({
        crediario_id: novoCred.id,
        tenant_id: tenantId,
        installment_number: i + 1,
        due_date: dt.toISOString().split('T')[0],
        amount: parseFloat(valorParcela.toFixed(2)),
        status: 'pendente',
      });
    }
    await supabase.from('crediario_parcelas').insert(novasParcelas);

    // Tratar carne original
    if (renego.destino === 'cancelar') {
      await supabase.from('crediario').update({ status: 'cancelado' }).eq('id', renegociando);
      await supabase.from('crediario_parcelas').update({ status: 'cancelado' }).eq('crediario_id', renegociando).neq('status', 'pago');
    } else if (renego.destino === 'quitado') {
      await supabase.from('crediario').update({ status: 'quitado' }).eq('id', renegociando);
      await supabase.from('crediario_parcelas').update({ status: 'pago', paid_at: new Date().toISOString().split('T')[0] }).eq('crediario_id', renegociando).neq('status', 'pago');
    }

    toast.success('Renegociacao criada com sucesso!');
    setRenegociando(null);
    setRenego({ novoValor:'', numParcelas:'1', dataInicio:'', destino:'cancelar' });
    load();
  };

  return (
    <div>
      {payModal}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <CreditCard size={22}/> Crediario
          </h1>
          <p className="page-sub">Controle de parcelas e cobancas</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
        <div className="card" style={{ padding:20, borderTop:'3px solid #6366f1' }}>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>Total em Aberto</div>
          <div style={{ fontSize:26, fontWeight:800, color:'#6366f1' }}>{formatBRL(totalAberto)}</div>
        </div>
        <div className="card" style={{ padding:20, borderTop:'3px solid #f87171' }}>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>Vencidas</div>
          <div style={{ fontSize:26, fontWeight:800, color:'#f87171' }}>{formatBRL(totalVencido)}</div>
        </div>
        <div className="card" style={{ padding:20, borderTop:'3px solid #22c55e' }}>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>Recebido no Mes</div>
          <div style={{ fontSize:26, fontWeight:800, color:'#22c55e' }}>{formatBRL(totalRecebidoMes)}</div>
        </div>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Buscar cliente..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{ width:160 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="vencida">Vencidas</option>
          <option value="aberta">Abertas</option>
          <option value="pago">Pagas</option>
        </select>
        <input type="date" className="form-input" style={{ width:150 }} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} placeholder="De"/>
        <input type="date" className="form-input" style={{ width:150 }} value={dateTo} onChange={e=>setDateTo(e.target.value)} placeholder="Ate"/>
      </div>

      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
        filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><CreditCard size={40}/></div>
            <h3>Nenhuma parcela encontrada.</h3>
            {parcelas.length === 0 && !loading && <div style={{marginTop:12, padding:"10px 16px", background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", borderRadius:8, color:"#f87171", fontSize:13}}>⚠️ Nenhum dado carregado. Se isso for inesperado, faça logout e login novamente ou contate o suporte.</div>}
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left' }}>Cliente</th>
                    <th style={{ textAlign:'center' }}>Parcela</th>
                    <th style={{ textAlign:'right' }}>Valor</th>
                    <th style={{ textAlign:'center' }}>Vencimento</th>
                    <th style={{ textAlign:'center' }}>Juros</th>
                    <th style={{ textAlign:'center' }}>Status</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA).map(p => {
                    const juros = calcJuros(p);
                    const vencida = p.status !== 'pago' && p.due_date && p.due_date < hoje;
                    const pago = p.status === 'pago';
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight:600 }}>{p.customer_name}</div>
                        </td>
                        <td style={{ textAlign:'center', fontWeight:700, color:'#6366f1' }}>
                          {p.installment_number}/{p.total_installments}
                        </td>
                        <td style={{ textAlign:'right', fontWeight:700 }}>
                          {(pago && p.paid_amount != null && Math.abs(p.paid_amount - p.amount) > 0.01 ? formatBRL(p.paid_amount) : formatBRL(p.amount))}
                        </td>
                        <td style={{ textAlign:'center' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                            <Calendar size={12} style={{ color: vencida ? '#f87171' : 'var(--text-muted)' }}/>
     <div style={{display:'flex',alignItems:'center',gap:6}}>
       {editingDateParcela === p.id ? (
         <div style={{display:'flex',alignItems:'center',gap:4}}><input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} style={{fontSize:11,padding:'2px 4px',border:'1px solid var(--border)',borderRadius:4,background:'var(--surface-2)',color:'var(--text-primary)'}}/><button onClick={()=>handleSaveDate(p.id)} style={{fontSize:10,padding:'2px 6px',background:'#22c55e',color:'white',border:'none',borderRadius:4,cursor:'pointer'}}>OK</button><button onClick={()=>setEditingDateParcela(null)} style={{fontSize:10,padding:'2px 4px',background:'#ef4444',color:'white',border:'none',borderRadius:4,cursor:'pointer'}}>X</button></div>
       ) : (<><span style={{color:vencida?'#f87171':'inherit',fontWeight:vencida?700:400}}>{p.due_date?new Date(p.due_date+'T00:00:00').toLocaleDateString('pt-BR'):'--'}</span>{p.status!=='pago'&&<button onClick={()=>{setEditingDateParcela(p.id);setNewDate(p.due_date||'');}} title="Alterar data" style={{background:'none',border:'none',cursor:'pointer',padding:2,color:'#6366f1',display:'inline-flex',alignItems:'center'}}><Calendar size={12}/></button>}</>)}
     </div>
                        <td style={{ textAlign:'center' }}>
                          {juros > 0 ? (
                            <span style={{ color:'#f87171', fontWeight:700, fontSize:12 }}>+{formatBRL(juros)}</span>
                          ) : <span style={{ color:'var(--text-muted)', fontSize:12 }}>--</span>}
                        </td>
                        <td style={{ textAlign:'center' }}>
                          {pago ? (
                            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'rgba(34,197,94,.15)', color:'#22c55e' }}>Paga</span>
                          ) : vencida ? (
                            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'rgba(248,113,113,.15)', color:'#f87171' }}>Vencida</span>
                          ) : (
                            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'rgba(99,102,241,.15)', color:'#6366f1' }}>Aberta</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display:'flex', gap:5 }}>
                            {!pago && (
                              <button onClick={() => pagarParcela(p)} title="Receber"
                                style={{ background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.2)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#22c55e', display:'flex', alignItems:'center' }}>
                                <CheckCircle size={14}/>
                              </button>
                            )}
                            <button onClick={() => abrirWhatsApp(p)} title="Cobrar via WhatsApp"
                              style={{ background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.2)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#25D366', display:'flex', alignItems:'center' }}>
                              <MessageCircle size={14}/>
                            </button>
                            <button onClick={() => imprimirCarneIndividual(p)} title="Imprimir recibo desta parcela"
                              style={{ background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.2)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#f59e0b', display:'flex', alignItems:'center' }}>
                              <Printer size={14}/>
                            </button>
                       <button onClick={() => imprimirCarneCompleto(p)} title="Imprimir carne completo" style={{ background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.2)', borderRadius:7, padding:'5px 8px', cursor:'pointer', marginLeft:2 }}><span style={{fontSize:14}}>&#128196;</span></button>
                            {pago && (
                              <button onClick={async () => {
                                if (!confirm('Desmarcar pagamento desta parcela?')) return;
                                await supabase.from('crediario_parcelas').update({ status:'pendente', paid_at:null, paid_amount:null }).eq('id', p.id);
                                toast.success('Parcela desmarcada'); load();
                              }} title="Desfazer pagamento / Retornar para Pendente"
                                style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}>
                                <Trash2 size={14}/>
                              </button>
     )}
     {!pago && (
       <button onClick={() => handleRenego(p.crediario_id)} title="Renegociar carne"
         style={{ background:renegociados.has(p.crediario_id)?'rgba(99,102,241,.15)':'rgba(251,191,36,.1)', border:renegociados.has(p.crediario_id)?'1px solid rgba(99,102,241,.4)':'1px solid rgba(251,191,36,.3)',borderRadius:7, padding:'5px 8px', cursor:'pointer', color:renegociados.has(p.crediario_id)?'#818cf8':'#fbbf24', display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
         ↺ Renego
       </button>
     )}
                            {!pago && (
                              <button onClick={async () => {
                                if (!confirm('Excluir esta parcela permanentemente?')) return;
                                await supabase.from('crediario_parcelas').delete().eq('id', p.id);
                                toast.success('Parcela excluida'); load();
                              }} title="Excluir parcela"
                                style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}>
                                <Trash2 size={14}/>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
              {filtered.length} parcela(s) no total — Pag. {pagina}/{Math.ceil(filtered.length/POR_PAGINA)}
        <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={() => setPagina(p => Math.max(1,p-1))} disabled={pagina===1} style={{ padding:'4px 12px', borderRadius:6, border:'1px solid var(--border)', background:pagina===1?'transparent':'var(--primary)', color:pagina===1?'var(--text-muted)':'#fff', cursor:pagina===1?'not-allowed':'pointer', fontSize:12 }}>← Ant</button>
          {Array.from({length:Math.ceil(filtered.length/POR_PAGINA)},(_,i)=>i+1).filter(n=>Math.abs(n-pagina)<=2).map(n=>(<button key={n} onClick={()=>setPagina(n)} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:n===pagina?'var(--primary)':'transparent', color:n===pagina?'#fff':'var(--text-muted)', cursor:'pointer', fontWeight:n===pagina?700:400, fontSize:12 }}>{n}</button>))}
          <button onClick={() => setPagina(p => Math.min(Math.ceil(filtered.length/POR_PAGINA),p+1))} disabled={pagina===Math.ceil(filtered.length/POR_PAGINA)} style={{ padding:'4px 12px', borderRadius:6, border:'1px solid var(--border)', background:pagina===Math.ceil(filtered.length/POR_PAGINA)?'transparent':'var(--primary)', color:pagina===Math.ceil(filtered.length/POR_PAGINA)?'var(--text-muted)':'#fff', cursor:pagina===Math.ceil(filtered.length/POR_PAGINA)?'not-allowed':'pointer', fontSize:12 }}>Prox →</button>
        </div>
     </div>
          </div>
        )}

      {renegoSummary && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--bg2)',borderRadius:14,padding:28,width:'90%',maxWidth:680,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.4)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:18,fontWeight:700}}>↺ Resumo da Renegociação</h2>
              <button onClick={()=>setRenegoSummary(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:22}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:'var(--text-muted)',marginBottom:10,textTransform:'uppercase',letterSpacing:'.5px'}}>📋 Dívida Original</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{borderBottom:'1px solid var(--border)'}}><th style={{padding:'4px 6px',textAlign:'center'}}>Parc.</th><th style={{padding:'4px 6px',textAlign:'left'}}>Vencimento</th><th style={{padding:'4px 6px',textAlign:'right'}}>Valor</th><th style={{padding:'4px 6px',textAlign:'center'}}>Status</th></tr></thead>
                  <tbody>{renegoSummary.original.map((p:any,i:number)=>{
                    const atrasada=p.status!=='pago'&&p.due_date&&p.due_date<new Date().toISOString().split('T')[0];
                    return <tr key={i} style={{borderBottom:'1px solid var(--border)'}}><td style={{padding:'4px 6px',textAlign:'center',fontWeight:600}}>{p.installment_number}/{renegoSummary.original.length}</td><td style={{padding:'4px 6px',color:atrasada?'#f87171':'var(--text-muted)'}}>{p.due_date?new Date(p.due_date+'T00:00:00').toLocaleDateString('pt-BR'):'--'}</td><td style={{padding:'4px 6px',textAlign:'right'}}>{Number(p.amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td style={{padding:'4px 6px',textAlign:'center'}}><span style={{padding:'1px 7px',borderRadius:20,fontSize:10,fontWeight:700,background:p.status==='pago'?'rgba(34,197,94,.15)':atrasada?'rgba(248,113,113,.15)':'rgba(251,191,36,.15)',color:p.status==='pago'?'#22c55e':atrasada?'#f87171':'#fbbf24'}}>{p.status==='pago'?'Pago':atrasada?'Atrasada':'Aberta'}</span></td></tr>;
                  })}</tbody>
                </table>
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:'#6366f1',marginBottom:10,textTransform:'uppercase',letterSpacing:'.5px'}}>🔄 Nova Renegociação</div>
                <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:8}}>Total: {Number(renegoSummary.cred.total_amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} em {renegoSummary.cred.installments}x — Criada em {new Date(renegoSummary.cred.created_at).toLocaleDateString('pt-BR')}</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{borderBottom:'1px solid var(--border)'}}><th style={{padding:'4px 6px',textAlign:'center'}}>Parc.</th><th style={{padding:'4px 6px',textAlign:'left'}}>Vencimento</th><th style={{padding:'4px 6px',textAlign:'right'}}>Valor</th><th style={{padding:'4px 6px',textAlign:'center'}}>Status</th></tr></thead>
                  <tbody>{renegoSummary.novo.map((p:any,i:number)=>{
                    const atrasada=p.status!=='pago'&&p.due_date&&p.due_date<new Date().toISOString().split('T')[0];
                    return <tr key={i} style={{borderBottom:'1px solid var(--border)'}}><td style={{padding:'4px 6px',textAlign:'center',fontWeight:600}}>{p.installment_number}/{renegoSummary.novo.length}</td><td style={{padding:'4px 6px',color:atrasada?'#f87171':'#6366f1'}}>{p.due_date?new Date(p.due_date+'T00:00:00').toLocaleDateString('pt-BR'):'--'}{atrasada?' ⚠️':''}</td><td style={{padding:'4px 6px',textAlign:'right'}}>{Number(p.amount||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td style={{padding:'4px 6px',textAlign:'center'}}><span style={{padding:'1px 7px',borderRadius:20,fontSize:10,fontWeight:700,background:p.status==='pago'?'rgba(34,197,94,.15)':atrasada?'rgba(248,113,113,.15)':'rgba(99,102,241,.15)',color:p.status==='pago'?'#22c55e':atrasada?'#f87171':'#6366f1'}}>{p.status==='pago'?'Pago':atrasada?'Atrasada':'Aberta'}</span></td></tr>;
                  })}</tbody>
                </table>
              </div>
            </div>
            <div style={{marginTop:20,textAlign:'right'}}>
              <button onClick={()=>setRenegoSummary(null)} className="btn btn-secondary">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Renegociacao */}
      {renegociando && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:1000, backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--card)', borderRadius:16, padding:28, width:'100%', maxWidth:480, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 style={{ fontSize:18, fontWeight:700, color:'#fbbf24' }}>↺ Renegociar Divida</h2>
              <button onClick={() => setRenegociando(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:20 }}>✕</button>
            </div>
            <div style={{ background:'rgba(251,191,36,.08)', border:'1px solid rgba(251,191,36,.2)', borderRadius:10, padding:14, marginBottom:20 }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>{clienteRenegociando}</div>
              <div style={{ fontSize:13, color:'var(--text-muted)' }}>{parcelasDoCarneRenegociando.length} parcela(s) em aberto — Total: <strong style={{ color:'#f87171' }}>R$ {totalRenegociando.toFixed(2).replace('.',',')}</strong></div>
            </div>
            <div style={{ display:'grid', gap:14 }}>
              <div>
                <label style={{ fontSize:12, color:'var(--text-muted)', display:'block', marginBottom:4 }}>NOVO VALOR TOTAL (R$)</label>
                <input className="form-input" placeholder="ex: 630,00" value={renego.novoValor} onChange={e => setRenego(r => ({...r, novoValor: e.target.value}))} />
                {renego.novoValor && parseFloat(renego.numParcelas) > 0 && (
                  <div style={{ fontSize:12, color:'#6366f1', marginTop:4 }}>
                    {renego.numParcelas}x de R$ {(parseFloat(renego.novoValor.replace(',','.')) / parseInt(renego.numParcelas)).toFixed(2).replace('.',',')}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize:12, color:'var(--text-muted)', display:'block', marginBottom:4 }}>NUMERO DE PARCELAS</label>
                <input className="form-input" type="number" min="1" max="60" value={renego.numParcelas} onChange={e => setRenego(r => ({...r, numParcelas: e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize:12, color:'var(--text-muted)', display:'block', marginBottom:4 }}>DATA DA 1a PARCELA</label>
                <input className="form-input" type="date" value={renego.dataInicio} onChange={e => setRenego(r => ({...r, dataInicio: e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize:12, color:'var(--text-muted)', display:'block', marginBottom:4 }}>O QUE FAZER COM O CARNE ORIGINAL?</label>
                <select className="form-input" value={renego.destino} onChange={e => setRenego(r => ({...r, destino: e.target.value}))}>
                  <option value="cancelar">Cancelar carne original</option>
                  <option value="quitado">Marcar como quitado</option>
                  <option value="manter">Manter como esta</option>
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:22 }}>
              <button onClick={() => setRenegociando(null)} className="btn btn-secondary" style={{ flex:1 }}>Cancelar</button>
              <button onClick={confirmarRenegociacao} className="btn btn-primary" style={{ flex:2, background:'#fbbf24', color:'#000', fontWeight:700 }}>✓ Confirmar Renegociacao</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  CreditCard, Search, CheckCircle, Trash2,
  AlertTriangle, Download, MessageCircle, Calendar, Printer, Lock, User, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL } from '../types/index';

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
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedParcela, setSelectedParcela] = useState<Parcela | null>(null);
  const [payForm, setPayForm] = useState({ operator_name: '', operator_pass: '', is_partial: false, paid_amount: '', partial_due_date: '' });
  const [payingSaving, setPayingSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: creds } = await supabase
      .from('crediario')
      .select('id, customer_id, customer_name, total_amount, installments, sale_id, status, parcelas:crediario_parcelas(*)')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelado');
    const { data: custs } = await supabase
      .from('customers')
      .select('id, whatsapp, phone')
      .eq('tenant_id', tenantId);
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

  const pagarParcela = (p: Parcela) => {
    setSelectedParcela(p);
    setPayForm({ operator_name: '', operator_pass: '', is_partial: false, paid_amount: '', partial_due_date: '' });
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
    if (String(funcs[0].access_password).trim() !== payForm.operator_pass.trim()) { toast.error('Senha incorreta'); return; }
    const juros = calcJuros(p);
    const total = p.amount + juros;
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
      toast.success(payForm.is_partial ? 'Pagamento parcial registrado!' : 'Parcela recebida!');
      setShowPayModal(false);
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
    const nP2 = p.installment_count || '?';
    const venc = p.due_date ? fmtD2(p.due_date) : '--';
    const hoje = new Date().toLocaleDateString('pt-BR');
    // Buscar dados da loja do localStorage
    const storeRaw = localStorage.getItem('store_settings') || localStorage.getItem('func_session') || '{}';
    let storeName = 'OPTIFLOW';
    let storeCnpj = '';
    let storeAddr = '';
    let storeTel = '';
    let storeLogo = '';
    try {
      const ss = JSON.parse(storeRaw);
      storeName = (ss.store_name || ss.name || ss.company_name || 'OPTIFLOW').toUpperCase();
      storeCnpj = ss.cnpj || '';
      storeAddr = [ss.address, ss.city, ss.state].filter(Boolean).join(', ');
      storeTel = ss.phone || '';
      storeLogo = ss.logo_url || '';
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
          <input className="form-input" value={payForm.is_partial ? payForm.paid_amount : fmtM(selectedParcela.amount+calcJuros(selectedParcela)).replace('R$ ','').replace('R$','').trim()}
            onChange={e=>setPayForm(f=>({...f,paid_amount:e.target.value}))} readOnly={!payForm.is_partial} style={{marginBottom:10}}/>
          <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}>Data do Pagamento</label>
          <input className="form-input" type="date" value={payForm.partial_due_date || new Date().toISOString().split('T')[0]}
            onChange={e=>setPayForm(f=>({...f,partial_due_date:e.target.value}))}/>
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
                  {filtered.map(p => {
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
                          {formatBRL(p.amount)}
                        </td>
                        <td style={{ textAlign:'center' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                            <Calendar size={12} style={{ color: vencida ? '#f87171' : 'var(--text-muted)' }}/>
                            <span style={{ color: vencida ? '#f87171' : 'inherit', fontWeight: vencida ? 700 : 400 }}>
                              {p.due_date ? new Date(p.due_date+'T00:00:00').toLocaleDateString('pt-BR') : '--'}
                            </span>
                          </div>
                        </td>
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
                            <button onClick={() => imprimirCarneIndividual(p)} title="Imprimir parcela"
                              style={{ background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.2)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#f59e0b', display:'flex', alignItems:'center' }}>
                              <Printer size={14}/>
                            </button>
                            {pago && (
                              <button onClick={async () => {
                                if (!confirm('Desmarcar pagamento desta parcela?')) return;
                                await supabase.from('crediario_parcelas').update({ status:'pendente', paid_at:null, paid_amount:null }).eq('id', p.id);
                                toast.success('Parcela desmarcada'); load();
                              }} title="Desmarcar pagamento"
                                style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}>
                                <Trash2 size={14}/>
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
              {filtered.length} parcela(s) exibida(s)
            </div>
          </div>
        )}
    </div>
  );
}

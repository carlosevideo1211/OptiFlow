import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import {
  BarChart3, TrendingUp, TrendingDown, Users, ShoppingCart,
  CreditCard, Package, Download, Calendar, DollarSign,
  ClipboardList, UserCheck, Award, Printer, ArrowUp, ArrowDown
} from 'lucide-react';
import { formatBRL } from '../types/index';
import BaixasTab from './BaixasTab';
import { abrirDocumentoImprimivel, getCabecalhoLoja, printBaseStyle, type DadosLoja } from '../utils/printDoc';

const PAGAMENTO_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Cartão Crédito',
  debito: 'Cartão Débito', crediario: 'Crediário', transferencia: 'Transferência', boleto: 'Boleto'
};

export default function RelatoriosPage() {
  const { tenantId, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState('resumo');
  const [periodo, setPeriodo] = useState('mes');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [mesEspecifico, setMesEspecifico] = useState('');
  const [data, setData] = useState({
    totalVendas: 0, numVendas: 0, ticketMedio: 0,
    totalClientes: 0, clientesNovos: 0,
    totalOS: 0, osEntregues: 0,
    receitaFinanceiro: 0, despesaFinanceiro: 0, saldoFinanceiro: 0,
    produtosMaisVendidos: [] as any[],
    vendasPorPagamento: [] as any[],
    osPorStatus: [] as any[],
    vendasPorVendedor: [] as any[],
    totalEntrada: 0,
    vendasDetalhe: [] as any[],
    itensPorVenda: {} as Record<string, {description:string;quantity:number}[]>,
  });

  useEffect(() => { if (tenantId) loadData(); }, [tenantId, periodo, dateFrom, dateTo, mesEspecifico]);

  // Dados auxiliares usados apenas nos relatorios impressos (nao no dashboard).
  const [storeSettings, setStoreSettings] = useState<DadosLoja | null>(null);
  const [funcionarios, setFuncionarios] = useState<{id:string;name:string}[]>([]);
  const [vendedorFiltro, setVendedorFiltro] = useState('');
  const [gerandoRelatorio, setGerandoRelatorio] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single()
      .then(({ data }) => { if (data) setStoreSettings(data as DadosLoja); });
    supabase.from('funcionarios').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setFuncionarios((data || []) as {id:string;name:string}[]));
  }, [tenantId]);

  const getRange = () => {
    if (periodo === 'custom' && dateFrom && dateTo) return { from: dateFrom, to: dateTo };
    if (periodo === 'mesEspecifico' && mesEspecifico) {
      // mesEspecifico vem do <input type="month"> no formato "AAAA-MM"
      const [ano, mesN] = mesEspecifico.split('-').map(Number);
      const ultimoDia = new Date(ano, mesN, 0).getDate();
      return { from: `${mesEspecifico}-01`, to: `${mesEspecifico}-${String(ultimoDia).padStart(2,'0')}` };
    }
    const hoje = new Date();
    if (periodo === 'hoje') { const d = hoje.toISOString().split('T')[0]; return { from: d, to: d }; }
    if (periodo === 'semana') { const from = new Date(hoje); from.setDate(hoje.getDate() - 7); return { from: from.toISOString().split('T')[0], to: hoje.toISOString().split('T')[0] }; }
    if (periodo === 'mes') return { from: hoje.toISOString().slice(0,8)+'01', to: hoje.toISOString().split('T')[0] };
    if (periodo === 'ano') return { from: hoje.getFullYear()+'-01-01', to: hoje.toISOString().split('T')[0] };
    return { from: hoje.toISOString().slice(0,8)+'01', to: hoje.toISOString().split('T')[0] };
  };

  const loadData = async () => {
    setLoading(true);
    const { from, to } = getRange();
    const [vendas, clientes, os, financeiro] = await Promise.all([
      fetchAllRows<any>((rf, rt) => supabase.from('sales').select('*').eq('tenant_id', tenantId).eq('status','concluida').gte('created_at', from).lte('created_at', to+'T23:59:59').range(rf, rt)),
      fetchAllRows<any>((rf, rt) => supabase.from('customers').select('created_at').eq('tenant_id', tenantId).eq('active', true).range(rf, rt)),
      fetchAllRows<any>((rf, rt) => supabase.from('service_orders').select('status').eq('tenant_id', tenantId).range(rf, rt)),
      fetchAllRows<any>((rf, rt) => supabase.from('financial_transactions').select('type,amount,status').eq('tenant_id', tenantId).range(rf, rt)),
    ]);

    // Itens das vendas do periodo (usado nos "produtos mais vendidos" e no relatorio
    // Completo, para mostrar o que o cliente comprou em cada venda). Buscado por
    // sale_id das vendas ja filtradas pelo periodo, em vez de todo o historico do
    // tenant, para nao misturar itens de vendas de fora do periodo selecionado.
    const saleIds = (vendas||[]).map((v:any) => v.id);
    const saleItems = saleIds.length > 0
      ? await fetchAllRows<any>((rf, rt) => supabase.from('sale_items').select('description,quantity,total,sale_id').eq('tenant_id', tenantId).in('sale_id', saleIds).range(rf, rt))
      : [];

    const itensPorVenda: Record<string, {description:string;quantity:number}[]> = {};
    (saleItems||[]).forEach((i:any) => {
      if (!itensPorVenda[i.sale_id]) itensPorVenda[i.sale_id] = [];
      itensPorVenda[i.sale_id].push({ description: i.description, quantity: i.quantity });
    });

    const totalVendas  = (vendas||[]).reduce((s,v)=>s+v.total,0);
    const numVendas    = (vendas||[]).length;
    const ticketMedio  = numVendas > 0 ? totalVendas/numVendas : 0;
    const totalEntrada = (vendas||[]).reduce((s,v)=>s+(v.entrada||0),0);
    const clientesNovos = (clientes||[]).filter(c => c.created_at >= from).length;

    // Vendas por pagamento
    const pagMap: Record<string,number> = {};
    (vendas||[]).forEach(v => { pagMap[v.payment_method] = (pagMap[v.payment_method]||0) + v.total; });
    const vendasPorPagamento = Object.entries(pagMap).map(([k,v])=>({method:k,total:v})).sort((a,b)=>b.total-a.total);

    // OS por status
    const osMap: Record<string,number> = {};
    (os||[]).forEach(o => { osMap[o.status] = (osMap[o.status]||0)+1; });
    const osPorStatus = Object.entries(osMap).map(([k,v])=>({status:k,count:v}));

    // Produtos mais vendidos
    const prodMap: Record<string,{qty:number,total:number}> = {};
    (saleItems||[]).forEach(i => {
      if (!prodMap[i.description]) prodMap[i.description] = {qty:0,total:0};
      prodMap[i.description].qty   += i.quantity;
      prodMap[i.description].total += i.total;
    });
    const produtosMaisVendidos = Object.entries(prodMap).map(([k,v])=>({name:k,...v})).sort((a,b)=>b.qty-a.qty).slice(0,8);

    // Vendas por vendedor
    const vendMap: Record<string,{num:number,total:number}> = {};
    (vendas||[]).forEach(v => {
      const key = v.vendedor || 'Não informado';
      if (!vendMap[key]) vendMap[key] = {num:0,total:0};
      vendMap[key].num++;
      vendMap[key].total += v.total;
    });
    const vendasPorVendedor = Object.entries(vendMap).map(([k,v])=>({vendedor:k,...v})).sort((a,b)=>b.total-a.total);

    const receitaFinanceiro  = (financeiro||[]).filter(f=>f.type==='receita'&&f.status==='pago').reduce((s,f)=>s+f.amount,0);
    const despesaFinanceiro  = (financeiro||[]).filter(f=>f.type==='despesa'&&f.status==='pago').reduce((s,f)=>s+f.amount,0);
    const saldoFinanceiro    = receitaFinanceiro - despesaFinanceiro;

    setData({
      totalVendas, numVendas, ticketMedio, totalEntrada,
      totalClientes: (clientes||[]).length, clientesNovos,
      totalOS: (os||[]).length, osEntregues: (os||[]).filter(o=>o.status==='entregue').length,
      receitaFinanceiro, despesaFinanceiro, saldoFinanceiro,
      produtosMaisVendidos, vendasPorPagamento, osPorStatus, vendasPorVendedor,
      vendasDetalhe: vendas || [],
      itensPorVenda,
    });
    setLoading(false);
  };

  const exportCSV = () => {
    const { from, to } = getRange();
    const lines = [
      'RELATÓRIO OPTIFLOW',
      'Período: '+from+' até '+to,
      '',
      'VENDAS',
      'Total de Vendas,'+formatBRL(data.totalVendas),
      'Número de Vendas,'+data.numVendas,
      'Ticket Médio,'+formatBRL(data.ticketMedio),
      'Total de Entradas,'+formatBRL(data.totalEntrada),
      '',
      'FINANCEIRO',
      'Receitas,'+formatBRL(data.receitaFinanceiro),
      'Despesas,'+formatBRL(data.despesaFinanceiro),
      'Saldo,'+formatBRL(data.saldoFinanceiro),
      '',
      'CLIENTES',
      'Total,'+data.totalClientes,
      'Novos no Período,'+data.clientesNovos,
      '',
      'ORDENS DE SERVIÇO',
      'Total,'+data.totalOS,
      'Entregues,'+data.osEntregues,
      '',
      'PRODUTOS MAIS VENDIDOS',
      'Produto,Quantidade,Total',
      ...data.produtosMaisVendidos.map(p=>p.name+','+p.qty+','+formatBRL(p.total)),
      '',
      'VENDAS POR VENDEDOR',
      'Vendedor,Vendas,Total',
      ...data.vendasPorVendedor.map(v=>v.vendedor+','+v.num+','+formatBRL(v.total)),
    ];
    const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='relatorio.csv'; a.click();
  };

  // Calcula o periodo imediatamente anterior, de mesma duracao, para comparacao.
  const getPeriodoAnterior = () => {
    const { from, to } = getRange();
    const fromDt = new Date(from + 'T00:00:00');
    const toDt = new Date(to + 'T00:00:00');
    const diasDuracao = Math.max(1, Math.round((toDt.getTime() - fromDt.getTime()) / 86400000) + 1);
    const antTo = new Date(fromDt); antTo.setDate(antTo.getDate() - 1);
    const antFrom = new Date(antTo); antFrom.setDate(antFrom.getDate() - diasDuracao + 1);
    return { from: antFrom.toISOString().split('T')[0], to: antTo.toISOString().split('T')[0] };
  };

  const fmtVar = (atual: number, anterior: number) => {
    if (anterior <= 0) return atual > 0 ? '<span style="color:#16a34a">novo</span>' : '';
    const pct = ((atual - anterior) / anterior) * 100;
    const cor = pct >= 0 ? '#16a34a' : '#dc2626';
    const seta = pct >= 0 ? '▲' : '▼';
    return `<span style="color:${cor}">${seta} ${Math.abs(pct).toFixed(1)}% vs período anterior</span>`;
  };

  const periodoTitulo = () => {
    const { from, to } = getRange();
    const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
    return `Período: ${f(from)} a ${f(to)}`;
  };

  const gerarResumido = async () => {
    setGerandoRelatorio('resumido');
    try {
      const { from, to } = getRange();
      const antPer = getPeriodoAnterior();

      const [vendasAnt, saleIdsAtual] = await Promise.all([
        fetchAllRows<any>((rf, rt) => supabase.from('sales').select('total').eq('tenant_id', tenantId).eq('status','concluida').gte('created_at', antPer.from).lte('created_at', antPer.to+'T23:59:59').range(rf, rt)),
        Promise.resolve(data.vendasDetalhe.filter((v:any) => v.payment_method === 'crediario').map((v:any) => v.id)),
      ]);
      const totalAnt = (vendasAnt||[]).reduce((s,v)=>s+v.total,0);
      const numAnt = (vendasAnt||[]).length;

      // Cruzamento com o crediario: das vendas parceladas feitas neste periodo,
      // quanto ja foi recebido, quanto ainda vai vencer, e quanto ja esta vencido.
      let recebido = 0, aReceber = 0, vencido = 0;
      if (saleIdsAtual.length > 0) {
        const creds = await fetchAllRows<any>((rf, rt) => supabase.from('crediario').select('id').eq('tenant_id', tenantId).in('sale_id', saleIdsAtual).range(rf, rt));
        const credIds = (creds||[]).map((c:any)=>c.id);
        if (credIds.length > 0) {
          const parcelas = await fetchAllRows<any>((rf, rt) => supabase.from('crediario_parcelas').select('amount,status,due_date').in('crediario_id', credIds).range(rf, rt));
          const hoje = new Date().toISOString().split('T')[0];
          (parcelas||[]).forEach((p:any) => {
            if (p.status === 'pago') recebido += p.amount;
            else if (p.due_date && p.due_date < hoje) vencido += p.amount;
            else aReceber += p.amount;
          });
        }
      }

      const body = `
        ${getCabecalhoLoja(storeSettings)}
        <h3 style="text-align:center;text-transform:uppercase;margin:0 0 4px">Relatório Resumido de Vendas</h3>
        <p style="text-align:center;font-size:11px;color:#666;margin:0 0 16px">${periodoTitulo()}</p>

        <div class="rel-kpis">
          <div class="rel-kpi"><div class="rel-kpi-label">Nº de Vendas</div><div class="rel-kpi-val">${data.numVendas}</div><div class="rel-kpi-var">${fmtVar(data.numVendas, numAnt)}</div></div>
          <div class="rel-kpi"><div class="rel-kpi-label">Ticket Médio</div><div class="rel-kpi-val">${formatBRL(data.ticketMedio)}</div></div>
          <div class="rel-kpi"><div class="rel-kpi-label">Total Bruto</div><div class="rel-kpi-val">${formatBRL(data.totalVendas)}</div><div class="rel-kpi-var">${fmtVar(data.totalVendas, totalAnt)}</div></div>
          <div class="rel-kpi"><div class="rel-kpi-label">Total de Entradas</div><div class="rel-kpi-val">${formatBRL(data.totalEntrada)}</div></div>
        </div>

        <div class="rel-secao">Resumo por Vendedor</div>
        <table><tr><th>Vendedor</th><th>Vendas</th><th>Total</th><th>%</th></tr>
        ${data.vendasPorVendedor.map((v:any) => `<tr><td>${v.vendedor}</td><td>${v.num}</td><td>${formatBRL(v.total)}</td><td>${data.totalVendas>0?((v.total/data.totalVendas)*100).toFixed(1):'0'}%</td></tr>`).join('')}
        </table>

        <div class="rel-secao">Resumo por Forma de Pagamento</div>
        <table><tr><th>Forma de Pagamento</th><th>Total</th><th>%</th></tr>
        ${data.vendasPorPagamento.map((p:any) => `<tr><td>${PAGAMENTO_LABELS[p.method]||p.method}</td><td>${formatBRL(p.total)}</td><td>${data.totalVendas>0?((p.total/data.totalVendas)*100).toFixed(1):'0'}%</td></tr>`).join('')}
        </table>

        <div class="rel-secao">Crediário — Vendas do Período</div>
        <table><tr><th>Recebido</th><th>A Receber</th><th>Vencido</th></tr>
        <tr><td style="color:#16a34a;font-weight:700">${formatBRL(recebido)}</td><td>${formatBRL(aReceber)}</td><td style="color:#dc2626;font-weight:700">${formatBRL(vencido)}</td></tr>
        </table>
        <p style="font-size:10px;color:#888;margin-top:4px">Refere-se apenas às parcelas de vendas em crediário realizadas dentro do período selecionado, com status atualizado até hoje.</p>

        <p style="text-align:center;font-size:10px;color:#999;margin-top:24px">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
      `;

      abrirDocumentoImprimivel({
        title: 'Relatório Resumido de Vendas',
        filename: `relatorio-resumido-${from}-a-${to}.pdf`,
        css: printBaseStyle,
        body,
        windowFeatures: 'width=800,height=960',
      });
    } finally {
      setGerandoRelatorio('');
    }
  };

  const gerarCompleto = async () => {
    setGerandoRelatorio('completo');
    try {
      const { from, to } = getRange();
      const lista = vendedorFiltro
        ? data.vendasDetalhe.filter((v:any) => v.vendedor === vendedorFiltro)
        : data.vendasDetalhe;
      const ordenada = [...lista].sort((a:any,b:any) => a.created_at.localeCompare(b.created_at));
      const totalLista = ordenada.reduce((s:number,v:any)=>s+v.total,0);
      const totalDesc = ordenada.reduce((s:number,v:any)=>s+(v.discount||0),0);

      const fmtItens = (saleId: string) => {
        const itens = data.itensPorVenda[saleId];
        if (!itens || itens.length === 0) return '<span style="color:#999">—</span>';
        return itens.map(i => i.description + (i.quantity > 1 ? ' (' + i.quantity + 'x)' : '')).join(', ');
      };

      const body = `
        ${getCabecalhoLoja(storeSettings)}
        <h3 style="text-align:center;text-transform:uppercase;margin:0 0 4px">Relatório Completo de Vendas</h3>
        <p style="text-align:center;font-size:11px;color:#666;margin:0 0 4px">${periodoTitulo()}</p>
        ${vendedorFiltro ? `<p style="text-align:center;font-size:11px;color:#666;margin:0 0 16px">Vendedor: ${vendedorFiltro}</p>` : '<div style="margin-bottom:16px"></div>'}

        <table>
          <tr><th>Data</th><th>Nº</th><th>Cliente</th><th>Itens</th><th>Vendedor</th><th>Forma Pagto.</th><th>Desconto</th><th>Total</th></tr>
          ${ordenada.map((v:any) => `<tr>
            <td>${new Date(v.created_at).toLocaleDateString('pt-BR')}</td>
            <td>#${String(v.sale_number).padStart(4,'0')}</td>
            <td>${v.customer_name||'—'}</td>
            <td style="font-size:11px">${fmtItens(v.id)}</td>
            <td>${v.vendedor||'—'}</td>
            <td>${(PAGAMENTO_LABELS[v.payment_method]||v.payment_method)}${v.installments>1?' '+v.installments+'x':''}</td>
            <td>${v.discount>0?formatBRL(v.discount):'—'}</td>
            <td><b>${formatBRL(v.total)}</b></td>
          </tr>`).join('')}
        </table>

        <div class="rel-kpis">
          <div class="rel-kpi"><div class="rel-kpi-label">Total de Vendas</div><div class="rel-kpi-val">${ordenada.length}</div></div>
          <div class="rel-kpi"><div class="rel-kpi-label">Desconto Total</div><div class="rel-kpi-val">${formatBRL(totalDesc)}</div></div>
          <div class="rel-kpi"><div class="rel-kpi-label">Total Líquido</div><div class="rel-kpi-val">${formatBRL(totalLista)}</div></div>
        </div>

        <p style="text-align:center;font-size:10px;color:#999;margin-top:24px">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
      `;

      abrirDocumentoImprimivel({
        title: 'Relatório Completo de Vendas',
        filename: `relatorio-completo-${from}-a-${to}.pdf`,
        css: printBaseStyle,
        body,
        windowFeatures: 'width=900,height=1000',
      });
    } finally {
      setGerandoRelatorio('');
    }
  };

  const gerarPorVendedor = async () => {
    setGerandoRelatorio('vendedor');
    try {
      const { from, to } = getRange();

      // Agrupa vendas por vendedor e, dentro de cada um, por forma de pagamento —
      // mesma estrutura do "Listagem de vendas por funcionário" do print de referencia.
      const grupos: Record<string, { total: number; num: number; pagamentos: Record<string, number> }> = {};
      data.vendasDetalhe.forEach((v: any) => {
        const key = v.vendedor || 'Não informado';
        if (!grupos[key]) grupos[key] = { total: 0, num: 0, pagamentos: {} };
        grupos[key].total += v.total;
        grupos[key].num += 1;
        grupos[key].pagamentos[v.payment_method] = (grupos[key].pagamentos[v.payment_method] || 0) + v.total;
      });
      const ordenado = Object.entries(grupos).sort((a, b) => b[1].total - a[1].total);

      const body = `
        ${getCabecalhoLoja(storeSettings)}
        <h3 style="text-align:center;text-transform:uppercase;margin:0 0 4px">Relatório Resumido por Vendedor</h3>
        <p style="text-align:center;font-size:11px;color:#666;margin:0 0 16px">${periodoTitulo()}</p>

        ${ordenado.map(([vend, g]) => `
          <div class="rel-secao" style="display:flex;justify-content:space-between;align-items:center">
            <span>${vend} — ${g.num} venda(s)</span>
            <span>${formatBRL(g.total)}</span>
          </div>
          <table><tr><th>Forma de Pagamento</th><th>Total</th><th>%</th></tr>
          ${Object.entries(g.pagamentos).sort((a,b)=>b[1]-a[1]).map(([met, val]) => `<tr><td>${PAGAMENTO_LABELS[met]||met}</td><td>${formatBRL(val)}</td><td>${((val/g.total)*100).toFixed(1)}%</td></tr>`).join('')}
          </table>
        `).join('')}

        <p style="text-align:center;font-size:10px;color:#999;margin-top:24px">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
      `;

      abrirDocumentoImprimivel({
        title: 'Relatório por Vendedor',
        filename: `relatorio-por-vendedor-${from}-a-${to}.pdf`,
        css: printBaseStyle,
        body,
        windowFeatures: 'width=800,height=960',
      });
    } finally {
      setGerandoRelatorio('');
    }
  };

  const BarRow = ({ label, value, max, color }: { label:string; value:number; max:number; color:string }) => (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
        <span>{label}</span>
        <strong style={{color}}>{formatBRL(value)}</strong>
      </div>
      <div style={{ height:8, borderRadius:4, background:'rgba(255,255,255,.08)' }}>
        <div style={{ height:'100%', borderRadius:4, width:Math.min(100, max>0?(value/max*100):0)+'%', background:color, transition:'width .5s' }}/>
      </div>
    </div>
  );

  const periodoLabel: Record<string,string> = { hoje:'Hoje', semana:'Últimos 7 dias', mes:'Este mês', ano:'Este ano', mesEspecifico:'Mês específico', custom:'Personalizado' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <BarChart3 size={22}/> Relatórios
          </h1>
          <p className="page-sub">Análise completa do desempenho da loja</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar CSV</button>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid rgba(255,255,255,.1)' }}>
        <button onClick={() => setAbaAtiva('resumo')} style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: abaAtiva === 'resumo' ? '#6366f1' : 'transparent', color: abaAtiva === 'resumo' ? 'white' : 'rgba(255,255,255,.5)', borderRadius: '6px 6px 0 0' }}>Resumo</button>
        <button onClick={() => setAbaAtiva('impressao')} style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: abaAtiva === 'impressao' ? '#6366f1' : 'transparent', color: abaAtiva === 'impressao' ? 'white' : 'rgba(255,255,255,.5)', borderRadius: '6px 6px 0 0' }}>Relatórios para Impressão</button>
        <button onClick={() => setAbaAtiva('baixas')} style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: abaAtiva === 'baixas' ? '#6366f1' : 'transparent', color: abaAtiva === 'baixas' ? 'white' : 'rgba(255,255,255,.5)', borderRadius: '6px 6px 0 0' }}>Baixas Crediario</button>
      </div>
      {abaAtiva === 'baixas' && (
        (user as any)?.role === 'master' || (user as any)?.role === 'Gerente' || (user as any)?.cargo === 'Gerente' ?
        <BaixasTab /> :
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <p>Acesso restrito a Gerentes e Administradores.</p>
        </div>
      )}
      {(abaAtiva === 'resumo' || abaAtiva === 'impressao') && (<>

      {/* Filtro de período */}
      <div style={{ display:'flex', gap:8, marginBottom:24, flexWrap:'wrap', alignItems:'center' }}>
        {['hoje','semana','mes','ano','mesEspecifico','custom'].map(p => (
          <button key={p} onClick={() => setPeriodo(p)}
            style={{ padding:'8px 16px', borderRadius:8, border:'2px solid',
              borderColor: periodo===p?'#6366f1':'rgba(255,255,255,.1)',
              background: periodo===p?'rgba(99,102,241,.15)':'none',
              color: periodo===p?'#6366f1':'var(--text-muted)',
              cursor:'pointer', fontSize:13, fontWeight:600 }}>
            {periodoLabel[p]}
          </button>
        ))}
        {periodo === 'mesEspecifico' && (
          <input className="form-input" type="month" style={{ width:170 }} value={mesEspecifico} onChange={e=>setMesEspecifico(e.target.value)}/>
        )}
        {periodo === 'custom' && (<>
          <input className="form-input" type="date" style={{ width:145 }} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
          <input className="form-input" type="date" style={{ width:145 }} value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
        </>)}
      </div>

      {abaAtiva === 'impressao' && (
        <div className="card" style={{ padding:24, marginBottom:24 }}>
          <h3 style={{ fontSize:15, fontWeight:700, marginBottom:6, display:'flex', alignItems:'center', gap:8 }}>
            <Printer size={16} style={{color:'#6366f1'}}/> Gerar Relatório
          </h3>
          <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>
            Escolha o período acima e o formato desejado. Cada relatório abre em uma nova aba com opção de Imprimir ou Baixar PDF.
          </p>

          <div style={{ marginBottom:18 }}>
            <label style={{ fontSize:12, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Filtrar por vendedor (opcional — vale só para o Relatório Completo)</label>
            <select className="form-input" style={{ width:280 }} value={vendedorFiltro} onChange={e=>setVendedorFiltro(e.target.value)}>
              <option value="">Todos os vendedores</option>
              {funcionarios.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
            </select>
          </div>

          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <button className="btn btn-primary" disabled={loading || !!gerandoRelatorio} onClick={gerarResumido}>
              <Printer size={15}/> {gerandoRelatorio==='resumido' ? 'Gerando...' : 'Relatório Resumido'}
            </button>
            <button className="btn btn-primary" disabled={loading || !!gerandoRelatorio} onClick={gerarCompleto}>
              <Printer size={15}/> {gerandoRelatorio==='completo' ? 'Gerando...' : 'Relatório Completo'}
            </button>
            <button className="btn btn-primary" disabled={loading || !!gerandoRelatorio} onClick={gerarPorVendedor}>
              <Printer size={15}/> {gerandoRelatorio==='vendedor' ? 'Gerando...' : 'Resumido por Vendedor'}
            </button>
          </div>
        </div>
      )}

      {abaAtiva === 'resumo' && (<>
      {loading ? <div className="empty-state"><p>Carregando...</p></div> : (<>

        {/* Cards principais */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
          {[
            { icon:<ShoppingCart size={20}/>, val:formatBRL(data.totalVendas), label:'Total de Vendas',   color:'#6366f1' },
            { icon:<TrendingUp size={20}/>,   val:data.numVendas,              label:'Nº de Vendas',     color:'#22c55e' },
            { icon:<DollarSign size={20}/>,   val:formatBRL(data.ticketMedio), label:'Ticket Médio',     color:'#06b6d4' },
            { icon:<CreditCard size={20}/>,   val:formatBRL(data.totalEntrada),label:'Total de Entradas',color:'#f59e0b' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:18, borderTop:'3px solid '+s.color }}>
              <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
              <div style={{ fontSize:typeof s.val==='number'?24:16, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Cards financeiro + clientes + OS */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
          <div className="card" style={{ padding:18, borderTop:'3px solid #22c55e' }}>
            <div style={{ color:'#22c55e', marginBottom:6 }}><TrendingUp size={20}/></div>
            <div style={{ fontSize:16, fontWeight:700, color:'#22c55e' }}>{formatBRL(data.receitaFinanceiro)}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Receitas Pagas</div>
          </div>
          <div className="card" style={{ padding:18, borderTop:'3px solid #f87171' }}>
            <div style={{ color:'#f87171', marginBottom:6 }}><TrendingDown size={20}/></div>
            <div style={{ fontSize:16, fontWeight:700, color:'#f87171' }}>{formatBRL(data.despesaFinanceiro)}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Despesas Pagas</div>
          </div>
          <div className="card" style={{ padding:18, borderTop:'3px solid '+(data.saldoFinanceiro>=0?'#6366f1':'#f87171') }}>
            <div style={{ color:data.saldoFinanceiro>=0?'#6366f1':'#f87171', marginBottom:6 }}><DollarSign size={20}/></div>
            <div style={{ fontSize:16, fontWeight:700, color:data.saldoFinanceiro>=0?'#6366f1':'#f87171' }}>{formatBRL(data.saldoFinanceiro)}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>Saldo Financeiro</div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>

          {/* Produtos mais vendidos */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <Package size={16} style={{color:'#6366f1'}}/> Produtos Mais Vendidos
            </h3>
            {data.produtosMaisVendidos.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-muted)', fontSize:14 }}>Nenhuma venda no período</div>
            ) : data.produtosMaisVendidos.map((p, i) => (
              <div key={p.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'rgba(99,102,241,.15)', color:'#6366f1', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>{i+1}</span>
                  <span style={{ fontSize:13 }}>{p.name}</span>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#6366f1' }}>{p.qty} un</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{formatBRL(p.total)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Vendas por forma de pagamento */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <CreditCard size={16} style={{color:'#22c55e'}}/> Vendas por Pagamento
            </h3>
            {data.vendasPorPagamento.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-muted)', fontSize:14 }}>Nenhuma venda no período</div>
            ) : (() => {
              const max = data.vendasPorPagamento[0]?.total || 1;
              const colors = ['#6366f1','#22c55e','#06b6d4','#f59e0b','#f87171','#a855f7'];
              return data.vendasPorPagamento.map((p, i) => (
                <BarRow key={p.method} label={PAGAMENTO_LABELS[p.method]||p.method} value={p.total} max={max} color={colors[i%colors.length]}/>
              ));
            })()}
          </div>

          {/* Vendas por vendedor */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <UserCheck size={16} style={{color:'#f59e0b'}}/> Vendas por Vendedor
            </h3>
            {data.vendasPorVendedor.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-muted)', fontSize:14 }}>Nenhuma venda no período</div>
            ) : data.vendasPorVendedor.map((v, i) => (
              <div key={v.vendedor} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#f59e0b,#f97316)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff' }}>
                    {v.vendedor.slice(0,1).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{v.vendedor}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>{v.num} venda(s)</div>
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#f59e0b' }}>{formatBRL(v.total)}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{data.totalVendas>0?((v.total/data.totalVendas)*100).toFixed(1):'0'}%</div>
                </div>
              </div>
            ))}
          </div>

          {/* OS por status */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
              <ClipboardList size={16} style={{color:'#06b6d4'}}/> Ordens de Serviço
            </h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(99,102,241,.08)', textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:'#6366f1' }}>{data.totalOS}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>Total de OS</div>
              </div>
              <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(34,197,94,.08)', textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:'#22c55e' }}>{data.osEntregues}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>Entregues</div>
              </div>
            </div>
            {data.osPorStatus.map(o => {
              const colors: Record<string,string> = { orcamento:'#94a3b8', confirmada:'#6366f1', lab:'#f59e0b', montagem:'#06b6d4', pronta:'#22c55e', entregue:'#a855f7', cancelada:'#f87171' };
              const labels: Record<string,string> = { orcamento:'Orçamento', confirmada:'Confirmada', lab:'No Lab', montagem:'Em Montagem', pronta:'Pronta', entregue:'Entregue', cancelada:'Cancelada' };
              const color = colors[o.status]||'#94a3b8';
              return (
                <div key={o.status} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                  <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:color, display:'inline-block' }}/>
                    {labels[o.status]||o.status}
                  </span>
                  <strong style={{color}}>{o.count}</strong>
                </div>
              );
            })}
          </div>

        </div>

        {/* Clientes */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
          {[
            { icon:<Users size={20}/>,   val:data.totalClientes, label:'Total de Clientes',    color:'#6366f1' },
            { icon:<Award size={20}/>,   val:data.clientesNovos, label:'Novos no Período',     color:'#22c55e' },
            { icon:<UserCheck size={20}/>,val:data.vendasPorVendedor.length, label:'Vendedores Ativos', color:'#f59e0b' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:18, borderTop:'3px solid '+s.color }}>
              <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
              <div style={{ fontSize:24, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

      </>)}
      </>)}
      </>)}
    </div>
  );
}

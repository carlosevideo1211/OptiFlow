import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  BarChart3, TrendingUp, TrendingDown, Users, ShoppingCart,
  CreditCard, Package, Eye, Download, Calendar
} from 'lucide-react';
import { formatBRL } from '../types/index';

export default function RelatoriosPage() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('mes');
  const [data, setData] = useState({
    totalVendas: 0, numVendas: 0, ticketMedio: 0,
    totalClientes: 0, clientesNovos: 0,
    totalOS: 0, osEntregues: 0,
    receitaFinanceiro: 0, despesaFinanceiro: 0,
    produtosMaisVendidos: [] as any[],
    vendasPorPagamento: [] as any[],
    osPorStatus: [] as any[],
  });

  useEffect(() => { if (tenantId) loadData(); }, [tenantId, periodo]);

  const getRange = () => {
    const hoje = new Date();
    if (periodo === 'hoje') {
      const d = hoje.toISOString().split('T')[0];
      return { from: d, to: d };
    }
    if (periodo === 'semana') {
      const from = new Date(hoje); from.setDate(hoje.getDate() - 7);
      return { from: from.toISOString().split('T')[0], to: hoje.toISOString().split('T')[0] };
    }
    if (periodo === 'mes') {
      return { from: hoje.toISOString().slice(0,8)+'01', to: hoje.toISOString().split('T')[0] };
    }
    if (periodo === 'ano') {
      return { from: hoje.getFullYear()+'-01-01', to: hoje.toISOString().split('T')[0] };
    }
    return { from: hoje.toISOString().slice(0,8)+'01', to: hoje.toISOString().split('T')[0] };
  };

  const loadData = async () => {
    setLoading(true);
    const { from, to } = getRange();

    const [
      { data: vendas },
      { data: clientes },
      { data: os },
      { data: financeiro },
      { data: saleItems },
    ] = await Promise.all([
      supabase.from('sales').select('*').eq('tenant_id', tenantId)
        .eq('status','concluida').gte('created_at', from).lte('created_at', to+'T23:59:59'),
      supabase.from('customers').select('created_at').eq('tenant_id', tenantId).eq('active', true),
      supabase.from('service_orders').select('status').eq('tenant_id', tenantId),
      supabase.from('financial_transactions').select('type,amount,status').eq('tenant_id', tenantId),
      supabase.from('sale_items').select('description,quantity,total').eq('tenant_id', tenantId),
    ]);

    const totalVendas = (vendas||[]).reduce((s,v)=>s+v.total,0);
    const numVendas   = (vendas||[]).length;
    const ticketMedio = numVendas > 0 ? totalVendas/numVendas : 0;
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
    const produtosMaisVendidos = Object.entries(prodMap)
      .map(([k,v])=>({name:k,...v})).sort((a,b)=>b.qty-a.qty).slice(0,8);

    const receitaFinanceiro = (financeiro||[]).filter(f=>f.type==='receita'&&f.status==='pago').reduce((s,f)=>s+f.amount,0);
    const despesaFinanceiro = (financeiro||[]).filter(f=>f.type==='despesa'&&f.status==='pago').reduce((s,f)=>s+f.amount,0);

    setData({
      totalVendas, numVendas, ticketMedio,
      totalClientes: (clientes||[]).length, clientesNovos,
      totalOS: (os||[]).length, osEntregues: (os||[]).filter(o=>o.status==='entregue').length,
      receitaFinanceiro, despesaFinanceiro,
      produtosMaisVendidos, vendasPorPagamento, osPorStatus,
    });
    setLoading(false);
  };

  const exportRelatorio = () => {
    const { from, to } = getRange();
    const lines = [
      'RELATÓRIO OPTIFLOW',
      'Período: '+from+' a '+to,
      '',
      'VENDAS',
      'Total de Vendas: '+formatBRL(data.totalVendas),
      'Número de Vendas: '+data.numVendas,
      'Tíquete Médio: '+formatBRL(data.ticketMedio),
      '',
      'CLIENTES',
      'Total Ativos: '+data.totalClientes,
      'Novos no Período: '+data.clientesNovos,
      '',
      'ORDENS DE SERVIÇO',
      'Total OS: '+data.totalOS,
      'Entregues: '+data.osEntregues,
      '',
      'FINANCEIRO',
      'Receitas: '+formatBRL(data.receitaFinanceiro),
      'Despesas: '+formatBRL(data.despesaFinanceiro),
      'Saldo: '+formatBRL(data.receitaFinanceiro - data.despesaFinanceiro),
    ];
    const blob = new Blob([lines.join('\n')], { type:'text/plain' });
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='relatorio-optiflow.txt'; a.click();
  };

  const STATUS_LABELS: Record<string,string> = {
    orcamento:'Orçamento', confirmada:'Confirmada', lab:'Laboratório',
    montagem:'Montagem', pronta:'Pronta', entregue:'Entregue', cancelada:'Cancelada'
  };
  const PAG_LABELS: Record<string,string> = {
    dinheiro:'Dinheiro', pix:'PIX', credito:'Crédito',
    debito:'Débito', crediario:'Crediário', transferencia:'Transferência'
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <BarChart3 size={22}/> Relatórios
          </h1>
          <p className="page-sub">Análise de desempenho do negócio</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportRelatorio}><Download size={15}/> Exportar</button>
        </div>
      </div>

      {/* Filtro período */}
      <div style={{ display:'flex', gap:8, marginBottom:24 }}>
        {[{v:'hoje',l:'Hoje'},{v:'semana',l:'7 dias'},{v:'mes',l:'Este mês'},{v:'ano',l:'Este ano'}].map(p => (
          <button key={p.v} onClick={()=>setPeriodo(p.v)}
            style={{ padding:'8px 18px', borderRadius:8, border:'2px solid',
              borderColor: periodo===p.v ? '#6366f1' : 'var(--border)',
              background: periodo===p.v ? 'rgba(99,102,241,.12)' : 'var(--bg-card)',
              color: periodo===p.v ? '#6366f1' : 'var(--text-muted)',
              cursor:'pointer', fontSize:13, fontWeight:600 }}>
            <Calendar size={13} style={{ marginRight:5, display:'inline' }}/>{p.l}
          </button>
        ))}
      </div>

      {loading ? <div className="empty-state"><p>Carregando relatório...</p></div> : (<>

        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
          {[
            { icon:<ShoppingCart size={22}/>, val:formatBRL(data.totalVendas), label:'Total Vendido', sub:data.numVendas+' vendas', color:'#6366f1' },
            { icon:<TrendingUp size={22}/>,   val:formatBRL(data.ticketMedio),  label:'Tíquete Médio', sub:'por venda', color:'#22c55e' },
            { icon:<Users size={22}/>,        val:data.totalClientes,           label:'Clientes Ativos', sub:data.clientesNovos+' novos no período', color:'#06b6d4' },
            { icon:<Eye size={22}/>,          val:data.osEntregues+'/'+data.totalOS, label:'OS Entregues', sub:'total de ordens', color:'#a855f7' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
              <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
              <div style={{ fontSize:typeof s.val==='number'?28:18, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:1 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, marginBottom:20 }}>

          {/* Financeiro */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              <TrendingUp size={16}/> Financeiro
            </h3>
            {[
              { label:'Receitas', val:data.receitaFinanceiro, color:'#22c55e' },
              { label:'Despesas', val:data.despesaFinanceiro, color:'#f87171' },
              { label:'Saldo',    val:data.receitaFinanceiro-data.despesaFinanceiro,
                color: data.receitaFinanceiro>=data.despesaFinanceiro?'#6366f1':'#f87171' },
            ].map(item => (
              <div key={item.label} style={{ display:'flex', justifyContent:'space-between',
                padding:'10px 0', borderBottom:'1px solid var(--border)', fontSize:14 }}>
                <span style={{ color:'var(--text-muted)' }}>{item.label}</span>
                <strong style={{ color:item.color }}>{formatBRL(item.val)}</strong>
              </div>
            ))}
          </div>

          {/* Vendas por pagamento */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              <CreditCard size={16}/> Vendas por Pagamento
            </h3>
            {data.vendasPorPagamento.length === 0 ? (
              <p style={{ color:'var(--text-muted)', fontSize:13 }}>Sem dados no período</p>
            ) : data.vendasPorPagamento.map(v => (
              <div key={v.method} style={{ display:'flex', justifyContent:'space-between',
                padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span>{PAG_LABELS[v.method]||v.method}</span>
                <strong style={{ color:'#6366f1' }}>{formatBRL(v.total)}</strong>
              </div>
            ))}
          </div>

          {/* OS por status */}
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              <Eye size={16}/> OS por Status
            </h3>
            {data.osPorStatus.length === 0 ? (
              <p style={{ color:'var(--text-muted)', fontSize:13 }}>Sem dados</p>
            ) : data.osPorStatus.map(o => (
              <div key={o.status} style={{ display:'flex', justifyContent:'space-between',
                padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span>{STATUS_LABELS[o.status]||o.status}</span>
                <strong style={{ color:'#6366f1' }}>{o.count}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Produtos mais vendidos */}
        <div className="card" style={{ padding:24 }}>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
            <Package size={16}/> Produtos Mais Vendidos
          </h3>
          {data.produtosMaisVendidos.length === 0 ? (
            <p style={{ color:'var(--text-muted)', fontSize:13 }}>Sem vendas no período</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Produto</th><th>Qtd Vendida</th><th>Total</th><th>Participação</th></tr></thead>
                <tbody>
                  {data.produtosMaisVendidos.map((p,i) => {
                    const pct = data.totalVendas > 0 ? (p.total/data.totalVendas*100).toFixed(1) : '0';
                    return (
                      <tr key={p.name}>
                        <td style={{ fontWeight:700, color:'#6366f1' }}>{i+1}º</td>
                        <td style={{ fontWeight:500 }}>{p.name}</td>
                        <td>{p.qty} un</td>
                        <td style={{ fontWeight:600 }}>{formatBRL(p.total)}</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ flex:1, height:6, borderRadius:3, background:'rgba(255,255,255,.08)' }}>
                              <div style={{ height:'100%', borderRadius:3, width:pct+'%', background:'#6366f1' }}/>
                            </div>
                            <span style={{ fontSize:12, color:'var(--text-muted)', minWidth:36 }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}
    </div>
  );
}

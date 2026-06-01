import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatBRL } from '../types/index';
import { Users, ClipboardList, ShoppingCart, CreditCard, TrendingUp, AlertTriangle, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MonthPoint { label: string; total: number; key: string; }

export default function DashboardPage() {
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState(localStorage.getItem('new_store_name') || (user as any)?.store_name || '');
  const [stats, setStats] = useState({
    clientes: 0, os_abertas: 0, vendas_hoje: 0, crediario_vencido: 0,
    consultas_hoje: 0, produtos_baixo: 0, receita_mes: 0
  });
  const [osRecentes, setOsRecentes] = useState<any[]>([]);
  const [monthPoints, setMonthPoints] = useState<MonthPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  useEffect(() => {
    if (!tenantId) return;
    loadStats();
  }, [tenantId]);

  const loadStats = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    // Últimos 12 meses
    const months: MonthPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      months.push({ label, key, total: 0 });
    }

    const [clients, os, sales, crediario, consultas, produtos, receita, osRec, storeData, salesHistory] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('active', true),
      supabase.from('service_orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['aprovada', 'em_producao']),
      supabase.from('sales').select('total').eq('tenant_id', tenantId).eq('status', 'concluida').gte('created_at', today),
      supabase.from('crediario_parcelas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'vencida'),
      supabase.from('consultations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('date', today),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('active', true).lt('stock', 5),
      supabase.from('sales').select('total').eq('tenant_id', tenantId).eq('status', 'concluida').gte('created_at', monthStart),
      supabase.from('service_orders').select('id, os_number, customer_name, status, delivery_date').eq('tenant_id', tenantId).in('status', ['aprovada', 'em_producao', 'pronta']).order('created_at', { ascending: false }).limit(5),
      supabase.from('store_settings').select('name').eq('tenant_id', tenantId).single(),
      supabase.from('sales').select('total, created_at').eq('tenant_id', tenantId).eq('status', 'concluida').gte('created_at', months[0].key + '-01').order('created_at', { ascending: true }),
    ]);

    const vendasHoje = (sales.data ?? []).reduce((s: number, v: any) => s + (v.total || 0), 0);
    const receitaMes = (receita.data ?? []).reduce((s: number, v: any) => s + (v.total || 0), 0);

    if (storeData.data?.name) {
      setStoreName(storeData.data.name);
      localStorage.removeItem('new_store_name');
    } else if (localStorage.getItem('new_store_name')) {
      setStoreName(localStorage.getItem('new_store_name')!);
    }

    // Montar gráfico
    const salesByMonth: Record<string, number> = {};
    (salesHistory.data ?? []).forEach((s: any) => {
      const key = s.created_at.slice(0, 7);
      salesByMonth[key] = (salesByMonth[key] || 0) + (s.total || 0);
    });
    const points = months.map(m => ({ ...m, total: salesByMonth[m.key] || 0 }));
    setMonthPoints(points);

    setStats({
      clientes: clients.count || 0,
      os_abertas: os.count || 0,
      vendas_hoje: vendasHoje,
      crediario_vencido: crediario.count || 0,
      consultas_hoje: consultas.count || 0,
      produtos_baixo: produtos.count || 0,
      receita_mes: receitaMes,
    });
    setOsRecentes(osRec.data || []);
    setLoading(false);
  };

  const OS_STATUS: Record<string, { label: string; color: string }> = {
    orcamento:   { label: 'Orçamento',   color: '#94a3b8' },
    aprovada:    { label: 'Aprovada',    color: '#6366f1' },
    em_producao: { label: 'Em Produção', color: '#f59e0b' },
    pronta:      { label: 'Pronta',      color: '#22c55e' },
    entregue:    { label: 'Entregue',    color: '#a855f7' },
    cancelada:   { label: 'Cancelada',   color: '#f87171' },
  };

  // Gráfico SVG
  const maxVal = Math.max(...monthPoints.map(m => m.total), 1);
  const chartH = 120;
  const chartW = 680;
  const barW = Math.floor(chartW / monthPoints.length) - 6;

  return (
    <div>
      {/* Header boas-vindas */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          {greeting}, {storeName || 'usuário'}! 👋
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
          Visão geral do negócio em tempo real
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { icon: <ShoppingCart size={20}/>, label: 'Receita Hoje',    val: formatBRL(stats.vendas_hoje),  color: '#22c55e' },
          { icon: <TrendingUp size={20}/>,   label: 'Receita do Mês',  val: formatBRL(stats.receita_mes),  color: '#6366f1' },
          { icon: <Users size={20}/>,        label: 'Clientes',        val: stats.clientes,                color: '#06b6d4' },
          { icon: <ClipboardList size={20}/>,label: 'OS Ativas',       val: stats.os_abertas,              color: '#f59e0b' },
        ].map((k, i) => (
          <div key={i} className="card" style={{ padding: 18, borderTop: '3px solid ' + k.color }}>
            <div style={{ color: k.color, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: typeof k.val === 'number' ? 28 : 18, fontWeight: 700, color: k.color }}>{k.val}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 20 }}>

        {/* Gráfico de vendas */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} style={{ color: '#6366f1' }}/> Faturamento — Últimos 12 Meses
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Receita acumulada por mês</p>

          {loading ? (
            <div style={{ height: chartH + 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Carregando...
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <svg width="100%" viewBox={`0 0 ${chartW} ${chartH + 50}`} style={{ minWidth: 400 }}>
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                  <line key={i}
                    x1={0} y1={chartH - pct * chartH}
                    x2={chartW} y2={chartH - pct * chartH}
                    stroke="rgba(255,255,255,.06)" strokeWidth={1}/>
                ))}
                {/* Bars */}
                {monthPoints.map((m, i) => {
                  const x = i * (chartW / monthPoints.length) + 3;
                  const barH = maxVal > 0 ? (m.total / maxVal) * chartH : 0;
                  const y = chartH - barH;
                  const isCurrentMonth = m.key === new Date().toISOString().slice(0, 7);
                  return (
                    <g key={m.key}>
                      <rect x={x} y={y} width={barW} height={barH}
                        rx={4}
                        fill={isCurrentMonth ? 'url(#barGradCurrent)' : 'url(#barGrad)'}
                        opacity={0.9}/>
                      {m.total > 0 && barH > 20 && (
                        <text x={x + barW / 2} y={y + 14} textAnchor="middle"
                          fontSize={9} fill="rgba(255,255,255,.7)" fontWeight={600}>
                          {m.total >= 1000 ? (m.total / 1000).toFixed(1) + 'k' : m.total.toFixed(0)}
                        </text>
                      )}
                      <text x={x + barW / 2} y={chartH + 16} textAnchor="middle"
                        fontSize={10} fill={isCurrentMonth ? '#6366f1' : 'rgba(255,255,255,.4)'}
                        fontWeight={isCurrentMonth ? 700 : 400}>
                        {m.label}
                      </text>
                    </g>
                  );
                })}
                {/* Total do mês atual */}
                {monthPoints.length > 0 && (
                  <text x={chartW - 4} y={14} textAnchor="end" fontSize={11}
                    fill="#22c55e" fontWeight={700}>
                    {formatBRL(monthPoints[monthPoints.length - 1]?.total || 0)} este mês
                  </text>
                )}
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9}/>
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.7}/>
                  </linearGradient>
                  <linearGradient id="barGradCurrent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.95}/>
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
          )}
        </div>

        {/* OS Recentes */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={16} style={{ color: '#f59e0b' }}/> Pipeline de OS
          </h3>
          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</p>
          ) : osRecentes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma OS ativa.</p>
          ) : osRecentes.map(os => {
            const st = OS_STATUS[os.status] || OS_STATUS.aprovada;
            return (
              <div key={os.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => navigate('/os')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>#{os.os_number} — {os.customer_name}</div>
                    {os.delivery_date && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Entrega: {new Date(os.delivery_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                    background: st.color + '22', color: st.color }}>
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })}
          <button className="btn btn-primary" onClick={() => navigate('/os')}
            style={{ marginTop: 16, width: '100%', fontSize: 13 }}>
            Ver todas as OS
          </button>
        </div>
      </div>

      {/* Cards adicionais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {[
          { icon: <CreditCard size={20}/>,    label: 'Parcelas Vencidas', val: stats.crediario_vencido, color: '#f87171', path: '/crediario'  },
          { icon: <Package size={20}/>,       label: 'Estoque Baixo',     val: stats.produtos_baixo,   color: '#f59e0b', path: '/estoque'    },
          { icon: <AlertTriangle size={20}/>, label: 'Consultas Hoje',    val: stats.consultas_hoje,   color: '#06b6d4', path: '/consulta'   },
        ].map((k, i) => (
          <div key={i} className="card" style={{ padding: 18, borderTop: '3px solid ' + k.color, cursor: 'pointer' }}
            onClick={() => navigate(k.path)}>
            <div style={{ color: k.color, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.color }}>{k.val}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

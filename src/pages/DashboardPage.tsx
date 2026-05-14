import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatBRL } from '../types/index';
import { Users, ClipboardList, ShoppingCart, CreditCard, Eye, Package, TrendingUp, AlertTriangle, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ clientes:0, os_abertas:0, vendas_hoje:0, crediario_vencido:0, consultas_hoje:0, produtos_baixo:0, receita_mes:0 });
  const [osRecentes, setOsRecentes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = user?.full_name?.split(' ')[0] ?? 'usuário';
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

    const [clients, os, sales, crediario, consultas, produtos, receita, osRec] = await Promise.all([
      supabase.from('customers').select('id', { count:'exact', head:true }).eq('tenant_id', tenantId).eq('active', true),
      supabase.from('service_orders').select('id', { count:'exact', head:true }).eq('tenant_id', tenantId).in('status', ['aprovada','em_producao']),
      supabase.from('sales').select('total').eq('tenant_id', tenantId).eq('status','concluida').gte('created_at', today),
      supabase.from('crediario_parcelas').select('id', { count:'exact', head:true }).eq('tenant_id', tenantId).eq('status','vencida'),
      supabase.from('consultations').select('id', { count:'exact', head:true }).eq('tenant_id', tenantId).eq('date', today),
      supabase.from('products').select('id', { count:'exact', head:true }).eq('tenant_id', tenantId).eq('active', true).lt('stock', 5),
      supabase.from('sales').select('total').eq('tenant_id', tenantId).eq('status','concluida').gte('created_at', monthStart),
      supabase.from('service_orders').select('id, os_number, customer_name, status, delivery_date').eq('tenant_id', tenantId).in('status',['aprovada','em_producao','pronta']).order('created_at', { ascending:false }).limit(5),
    ]);

    const vendasHoje = (sales.data ?? []).reduce((s: number, v: any) => s + (v.total || 0), 0);
    const receitaMes = (receita.data ?? []).reduce((s: number, v: any) => s + (v.total || 0), 0);

    setStats({
      clientes: clients.count ?? 0,
      os_abertas: os.count ?? 0,
      vendas_hoje: vendasHoje,
      crediario_vencido: crediario.count ?? 0,
      consultas_hoje: consultas.count ?? 0,
      produtos_baixo: produtos.count ?? 0,
      receita_mes: receitaMes,
    });
    setOsRecentes(osRec.data ?? []);
    setLoading(false);
  };

  const osStatusColor: Record<string,string> = {
    aprovada:'var(--info)', em_producao:'var(--warning)', pronta:'var(--success)', entregue:'var(--accent)'
  };
  const osStatusLabel: Record<string,string> = {
    aprovada:'Aprovada', em_producao:'Em Produção', pronta:'✅ Pronta', entregue:'Entregue'
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ fontSize:13, color:'var(--text2)', marginBottom:4 }}>{greeting}, {firstName} 👋</div>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/consulta')}><Eye size={14} /> Nova Consulta</button>
          <button className="btn btn-primary" onClick={() => navigate('/os')}><Plus size={14} /> Nova OS</button>
        </div>
      </div>

      {/* Balance Hero */}
      <div className="balance-hero">
        <div className="balance-greeting">{new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })}</div>
        <div className="balance-title">Resumo financeiro</div>
        <div className="balance-row">
          <div className="balance-item">
            <div className="balance-item-label">Receita do mês</div>
            <div className="balance-item-value">{formatBRL(stats.receita_mes)}</div>
          </div>
          <div className="balance-item">
            <div className="balance-item-label">Vendas hoje</div>
            <div className="balance-item-value">{formatBRL(stats.vendas_hoje)}</div>
          </div>
          <div className="balance-item">
            <div className="balance-item-label">OS em aberto</div>
            <div className="balance-item-value">{stats.os_abertas}</div>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {(stats.crediario_vencido > 0 || stats.produtos_baixo > 0) && (
        <div style={{ marginBottom:20 }}>
          {stats.crediario_vencido > 0 && (
            <div className="alert alert-warning" style={{ cursor:'pointer' }} onClick={() => navigate('/crediario')}>
              <AlertTriangle size={16} style={{ flexShrink:0 }} />
              <span><strong>{stats.crediario_vencido} parcela(s) de crediário vencida(s)</strong> — Clique para ver</span>
            </div>
          )}
          {stats.produtos_baixo > 0 && (
            <div className="alert alert-danger" style={{ cursor:'pointer' }} onClick={() => navigate('/estoque')}>
              <AlertTriangle size={16} style={{ flexShrink:0 }} />
              <span><strong>{stats.produtos_baixo} produto(s) com estoque baixo</strong> — Clique para ver</span>
            </div>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:14, marginBottom:24 }}>
        {[
          { label:'Clientes', value:stats.clientes, icon:Users, color:'primary', onClick:() => navigate('/clientes') },
          { label:'Consultas hoje', value:stats.consultas_hoje, icon:Eye, color:'accent', onClick:() => navigate('/consulta') },
          { label:'OS em produção', value:stats.os_abertas, icon:ClipboardList, color:'warning', onClick:() => navigate('/os') },
          { label:'Vendas hoje', value:formatBRL(stats.vendas_hoje), icon:ShoppingCart, color:'success', onClick:() => navigate('/vendas') },
          { label:'Crediário vencido', value:stats.crediario_vencido, icon:CreditCard, color:'danger', onClick:() => navigate('/crediario') },
          { label:'Estoque baixo', value:stats.produtos_baixo, icon:Package, color:'info', onClick:() => navigate('/estoque') },
        ].map(({ label, value, icon:Icon, color, onClick }) => (
          <div key={label} className={`stat-card ${color}`} style={{ cursor:'pointer' }} onClick={onClick}>
            <div className="stat-icon" style={{ background:`rgba(var(--${color}-rgb, 99,102,241),0.1)` }}>
              <Icon size={18} style={{ color:`var(--${color})` }} />
            </div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* OS Recentes */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div className="card-title" style={{ margin:0 }}>Ordens de Serviço em andamento</div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/os')}>Ver todas →</button>
        </div>
        {osRecentes.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Nº OS</th><th>Cliente</th><th>Status</th><th>Entrega</th>
              </tr></thead>
              <tbody>
                {osRecentes.map(os => (
                  <tr key={os.id} style={{ cursor:'pointer' }} onClick={() => navigate('/os')}>
                    <td><strong>#{os.os_number ?? '—'}</strong></td>
                    <td>{os.customer_name}</td>
                    <td><span className="badge" style={{ background:`${osStatusColor[os.status]}20`, color:osStatusColor[os.status] }}>{osStatusLabel[os.status] ?? os.status}</span></td>
                    <td style={{ color:'var(--text2)' }}>{os.delivery_date ? new Date(os.delivery_date+'T12:00').toLocaleDateString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding:'24px 0' }}>
            <p>Nenhuma OS em andamento</p>
          </div>
        )}
      </div>
    </div>
  );
}

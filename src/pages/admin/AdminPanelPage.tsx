import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { formatBRL } from '../../types/index';
import { fmtDate, diasRestantes, pagoAteLabel } from '../../utils/adminDates';
import {
  LogOut, RefreshCw, Search, Users, TrendingUp, Shield,
  AlertTriangle, DollarSign, X, Save, Edit2, CheckCircle,
  XCircle, Clock, Ban, Calendar, Plus, Download, Bell,
  Activity, BarChart2, ChevronUp, ChevronDown, ExternalLink, RotateCcw, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

type Plan = 'trial' | 'basico' | 'profissional' | 'clinica' | 'lancamento' | 'cancelado';

interface Tenant {
  id: string;
  company_name: string;
  email: string;
  phone?: string;
  plan: Plan;
  status: string;
  trial_end_date?: string;
  next_billing?: string;
  mrr_value?: number;
  city?: string;
  state?: string;
  created_at: string;
  boleto_habilitado?: boolean;
  // Guarda o valor anterior de next_billing logo antes da ultima confirmacao
  // de pagamento manual — mantido por compatibilidade com tenants que so
  // tem esse campo preenchido (de antes do historico existir). Fica
  // null/undefined quando nao ha nada para desfazer.
  next_billing_anterior?: string | null;
  // Pilha com TODOS os valores anteriores de next_billing, na ordem em que
  // foram substituidos (o mais recente por ultimo). Pedido pelo Carlos
  // (01/09/2026) pra "Desfazer" nao ficar limitado a so 1 passo — se ele
  // confirmar 2 pagamentos errados seguidos, da pra desfazer os 2, um de
  // cada vez. Cada confirmar/corrigir empilha (push); cada desfazer
  // desempilha (pop).
  next_billing_historico?: string[] | null;
  // Quando preenchido, o tenant foi movido pra Lixeira (nao aparece mais no
  // Painel nem na tela de Trials Vencidos) mas continua no banco, podendo
  // ser restaurado. Pedido pelo Carlos (01/09/2026) pra excluir deixar de
  // ser uma acao sem volta.
  excluido_em?: string | null;
}

const PLANS: Plan[] = ['trial','basico','profissional','clinica','lancamento','cancelado'];
const PLAN_LABELS: Record<Plan,string> = {
  trial:'Trial', basico:'Basico', profissional:'Pro',
  clinica:'Premium', lancamento:'Lancamento', cancelado:'Cancelado'
};
const PLAN_PRICES: Record<Plan,number> = {
  trial:0, basico:97, profissional:147, clinica:197, lancamento:110, cancelado:0
};
const STATUS_LIST = [
  { value:'trial',        label:'Trial',        color:'#f59e0b', bg:'rgba(245,158,11,.15)' },
  { value:'ativo',        label:'Ativo',         color:'#22c55e', bg:'rgba(34,197,94,.15)'  },
  { value:'inadimplente', label:'Inadimplente',  color:'#f87171', bg:'rgba(248,113,113,.15)'},
  { value:'bloqueado',    label:'Bloqueado',     color:'#94a3b8', bg:'rgba(148,163,184,.15)'},
  { value:'cancelado',    label:'Cancelado',     color:'#475569', bg:'rgba(71,85,105,.15)'  },
];
function getStatus(v: string) { return STATUS_LIST.find(s=>s.value===v)||STATUS_LIST[0]; }

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value/max)*100) : 0;
  return (
    <div style={{ height:4, background:'rgba(255,255,255,.1)', borderRadius:2, marginTop:4 }}>
      <div style={{ width:pct+'%', height:'100%', background:color, borderRadius:2, transition:'width .3s' }}/>
    </div>
  );
}

export default function AdminPanelPage() {
  const acessarLoja = (tenantId: string) => {
    localStorage.setItem('admin_viewing_tenant', tenantId);
    window.location.href = '/dashboard';
  };
  const navigate = useNavigate();
  const [tenants, setTenants]   = useState<Tenant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [planFilter, setPlanFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [updating, setUpdating] = useState<string|null>(null);
  const [editing, setEditing]   = useState<Tenant|null>(null);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('desc');
  const [showAlerts, setShowAlerts] = useState(false);
  const [form, setForm] = useState<Partial<Tenant>>({});
  const [showModal, setShowModal] = useState(false);
  // Id do tenant cujo seletor de "quantos meses foram pagos" esta aberto na
  // coluna de vencimento — pedido pelo Carlos (01/09/2026) pra quem esta
  // varios meses atrasado e paga tudo de uma vez (o botao unico so cobria 1 mes).
  const [mesesAberto, setMesesAberto] = useState<string|null>(null);
  // Paginacao da tabela principal — pedido pelo Carlos (01/09/2026) pra
  // tabela nao ficar pesada de renderizar conforme a base de tenants cresce.
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  // Quantos tenants estao na Lixeira agora — so pro numero do botao no
  // topo, carregado a parte pra nao precisar trazer os excluidos junto
  // com a lista principal.
  const [lixeiraCount, setLixeiraCount] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => {
      if (!session) navigate('/admin-login');
      else { load(); carregarLixeiraCount(); }
    });
  }, []);

  // Volta pra pagina 1 sempre que o filtro/busca muda, senao o admin pode
  // ficar "preso" numa pagina 3 que nao existe mais no resultado filtrado.
  useEffect(() => { setPage(1); }, [search, planFilter, statusFilter]);

  const load = async () => {
    setLoading(true);
    // So carrega quem nao esta na lixeira. Se a coluna excluido_em ainda
    // nao existir no banco (falta rodar o ALTER TABLE), cai pra carregar
    // todo mundo, do jeito que era antes da Lixeira existir.
    let { data, error } = await supabase.from('tenants').select('*').is('excluido_em', null).order('created_at', { ascending:false });
    if (error) {
      const retry = await supabase.from('tenants').select('*').order('created_at', { ascending:false });
      data = retry.data;
    }
    setTenants((data as Tenant[]) ?? []);
    setLoading(false);
  };

  const carregarLixeiraCount = async () => {
    const { count, error } = await supabase.from('tenants').select('id', { count:'exact', head:true }).not('excluido_em', 'is', null);
    if (!error) setLixeiraCount(count || 0);
  };

  const hoje = new Date().toISOString().split('T')[0];
  const mesAtual = new Date().toISOString().slice(0,7);

  // Stats
  const stats = useMemo(() => {
    const ativos    = tenants.filter(t=>t.status==='ativo');
    const trials    = tenants.filter(t=>t.status==='trial');
    const novosmes  = tenants.filter(t=>t.created_at?.startsWith(mesAtual));
    const expirando = trials.filter(t=>{ const d=diasRestantes(t.trial_end_date); return d!==null && d<=7 && d>=0; });
    const expirados = trials.filter(t=>{ const d=diasRestantes(t.trial_end_date); return d!==null && d<0; });
    const mrr       = ativos.reduce((s,t)=>s+(t.mrr_value||0),0);
    const mrrTotal  = tenants.reduce((s,t)=>s+(t.mrr_value||0),0);
    const conversao = tenants.length > 0 ? Math.round((ativos.length/tenants.length)*100) : 0;
    return { total:tenants.length, ativos:ativos.length, trial:trials.length,
      inadimp:tenants.filter(t=>t.status==='inadimplente').length,
      mrr, mrrTotal, novosmes:novosmes.length, expirando:expirando.length,
      expirados:expirados.length, conversao };
  }, [tenants]);

  // Grafico de crescimento por mes (ultimos 6 meses)
  const crescimento = useMemo(() => {
    const meses: {label:string; total:number}[] = [];
    for (let i=5; i>=0; i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i);
      const key = d.toISOString().slice(0,7);
      const label = d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
      const total = tenants.filter(t=>t.created_at?.startsWith(key)).length;
      meses.push({label, total});
    }
    return meses;
  }, [tenants]);

  const maxCres = Math.max(...crescimento.map(m=>m.total), 1);

  const filtered = useMemo(() => {
    // Esconde trials ja vencidos da tabela principal — pedido pelo Carlos
    // (01/09/2026) pra deixar aqui so os ativos e os que ainda estao dentro
    // do prazo de teste. Os trials vencidos ficam disponiveis na tela
    // "Trials Vencidos" (/admin/trials-vencidos), sem serem excluidos do banco.
    let list = tenants.filter(t => {
      if (t.status !== 'trial') return true;
      const d = diasRestantes(t.trial_end_date);
      return d === null || d >= 0;
    });
    if (planFilter)    list = list.filter(t=>t.plan===planFilter);
    if (statusFilter)  list = list.filter(t=>t.status===statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(t => t.company_name?.toLowerCase().includes(s) || t.email?.toLowerCase().includes(s) || t.city?.toLowerCase().includes(s));
    }
    list = [...list].sort((a:any,b:any) => {
      const va = a[sortField]||''; const vb = b[sortField]||'';
      return sortDir==='asc' ? (va>vb?1:-1) : (va<vb?1:-1);
    });
    return list;
  }, [tenants, search, planFilter, statusFilter, sortField, sortDir]);

  const mrrFiltrado = filtered.filter(t=>t.status==='ativo').reduce((s,t)=>s+(t.mrr_value||0),0);

  // Fatia da lista filtrada que realmente aparece na tela, pra tabela nao
  // renderizar todos os tenants de uma vez so. Se o filtro mudar e a pagina
  // atual ficar "fora" do total (ex: tava na pagina 3 e o filtro so tem 1
  // pagina agora), volta pra ultima pagina valida em vez de mostrar vazio.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginaAtual = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (paginaAtual - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, paginaAtual]);

  const alertas = tenants.filter(t => {
    if (t.status !== 'trial') return false;
    const d = diasRestantes(t.trial_end_date);
    // So trials que ainda nao venceram (os ja vencidos foram pra tela
    // "Trials Vencidos" — nao faz mais sentido alertar sobre eles aqui).
    return d !== null && d >= 0 && d <= 5;
  }).sort((a,b) => (diasRestantes(a.trial_end_date)||0) - (diasRestantes(b.trial_end_date)||0));

  // Clientes ativos (pagamento manual via Pix) cujo ciclo de 30 dias esta vencendo
  // ou ja venceu — o campo next_billing e gravado automaticamente quando o Carlos
  // ativa um tenant manualmente, mas antes nada usava esse dado para avisar.
  const alertasVencimento = tenants.filter(t => {
    if (t.status !== 'ativo') return false;
    const d = diasRestantes(t.next_billing);
    return d !== null && d <= 5;
  }).sort((a,b) => (diasRestantes(a.next_billing)||0) - (diasRestantes(b.next_billing)||0));

  const PLAN_PRICES_MAP: Record<string,number> = {
    trial:0, basico:97, profissional:147, clinica:197, lancamento:110, cancelado:0
  };
  const updateField = async (id: string, field: string, value: any) => {
    setUpdating(id);
    const updates: any = { [field]: value };

    // Ao mudar plano para um plano pago, ativa o status automaticamente
    if (field === 'plan') {
      updates.mrr_value = PLAN_PRICES_MAP[value] || 0;
      if (value !== 'trial' && value !== 'cancelado') {
        updates.status = 'ativo';
        const nb = new Date(); nb.setDate(nb.getDate()+30);
        updates.next_billing = nb.toISOString().split('T')[0];
      }
      if (value === 'cancelado') updates.status = 'cancelado';
    }

    // Ao ativar o status manualmente, garante que o plano nao fica preso em "trial"
    if (field === 'status' && value === 'ativo') {
      const tenantAtual = tenants.find(t => t.id === id);
      const nb = new Date(); nb.setDate(nb.getDate()+30);
      updates.next_billing = nb.toISOString().split('T')[0];
      if (tenantAtual && tenantAtual.plan === 'trial') {
        toast.error('Selecione o plano pago antes de ativar (o campo Plano ainda esta em "Trial").', { duration: 5000 });
        setUpdating(null);
        return;
      }
    }

    await supabase.from('tenants').update(updates).eq('id', id);
    setTenants(prev => prev.map(t => t.id===id ? {...t, ...updates} : t));
    setUpdating(null);
    toast.success('Atualizado!');
  };

  const estenderTrial = async (t: Tenant, dias: number) => {
    const base = t.trial_end_date ? new Date(t.trial_end_date+'T00:00:00') : new Date();
    base.setDate(base.getDate()+dias);
    const nova = base.toISOString().split('T')[0];
    await updateField(t.id, 'trial_end_date', nova);
  };

  // Grava um novo next_billing e EMPILHA o valor anterior em
  // next_billing_historico (pilha completa, nao so 1 passo — pedido pelo
  // Carlos, 01/09/2026, pra poder desfazer mais de uma confirmacao errada
  // seguida). Tambem mantem next_billing_anterior em sincronia (topo da
  // pilha) por compatibilidade. Se as colunas novas ainda nao existirem no
  // banco (falta rodar o ALTER TABLE), degrada em cascata ate salvar pelo
  // menos o next_billing — a acao principal nunca fica bloqueada por isso,
  // so o alcance do "Desfazer" fica menor.
  const salvarVencimento = async (t: Tenant, novoNextBilling: string, anteriorParaSalvar: string | null): Promise<boolean> => {
    setUpdating(t.id);
    const novoHistorico = anteriorParaSalvar ? [...(t.next_billing_historico||[]), anteriorParaSalvar] : (t.next_billing_historico||[]);
    let { error } = await supabase.from('tenants').update({
      next_billing: novoNextBilling,
      next_billing_anterior: anteriorParaSalvar,
      next_billing_historico: novoHistorico,
    }).eq('id', t.id);
    let historicoSalvo = novoHistorico;
    let anteriorSalvo: string | null = anteriorParaSalvar;
    if (error && /next_billing_historico/i.test(error.message || '')) {
      const retry1 = await supabase.from('tenants').update({ next_billing: novoNextBilling, next_billing_anterior: anteriorParaSalvar }).eq('id', t.id);
      error = retry1.error;
      historicoSalvo = t.next_billing_historico || [];
      if (error && /next_billing_anterior/i.test(error.message || '')) {
        const retry2 = await supabase.from('tenants').update({ next_billing: novoNextBilling }).eq('id', t.id);
        error = retry2.error;
        anteriorSalvo = null;
      }
    }
    setUpdating(null);
    if (error) { toast.error('Erro ao salvar vencimento: '+error.message); return false; }
    setTenants(prev => prev.map(x => x.id===t.id ? {...x, next_billing:novoNextBilling, next_billing_anterior:anteriorSalvo, next_billing_historico:historicoSalvo} : x));
    return true;
  };

  // Confirma que o(s) Pix manual(is) foi(ram) recebido(s) e conferido(s).
  // Base do calculo (revisado 01/09/2026 a pedido do Carlos, pra parar de
  // "pular" mes sem necessidade): se o inquilino ja esta com o vencimento em
  // dia (next_billing no futuro), os meses confirmados agora somam a partir
  // dessa data (nao reinicia do zero); se esta vencido ou nunca teve
  // cobranca, conta a partir de hoje. Antes de gravar, empilha o next_billing
  // antigo pra permitir "Desfazer" caso o admin confirme um numero errado
  // de meses (foi o que aconteceu com a Otica do Povo e a Otica Evangelista
  // Altazes).
  const confirmarPagamentoManual = async (t: Tenant, meses: number = 1) => {
    const label = meses === 1 ? '1 mes' : meses + ' meses';
    if (!confirm('Confirmar pagamento de ' + label + ' de ' + t.company_name + ' e liberar o acesso?')) return;
    const hoje = new Date();
    const vencimentoAtual = t.next_billing ? new Date(t.next_billing+'T00:00:00') : null;
    const base = (vencimentoAtual && vencimentoAtual > hoje) ? vencimentoAtual : hoje;
    const nb = new Date(base); nb.setDate(nb.getDate() + meses*30);
    const novoNextBilling = nb.toISOString().split('T')[0];
    const ok = await salvarVencimento(t, novoNextBilling, t.next_billing || null);
    if (!ok) return;
    toast.success('Pagamento confirmado! Pago ate '+pagoAteLabel(novoNextBilling)+'.');
    setMesesAberto(null);
  };

  // Desfaz a ULTIMA acao ainda nao desfeita (confirmar ou corrigir), uma de
  // cada vez, desempilhando next_billing_historico — clicar de novo desfaz
  // a acao anterior a essa, e assim por diante ate a pilha esvaziar.
  // Tenants que so tem o next_billing_anterior antigo (de antes da pilha
  // existir, sem historico) ainda conseguem desfazer 1 passo por
  // compatibilidade.
  const desfazerPagamento = async (t: Tenant) => {
    const hist = t.next_billing_historico || [];
    const valorAnterior = hist.length > 0 ? hist[hist.length-1] : (t.next_billing_anterior || null);
    if (!valorAnterior) return;
    if (!confirm('Desfazer o ultimo pagamento confirmado de ' + t.company_name + '? O vencimento volta para ' + fmtDate(valorAnterior) + '.')) return;
    const novoHistorico = hist.length > 0 ? hist.slice(0, -1) : [];
    const novoAnterior = novoHistorico.length > 0 ? novoHistorico[novoHistorico.length-1] : null;
    setUpdating(t.id);
    let { error } = await supabase.from('tenants').update({
      next_billing: valorAnterior,
      next_billing_anterior: novoAnterior,
      next_billing_historico: novoHistorico,
    }).eq('id', t.id);
    let historicoSalvo = novoHistorico;
    let anteriorSalvo = novoAnterior;
    if (error && /next_billing_historico/i.test(error.message || '')) {
      const retry = await supabase.from('tenants').update({ next_billing: valorAnterior, next_billing_anterior: null }).eq('id', t.id);
      error = retry.error;
      historicoSalvo = [];
      anteriorSalvo = null;
    }
    setUpdating(null);
    if (error) { toast.error('Erro ao desfazer: '+error.message); return; }
    setTenants(prev => prev.map(x => x.id===t.id ? {...x, next_billing:valorAnterior, next_billing_anterior:anteriorSalvo, next_billing_historico:historicoSalvo} : x));
    toast.success('Pagamento desfeito.');
    setMesesAberto(null);
  };

  // Correcao manual: recua o vencimento em N meses (30 dias por mes, o
  // mesmo criterio usado pra avancar). Pedido pelo Carlos (01/09/2026) pra
  // corrigir a Otica do Povo e a Otica Evangelista Altazes, que ficaram com
  // o vencimento um mes a mais — casos que nao tem historico salvo (a baixa
  // errada foi lancada antes do "Desfazer" existir), entao precisam de um
  // jeito de corrigir manualmente, nao so desfazer a ultima acao.
  const retrocederPagamento = async (t: Tenant, meses: number = 1) => {
    if (!t.next_billing) return;
    const atual = new Date(t.next_billing+'T00:00:00');
    const nb = new Date(atual); nb.setDate(nb.getDate() - meses*30);
    const novoNextBilling = nb.toISOString().split('T')[0];
    if (!confirm('Corrigir o vencimento de ' + t.company_name + ', voltando ' + meses + ' mes(es)? Nova data: ' + fmtDate(novoNextBilling) + ' (pago ate ' + pagoAteLabel(novoNextBilling) + ').')) return;
    const ok = await salvarVencimento(t, novoNextBilling, t.next_billing);
    if (!ok) return;
    toast.success('Vencimento corrigido. Pago ate '+pagoAteLabel(novoNextBilling)+'.');
    setMesesAberto(null);
  };

  // Move o tenant pra Lixeira em vez de apagar de vez — pedido pelo Carlos
  // (01/09/2026), depois do episodio da baixa errada, pra excluir deixar de
  // ser uma acao sem volta. Se a coluna excluido_em ainda nao existir no
  // banco (falta rodar o ALTER TABLE), pergunta se quer excluir de vez do
  // jeito antigo, em vez de travar a acao.
  const excluir = async (t: Tenant) => {
    if (!confirm('Mover '+t.company_name+' para a Lixeira? Da pra restaurar depois na tela Lixeira.')) return;
    setUpdating(t.id);
    let { error } = await supabase.from('tenants').update({ excluido_em: new Date().toISOString() }).eq('id', t.id);
    if (error && /excluido_em/i.test(error.message || '')) {
      if (confirm('A Lixeira ainda nao esta configurada no banco (falta rodar um comando no Supabase). Excluir ' + t.company_name + ' DEFINITIVAMENTE agora, sem poder desfazer?')) {
        const retry = await supabase.from('tenants').delete().eq('id', t.id);
        error = retry.error;
      } else {
        setUpdating(null);
        return;
      }
    }
    setUpdating(null);
    if (error) { toast.error('Erro ao excluir: '+error.message); return; }
    setTenants(prev=>prev.filter(x=>x.id!==t.id));
    setLixeiraCount(c=>c+1);
    toast.success('Tenant movido para a Lixeira');
  };

  const toggleBoleto = async (t: Tenant) => {
    const novoValor = !t.boleto_habilitado;
    setUpdating(t.id);
    const { error } = await supabase.from('tenants').update({ boleto_habilitado: novoValor }).eq('id', t.id);
    setUpdating(null);
    if (error) { toast.error('Erro ao atualizar boleto: '+error.message); return; }
    setTenants(prev => prev.map(x => x.id===t.id ? {...x, boleto_habilitado: novoValor} : x));
    toast.success(novoValor ? 'Boleto habilitado para '+t.company_name : 'Boleto desabilitado para '+t.company_name);
  };

  const salvar = async () => {
    if (!form.company_name || !form.email) { toast.error('Preencha nome e email'); return; }
    if (editing) {
      const { error } = await supabase.from('tenants').update(form).eq('id', editing.id);
      if (error) { toast.error('Erro: '+error.message); return; }
      toast.success('Salvo!');
    } else {
      const { error } = await supabase.from('tenants').insert([{...form, mrr_value:form.mrr_value||0}]);
      if (error) { toast.error('Erro: '+error.message); return; }
      toast.success('Tenant criado!');
    }
    setEditing(null);
    setForm({});
    setShowModal(false);
    load();
  };

  const exportCSV = () => {
    const rows = [['Empresa','Email','Plano','Status','Trial Ate','MRR','Cidade','Estado','Criado em']];
    filtered.forEach(t=>rows.push([t.company_name,t.email,t.plan,t.status,t.trial_end_date||'',String(t.mrr_value||0),t.city||'',t.state||'',fmtDate(t.created_at)]));
    const csv=rows.map(r=>r.join(';')).join('\n');
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv); a.download='tenants.csv'; a.click();
  };

  const thStyle = (field: string): React.CSSProperties => ({
    cursor:'pointer', userSelect:'none', display:'flex', alignItems:'center', gap:4,
    color: sortField===field ? '#6366f1' : 'var(--text-muted)'
  });

  const SortIcon = ({field}:{field:string}) => sortField===field
    ? (sortDir==='asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)
    : null;

  const doSort = (field: string) => {
    if (sortField===field) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', padding:24 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Shield size={20} color="white"/>
          </div>
          <div>
            <div style={{ fontSize:18, fontWeight:800 }}>OptiFlow <span style={{ color:'#6366f1' }}>Admin</span></div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>Painel de gestao SaaS</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ position:'relative' }}>
            <button onClick={()=>setShowAlerts(!showAlerts)}
              style={{ background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.2)', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'#f59e0b', display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600 }}>
              <Bell size={15}/> Alertas
              {(alertas.length + alertasVencimento.length) > 0 && <span style={{ background:'#f87171', color:'white', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{alertas.length + alertasVencimento.length}</span>}
            </button>
            {showAlerts && (alertas.length > 0 || alertasVencimento.length > 0) && (
              <div style={{ position:'absolute', top:'110%', right:0, width:320, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.4)', zIndex:100, overflow:'hidden', maxHeight:400, overflowY:'auto' }}>
                {alertasVencimento.length > 0 && (<>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Pagamento manual vencendo/vencido</div>
                  {alertasVencimento.map(t => {
                    const d = diasRestantes(t.next_billing);
                    return (
                      <div key={t.id} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13 }}>{t.company_name}</div>
                          <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.email}</div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                          <span style={{ fontSize:12, fontWeight:700, color: (d||0)<=0?'#f87171':(d||0)<=3?'#f59e0b':'#22c55e' }}>
                            {(d||0)<=0 ? 'Vencido' : d+'d restantes'}
                          </span>
                          <button onClick={()=>{ confirmarPagamentoManual(t); setShowAlerts(false); }}
                            style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, border:'1px solid rgba(34,197,94,.3)', background:'rgba(34,197,94,.1)', color:'#22c55e', cursor:'pointer' }}>
                            Confirmar Pix
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>)}
                {alertas.length > 0 && (<>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Trials expirando em breve</div>
                {alertas.map(t => {
                  const d = diasRestantes(t.trial_end_date);
                  return (
                    <div key={t.id} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{t.company_name}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.email}</div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                        <span style={{ fontSize:12, fontWeight:700, color: (d||0)<=0?'#f87171':(d||0)<=3?'#f59e0b':'#22c55e' }}>
                          {(d||0)<=0 ? 'Expirado' : d+'d restantes'}
                        </span>
                        <button onClick={()=>{ estenderTrial(t,7); setShowAlerts(false); }}
                          style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, border:'1px solid rgba(99,102,241,.3)', background:'rgba(99,102,241,.1)', color:'#6366f1', cursor:'pointer' }}>
                          +7 dias
                        </button>
                      </div>
                    </div>
                  );
                })}
                </>)}
              </div>
            )}
          </div>
          <button onClick={()=>navigate('/admin/trials-vencidos')}
            title="Trials que ja passaram do prazo de teste, fora da tabela principal"
            style={{ background:'rgba(148,163,184,.1)', border:'1px solid rgba(148,163,184,.2)', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'#94a3b8', display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600 }}>
            <Clock size={15}/> Trials Vencidos
            {stats.expirados > 0 && <span style={{ background:'#94a3b8', color:'#0B1120', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{stats.expirados}</span>}
          </button>
          <button onClick={()=>navigate('/admin/lixeira')}
            title="Tenants excluidos, ainda podem ser restaurados"
            style={{ background:'rgba(148,163,184,.1)', border:'1px solid rgba(148,163,184,.2)', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'#94a3b8', display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600 }}>
            <Trash2 size={15}/> Lixeira
            {lixeiraCount > 0 && <span style={{ background:'#94a3b8', color:'#0B1120', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{lixeiraCount}</span>}
          </button>
          <button onClick={()=>{setEditing(null);setForm({plan:'trial',status:'trial',trial_end_date:new Date(Date.now()+14*86400000).toISOString().split('T')[0]});setShowModal(true);}}
            style={{ background:'linear-gradient(135deg,#6366f1,#06b6d4)', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', color:'white', display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600 }}>
            <Plus size={15}/> Novo Tenant
          </button>
          <button onClick={load} style={{ background:'rgba(255,255,255,.06)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
            <RefreshCw size={15}/>
          </button>
          <button onClick={exportCSV} style={{ background:'rgba(255,255,255,.06)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
            <Download size={15}/>
          </button>
          <button onClick={()=>{ supabase.auth.signOut(); navigate('/admin-login'); }}
            style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
            <LogOut size={14}/> Sair
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:20 }}>
        {[
          { icon:<Users size={18}/>,       label:'Total Clientes',    val:stats.total,      sub:'+'+stats.novosmes+' este mes',  color:'#6366f1' },
          { icon:<CheckCircle size={18}/>, label:'Ativos',            val:stats.ativos,     sub:'Conversao: '+stats.conversao+'%', color:'#22c55e' },
          { icon:<Clock size={18}/>,       label:'Em Trial',          val:stats.trial,      sub:stats.expirando+' expirando',    color:'#f59e0b' },
          { icon:<AlertTriangle size={18}/>,label:'Inadimplentes',    val:stats.inadimp,    sub:'Requer atencao',                 color:'#f87171' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ color:s.color }}>{s.icon}</span>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>{s.label}</span>
            </div>
            <div style={{ fontSize:28, fontWeight:800, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{s.sub}</div>
            <MiniBar value={s.val} max={stats.total} color={s.color}/>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.2fr', gap:16, marginBottom:20 }}>
        {/* MRR */}
        <div className="card" style={{ padding:20, borderTop:'3px solid #22c55e' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <DollarSign size={18} style={{ color:'#22c55e' }}/>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>MRR (Ativos)</span>
          </div>
          <div style={{ fontSize:28, fontWeight:800, color:'#22c55e' }}>{formatBRL(stats.mrr)}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>MRR Total: {formatBRL(stats.mrrTotal)}</div>
        </div>
        {/* Conversao */}
        <div className="card" style={{ padding:20, borderTop:'3px solid #a855f7' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <TrendingUp size={18} style={{ color:'#a855f7' }}/>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>Taxa de Conversao</span>
          </div>
          <div style={{ fontSize:28, fontWeight:800, color:'#a855f7' }}>{stats.conversao}%</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>trial para pago</div>
          <MiniBar value={stats.conversao} max={100} color="#a855f7"/>
        </div>
        {/* Grafico crescimento */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <BarChart2 size={16} style={{ color:'#6366f1' }}/>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>Novos Tenants (6 meses)</span>
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:50 }}>
            {crescimento.map((m,i) => (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ width:'100%', background:i===5?'#6366f1':'rgba(99,102,241,.3)', borderRadius:'3px 3px 0 0', height: m.total>0 ? Math.max(6,(m.total/maxCres)*44) : 4, transition:'height .3s' }}/>
                <span style={{ fontSize:9, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <div className="search-bar" style={{ flex:1 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Buscar por nome, email ou cidade..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{ width:160 }} value={planFilter} onChange={e=>setPlanFilter(e.target.value)}>
          <option value="">Todos os Planos</option>
          {PLANS.map(p=><option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
        </select>
        <select className="form-input" style={{ width:160 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">Todos os Status</option>
          {STATUS_LIST.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
          MRR filtrado: <strong style={{ color:'#22c55e' }}>{formatBRL(mrrFiltrado)}</strong>
        </div>
      </div>

      {/* Tabela */}
      {loading ? <div className="empty-state"><p>Carregando...</p></div> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th onClick={()=>doSort('company_name')}><div style={thStyle('company_name')}>Empresa <SortIcon field="company_name"/></div></th>
                  <th>Email</th>
                  <th style={{ textAlign:'center' }}>Plano</th>
                  <th style={{ textAlign:'center' }}>Status</th>
                  <th style={{ textAlign:'center' }} onClick={()=>doSort('trial_end_date')}><div style={{...thStyle('trial_end_date'), justifyContent:'center'}}>Trial / Vencimento <SortIcon field="trial_end_date"/></div></th>
                  <th style={{ textAlign:'right' }} onClick={()=>doSort('mrr_value')}><div style={{...thStyle('mrr_value'), justifyContent:'flex-end'}}>MRR <SortIcon field="mrr_value"/></div></th>
                  <th style={{ textAlign:'center' }} onClick={()=>doSort('created_at')}><div style={{...thStyle('created_at'), justifyContent:'center'}}>Criado <SortIcon field="created_at"/></div></th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(t => {
                  const st = getStatus(t.status);
                  const dias = diasRestantes(t.trial_end_date);
                  const trialColor = dias===null ? 'var(--text-muted)' : dias<=0 ? '#f87171' : dias<=3 ? '#f59e0b' : '#22c55e';
                  return (
                    <tr key={t.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'white', flexShrink:0 }}>
                            {(t.company_name||'?').slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight:700 }}>{t.company_name}</div>
                            {t.city && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.city}{t.state?' - '+t.state:''}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize:12 }}>{t.email}</div>
                        {t.phone && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t.phone}</div>}
                      </td>
                      <td style={{ textAlign:'center' }}>
                        <select value={t.plan} onChange={e=>updateField(t.id,'plan',e.target.value)}
                          disabled={updating===t.id}
                          style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:20, border:'none', background:'rgba(99,102,241,.15)', color:'#6366f1', cursor:'pointer', outline:'none' }}>
                          {PLANS.map(p=><option key={p} value={p}>{PLAN_LABELS[p]} - R$ {PLAN_PRICES[p]}/mes</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign:'center' }}>
                        <select value={t.status} onChange={e=>updateField(t.id,'status',e.target.value)}
                          disabled={updating===t.id}
                          style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, border:'none', background:st.bg, color:st.color, cursor:'pointer', outline:'none' }}>
                          {STATUS_LIST.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign:'center' }}>
                        {t.status==='trial' && dias!==null ? (
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:trialColor }}>
                              {dias<=0 ? 'Expirado '+Math.abs(dias)+'d atras' : dias+'d restantes'}
                            </div>
                            <div style={{ fontSize:10, color:'var(--text-muted)' }}>{fmtDate(t.trial_end_date)}</div>
                            <div style={{ display:'flex', gap:4, justifyContent:'center', marginTop:4 }}>
                              {[7,14,30].map(d=>(
                                <button key={d} onClick={()=>estenderTrial(t,d)}
                                  style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, border:'1px solid rgba(99,102,241,.3)', background:'rgba(99,102,241,.1)', color:'#6366f1', cursor:'pointer' }}>
                                  +{d}d
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (t.status==='ativo' || t.status==='inadimplente') && t.next_billing ? (() => {
                          // Pagamento manual via Pix (fora do Asaas) — mesmo padrao de cor
                          // do trial acima, pra ficar claro quem esta vencendo/vencido sem
                          // precisar abrir o dropdown de Alertas. Clicar na data abre as
                          // opcoes de quantos meses foram pagos (pra quem esta varios meses
                          // atrasado e paga tudo de uma vez — pedido do Carlos, 01/09/2026).
                          const diasCobranca = diasRestantes(t.next_billing);
                          const corCobranca = diasCobranca===null ? 'var(--text-muted)' : diasCobranca<=0 ? '#f87171' : diasCobranca<=3 ? '#f59e0b' : '#22c55e';
                          const aberto = mesesAberto === t.id;
                          const pagoAte = pagoAteLabel(t.next_billing);
                          return (
                            <div>
                              {pagoAte && (
                                <div style={{ fontSize:11, fontWeight:700, color:'#22c55e' }}>
                                  Pago ate {pagoAte}
                                </div>
                              )}
                              <div onClick={()=>setMesesAberto(aberto ? null : t.id)}
                                title="Clique para confirmar pagamento de 1 ou mais meses, ou desfazer o ultimo"
                                style={{ fontSize:12, fontWeight:700, color:corCobranca, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:2 }}>
                                {diasCobranca!==null && diasCobranca<=0 ? 'Vencido '+Math.abs(diasCobranca)+'d atras' : diasCobranca+'d restantes'}
                                {aberto ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                              </div>
                              <div style={{ fontSize:10, color:'var(--text-muted)' }}>{fmtDate(t.next_billing)}</div>
                              {aberto && (
                                <div style={{ marginTop:4 }}>
                                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, justifyContent:'center', maxWidth:140, marginLeft:'auto', marginRight:'auto' }}>
                                    {[1,2,3,6].map(m=>(
                                      <button key={m} onClick={()=>confirmarPagamentoManual(t,m)}
                                        style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, border:'1px solid rgba(34,197,94,.3)', background:'rgba(34,197,94,.1)', color:'#22c55e', cursor:'pointer' }}>
                                        {m===1 ? '1 mes pago' : m+' meses pagos'}
                                      </button>
                                    ))}
                                  </div>
                                  <button onClick={()=>retrocederPagamento(t,1)}
                                    title="Corrige o vencimento voltando 1 mes (use quando ficou marcado um mes a mais)"
                                    style={{ marginTop:6, width:'100%', fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4, border:'1px solid rgba(245,158,11,.3)', background:'rgba(245,158,11,.1)', color:'#f59e0b', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                                    <RotateCcw size={11}/> Corrigir: voltar 1 mes
                                  </button>
                                  {t.next_billing_anterior && (
                                    <button onClick={()=>desfazerPagamento(t)}
                                      title={'Volta o vencimento para '+fmtDate(t.next_billing_anterior)}
                                      style={{ marginTop:4, width:'100%', fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4, border:'1px solid rgba(248,113,113,.3)', background:'rgba(248,113,113,.1)', color:'#f87171', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                                      <RotateCcw size={11}/> Desfazer ultimo pagamento
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })() : t.next_billing ? (
                          <div style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(t.next_billing)}</div>
                        ) : <span style={{ color:'var(--text-muted)' }}>--</span>}
                      </td>
                      <td style={{ textAlign:'right' }}>
                        <div style={{ fontWeight:700, color:'#22c55e' }}>{formatBRL(t.mrr_value||0)}</div>
                        <div style={{ fontSize:10, color:'var(--text-muted)' }}>/mes</div>
                      </td>
                      <td style={{ textAlign:'center', fontSize:12, color:'var(--text-muted)' }}>
                        {fmtDate(t.created_at)}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={()=>{ setEditing(t); setForm({...t}); setShowModal(true); }} title="Editar"
                            style={{ background:'rgba(99,102,241,.1)', border:'1px solid rgba(99,102,241,.2)', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#6366f1', display:'flex', alignItems:'center' }}>
                            <Edit2 size={13}/>
                          </button>
   <button onClick={()=>window.open('/contrato/'+t.id,'_blank')} title="Contrato"
                        style={{background:'rgba(59,130,246,.1)',border:'1px solid rgba(59,130,246,.2)',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#3b82f6',display:'flex',alignItems:'center',marginRight:4}}>
                        <span style={{fontSize:12}}>Contrato</span>
                      </button>
                      {/* Separador visual: o Boleto e uma configuracao a parte (legado),
                          sem relacao com a confirmacao de pagamento Pix ao lado — deixado
                          mais discreto pra nao competir visualmente com as acoes do dia a
                          dia (pedido pelo Carlos, 01/09/2026). */}
                      <div style={{ width:1, alignSelf:'stretch', background:'var(--border)', margin:'0 4px' }}/>
                      <button onClick={()=>toggleBoleto(t)} title={(t.boleto_habilitado ? 'Boleto habilitado. ' : 'Boleto desabilitado. ') + 'Clique para alternar (configuracao separada do Pix)'}
                        disabled={updating===t.id}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius:6, padding:'5px 8px', cursor:'pointer',
                          color: t.boleto_habilitado ? '#64748b' : '#475569',
                          display:'flex', alignItems:'center', marginRight:4, fontSize:11, fontWeight:600, opacity:.75
                        }}>
                        Boleto: {t.boleto_habilitado ? 'On' : 'Off'}
                      </button>
                      {(t.status==='ativo' || t.status==='inadimplente') && (
                        <button onClick={()=>confirmarPagamentoManual(t)} title="Confirmar pagamento (Pix manual) e liberar por mais 30 dias"
                          disabled={updating===t.id}
                          style={{background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.2)',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#22c55e',display:'flex',alignItems:'center',marginRight:4}}>
                          <CheckCircle size={13}/>
                        </button>
                      )}
                      <button onClick={()=>acessarLoja(t.id)} title="Acessar Loja"
                            style={{background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.2)',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#22c55e',display:'flex',alignItems:'center'}}>
                            <ExternalLink size={13}/>
                          </button>
                          <button onClick={()=>excluir(t)} title="Excluir"
                            style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.2)', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}>
                            <X size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <span>{filtered.length} tenant(s) | Total: {tenants.length}</span>
            <span>MRR filtrado: <strong style={{ color:'#22c55e' }}>{formatBRL(mrrFiltrado)}</strong></span>
          </div>
          {totalPages > 1 && (
            <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'center', alignItems:'center', gap:12 }}>
              <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={paginaAtual<=1}
                style={{ background:'rgba(255,255,255,.06)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 12px', cursor: paginaAtual<=1?'default':'pointer', color: paginaAtual<=1?'var(--text-muted)':'#E8EDF5', fontSize:12, fontWeight:600, opacity: paginaAtual<=1?.5:1 }}>
                Anterior
              </button>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>Pagina {paginaAtual} de {totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={paginaAtual>=totalPages}
                style={{ background:'rgba(255,255,255,.06)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 12px', cursor: paginaAtual>=totalPages?'default':'pointer', color: paginaAtual>=totalPages?'var(--text-muted)':'#E8EDF5', fontSize:12, fontWeight:600, opacity: paginaAtual>=totalPages?.5:1 }}>
                Proxima
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal editar/criar */}
      {showModal && (
        <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget){setEditing(null);setForm({});setShowModal(false);} }}>
          <div className="modal" style={{ maxWidth:560, width:'95%' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Editar: '+editing.company_name : 'Novo Tenant'}</h2>
              <button onClick={()=>{setEditing(null);setForm({});setShowModal(false);}}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Nome da Empresa *</label>
                  <input className="form-input" value={form.company_name||''} onChange={e=>setForm(f=>({...f,company_name:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Telefone</label>
                  <input className="form-input" value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Plano</label>
                  <select className="form-input" value={form.plan||'trial'} onChange={e=>{ const p=e.target.value as Plan; setForm(f=>({...f,plan:p,mrr_value:PLAN_PRICES[p]||0})); }}>
                    {PLANS.map(p=><option key={p} value={p}>{PLAN_LABELS[p]} - R$ {PLAN_PRICES[p]}/mes</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select className="form-input" value={form.status||'trial'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                    {STATUS_LIST.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Trial Ate</label>
                  <input className="form-input" type="date" value={form.trial_end_date||''} onChange={e=>setForm(f=>({...f,trial_end_date:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Proxima Cobranca</label>
                  <input className="form-input" type="date" value={form.next_billing||''} onChange={e=>setForm(f=>({...f,next_billing:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">MRR (R$/mes)</label>
                  <input className="form-input" type="number" value={form.mrr_value||0} onChange={e=>setForm(f=>({...f,mrr_value:parseFloat(e.target.value)||0}))}/>
                </div>
                <div>
                  <label className="form-label">Cidade</label>
                  <input className="form-input" value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/>
                </div>
                <div>
                  <label className="form-label">Estado (UF)</label>
                  <input className="form-input" value={form.state||''} onChange={e=>setForm(f=>({...f,state:e.target.value}))} placeholder="AM"/>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'16px 24px', borderTop:'1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={()=>{setEditing(null);setForm({});setShowModal(false);}}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar}><Save size={14}/> Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

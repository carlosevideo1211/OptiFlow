import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  CreditCard, Search, Plus, Eye, CheckCircle,
  AlertTriangle, Clock, DollarSign, Users,
  X, Save, Download, MessageCircle, Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL } from '../types/index';

interface Parcela {
  id: string; crediario_id: string; tenant_id: string;
  installment_number: number; due_date: string; amount: number;
  paid_at?: string; paid_amount?: number; status: string;
}

interface Crediario {
  id: string; tenant_id: string; customer_id: string; customer_name: string;
  sale_id?: string; total_amount: number; installments: number;
  notes?: string; status: string; created_at: string;
  parcelas?: Parcela[];
}

interface Customer { id: string; name: string; phone?: string; whatsapp?: string; }

export default function CrediarioPage() {
  const { tenantId } = useAuth();
  const [crediarios, setCrediarios] = useState<Crediario[]>([]);
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('ativo');
  const [selected, setSelected]     = useState<Crediario | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [showNew, setShowNew]       = useState(false);
  const [saving, setSaving]         = useState(false);

  // Form novo crediário
  const [form, setForm] = useState({
    customer_id: '', customer_name: '', total_amount: 0,
    installments: 1, notes: ''
  });

  const load = async () => {
    setLoading(true);
    const [{ data: cr }, { data: cli }] = await Promise.all([
      supabase.from('crediario').select('*, parcelas:crediario_parcelas(*)')
        .eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      supabase.from('customers').select('id,name,phone,whatsapp')
        .eq('tenant_id', tenantId).eq('active', true).order('name'),
    ]);
    setCrediarios((cr as Crediario[]) || []);
    setCustomers((cli as Customer[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  // Stats
  const hoje = new Date().toISOString().split('T')[0];
  const ativos     = crediarios.filter(c => c.status === 'ativo');
  const totalAberto = ativos.reduce((s, c) => {
    const pend = (c.parcelas||[]).filter(p => p.status === 'pendente').reduce((a,p)=>a+p.amount,0);
    return s + pend;
  }, 0);
  const vencidos = crediarios.reduce((s, c) => {
    const v = (c.parcelas||[]).filter(p => p.status==='pendente' && p.due_date < hoje).length;
    return s + v;
  }, 0);
  const recebidoMes = crediarios.reduce((s, c) => {
    const mesAtual = new Date().toISOString().slice(0,7);
    const r = (c.parcelas||[]).filter(p => p.status==='pago' && p.paid_at?.startsWith(mesAtual))
      .reduce((a,p)=>a+(p.paid_amount||p.amount),0);
    return s + r;
  }, 0);

  const filtered = useMemo(() => {
    let list = crediarios;
    if (statusFilter) list = list.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(c => c.customer_name.toLowerCase().includes(s));
    }
    return list;
  }, [crediarios, search, statusFilter]);

  const openDetail = (c: Crediario) => { setSelected(c); setShowModal(true); };

  const pagarParcela = async (parcela: Parcela) => {
    if (parcela.status === 'pago') { toast('Parcela já paga!'); return; }
    const { error } = await supabase.from('crediario_parcelas').update({
      status: 'pago',
      paid_at: new Date().toISOString(),
      paid_amount: parcela.amount,
    }).eq('id', parcela.id);
    if (error) { toast.error('Erro ao registrar pagamento'); return; }

    // Verificar se todas pagas → fechar crediário
    const { data: allParc } = await supabase.from('crediario_parcelas')
      .select('status').eq('crediario_id', parcela.crediario_id);
    const todasPagas = (allParc||[]).every((p: { status: string; id?: string }) => p.status === 'pago' || p.id === parcela.id);
    if (todasPagas) {
      await supabase.from('crediario').update({ status: 'quitado' }).eq('id', parcela.crediario_id);
      toast.success('Parcela paga! Crediário QUITADO! 🎉');
    } else {
      toast.success('Parcela '+parcela.installment_number+' paga!');
    }
    load();
    // Atualizar selected
    if (selected?.id === parcela.crediario_id) {
      const { data } = await supabase.from('crediario')
        .select('*, parcelas:crediario_parcelas(*)')
        .eq('id', parcela.crediario_id).single();
      if (data) setSelected(data as Crediario);
    }
  };

  const abrirWhatsApp = (c: Crediario) => {
    const cli = customers.find(cu => cu.id === c.customer_id);
    const num = ((cli?.whatsapp||cli?.phone||'')).replace(/\D/g,'');
    if (!num) { toast.error('Sem número cadastrado'); return; }
    const parc = (c.parcelas||[]).filter(p=>p.status==='pendente').sort((a,b)=>a.due_date.localeCompare(b.due_date));
    const prox = parc[0];
    const msg = encodeURIComponent(
      'Olá '+c.customer_name+'! Lembrando que você tem uma parcela de '+
      formatBRL(prox?.amount||0)+' com vencimento em '+
      (prox ? new Date(prox.due_date+'T00:00:00').toLocaleDateString('pt-BR') : '—')+
      '. Entre em contato para regularizar. Obrigado!'
    );
    window.open('https://wa.me/55'+num+'?text='+msg, '_blank');
  };

  const criarCrediario = async () => {
    if (!form.customer_name || form.total_amount <= 0 || form.installments < 1) {
      toast.error('Preencha todos os campos'); return;
    }
    setSaving(true);
    try {
      const { data: cr, error } = await supabase.from('crediario').insert([{
        tenant_id: tenantId,
        customer_id: form.customer_id || null,
        customer_name: form.customer_name,
        total_amount: form.total_amount,
        installments: form.installments,
        notes: form.notes || null,
        status: 'ativo',
      }]).select().single();
      if (error) throw error;

      const parcelVal = form.total_amount / form.installments;
      const parcelas = Array.from({ length: form.installments }, (_, i) => {
        const due = new Date();
        due.setMonth(due.getMonth() + i + 1);
        return {
          crediario_id: cr.id, tenant_id: tenantId,
          installment_number: i + 1,
          due_date: due.toISOString().split('T')[0],
          amount: parseFloat(parcelVal.toFixed(2)),
          status: 'pendente',
        };
      });
      await supabase.from('crediario_parcelas').insert(parcelas);
      toast.success('Crediário criado com '+form.installments+'x parcelas!');
      setShowNew(false);
      setForm({ customer_id:'', customer_name:'', total_amount:0, installments:1, notes:'' });
      load();
    } catch (err: any) { toast.error(err.message||'Erro ao criar'); }
    finally { setSaving(false); }
  };

  const exportCSV = () => {
    const header = 'Cliente,Total,Parcelas,Abertas,Vencidas,Status';
    const rows = filtered.map(c => {
      const pend = (c.parcelas||[]).filter(p=>p.status==='pendente').length;
      const venc = (c.parcelas||[]).filter(p=>p.status==='pendente'&&p.due_date<hoje).length;
      return [c.customer_name,c.total_amount,c.installments,pend,venc,c.status]
        .map(v=>'"'+(v??'')+'"').join(',');
    });
    const blob = new Blob([header+'\n'+rows.join('\n')],{type:'text/csv'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='crediario.csv'; a.click(); toast.success('Exportado!');
  };

  const getStatusBadge = (c: Crediario) => {
    const venc = (c.parcelas||[]).filter(p=>p.status==='pendente'&&p.due_date<hoje).length;
    if (c.status==='quitado') return { label:'Quitado', color:'#a855f7', bg:'rgba(168,85,247,.15)' };
    if (venc > 0)             return { label:venc+' vencida'+(venc>1?'s':''), color:'#f87171', bg:'rgba(248,113,113,.15)' };
    return                           { label:'Em dia',  color:'#22c55e', bg:'rgba(34,197,94,.15)' };
  };

  const parcelasRestantes = (c: Crediario) =>
    (c.parcelas||[]).filter(p=>p.status==='pendente').length;
  const valorAberto = (c: Crediario) =>
    (c.parcelas||[]).filter(p=>p.status==='pendente').reduce((s,p)=>s+p.amount,0);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <CreditCard size={22}/> Crediário
          </h1>
          <p className="page-sub">Gestão de parcelamentos e cobranças</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}><Plus size={16}/> Novo Crediário</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
        {[
          { icon:<Users size={22}/>,        val: ativos.length,      label:'Crediários Ativos',  color:'#6366f1' },
          { icon:<DollarSign size={22}/>,   val: formatBRL(totalAberto), label:'Total em Aberto', color:'#f59e0b' },
          { icon:<AlertTriangle size={22}/>,val: vencidos,            label:'Parcelas Vencidas',  color:'#f87171' },
          { icon:<CheckCircle size={22}/>,  val: formatBRL(recebidoMes),label:'Recebido no Mês',  color:'#22c55e' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:typeof s.val==='number'?28:18, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Pesquisar por cliente..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{ width:180 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="quitado">Quitados</option>
          <option value="cancelado">Cancelados</option>
        </select>
      </div>

      {/* Tabela */}
      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><CreditCard size={40}/></div>
          <h3>Nenhum crediário encontrado.</h3>
          <button className="btn btn-primary" onClick={()=>setShowNew(true)}><Plus size={15}/> Novo Crediário</button>
        </div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Cliente</th><th>Total</th><th>Parcelas</th><th>Em Aberto</th><th>Próx. Vencimento</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const st = getStatusBadge(c);
                  const rest = parcelasRestantes(c);
                  const aberto = valorAberto(c);
                  const proxParc = (c.parcelas||[])
                    .filter(p=>p.status==='pendente')
                    .sort((a,b)=>a.due_date.localeCompare(b.due_date))[0];
                  const proxDate = proxParc ? new Date(proxParc.due_date+'T00:00:00') : null;
                  const vencida = proxDate && proxDate < new Date();
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', flexShrink:0,
                            background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:12, fontWeight:700, color:'white' }}>
                            {c.customer_name.slice(0,2).toUpperCase()}
                          </div>
                          <div style={{ fontWeight:500 }}>{c.customer_name}</div>
                        </div>
                      </td>
                      <td style={{ fontWeight:600 }}>{formatBRL(c.total_amount)}</td>
                      <td style={{ fontSize:13 }}>
                        {(c.parcelas||[]).filter(p=>p.status==='pago').length}/{c.installments} pagas
                      </td>
                      <td style={{ fontWeight:600, color: aberto>0?'#f59e0b':'#22c55e' }}>
                        {aberto > 0 ? formatBRL(aberto) : '—'}
                      </td>
                      <td>
                        {proxParc ? (
                          <span style={{ fontSize:13, color: vencida?'#f87171':'var(--text)', fontWeight: vencida?700:400 }}>
                            {vencida && '⚠️ '}
                            {proxDate?.toLocaleDateString('pt-BR')}
                            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{formatBRL(proxParc.amount)}</div>
                          </span>
                        ) : <span style={{ color:'#22c55e', fontSize:13 }}>✅ Quitado</span>}
                      </td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12,
                          fontWeight:600, padding:'4px 10px', borderRadius:20,
                          background:st.bg, color:st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={()=>openDetail(c)} title="Ver parcelas"
                            style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
                              borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#94a3b8',
                              display:'flex', alignItems:'center' }}>
                            <Eye size={14}/>
                          </button>
                          <button onClick={()=>abrirWhatsApp(c)} title="Cobrar via WhatsApp"
                            style={{ background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.2)',
                              borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#22c55e',
                              display:'flex', alignItems:'center' }}>
                            <MessageCircle size={14}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
       )}

      {/* Modal — Detalhes e Parcelas */}
      {showModal && selected && (
        <div className="modal-overlay" onClick={()=>setShowModal(false)}>
          <div className="modal" style={{ maxWidth:600, width:'95%' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Crediário — {selected.customer_name}</h2>
              <button onClick={()=>setShowModal(false)}><X size={18}/></button>
            </div>
            <div className="modal-body">
              {/* Resumo */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
                {[
                  ['Total', formatBRL(selected.total_amount)],
                  ['Parcelas', selected.installments+'x'],
                  ['Valor Aberto', formatBRL(valorAberto(selected))],
                ].map(([k,v]) => (
                  <div key={k} style={{ padding:'10px 14px', background:'var(--bg-card)', borderRadius:8 }}>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:3 }}>{k}</div>
                    <div style={{ fontSize:15, fontWeight:700 }}>{v}</div>
                  </div>
                ))}
              </div>
              {/* Parcelas */}
              <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Parcelas</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(selected.parcelas||[])
                  .sort((a,b)=>a.installment_number-b.installment_number)
                  .map(p => {
                    const venc = p.status==='pendente' && p.due_date < hoje;
                    const pago = p.status==='pago';
                    return (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'12px 16px', borderRadius:10,
                        background: pago?'rgba(34,197,94,.08)':venc?'rgba(248,113,113,.08)':'var(--bg-card)',
                        border:'1px solid '+(pago?'rgba(34,197,94,.2)':venc?'rgba(248,113,113,.2)':'var(--border)') }}>
                        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', display:'flex',
                            alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700,
                            background: pago?'rgba(34,197,94,.2)':venc?'rgba(248,113,113,.2)':'rgba(99,102,241,.15)',
                            color: pago?'#22c55e':venc?'#f87171':'#6366f1' }}>
                            {p.installment_number}
                          </div>
                          <div>
                            <div style={{ fontSize:14, fontWeight:600 }}>{formatBRL(p.amount)}</div>
                            <div style={{ fontSize:12, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:4 }}>
                              <Calendar size={11}/>
                              Venc: {new Date(p.due_date+'T00:00:00').toLocaleDateString('pt-BR')}
                              {pago && p.paid_at && ' · Pago: '+new Date(p.paid_at).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          {pago ? (
                            <span style={{ fontSize:12, fontWeight:600, color:'#22c55e',
                              display:'flex', alignItems:'center', gap:4 }}>
                              <CheckCircle size={14}/> Pago
                            </span>
                          ) : (
                            <>
                              {venc && <span style={{ fontSize:11, fontWeight:600, color:'#f87171' }}>VENCIDA</span>}
                              <button onClick={()=>pagarParcela(p)}
                                style={{ padding:'6px 14px', borderRadius:8, border:'none',
                                  background:'linear-gradient(135deg,#6366f1,#06b6d4)',
                                  color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                                Receber
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>abrirWhatsApp(selected)} style={{ color:'#22c55e' }}>
                <MessageCircle size={15}/> Cobrar WhatsApp
              </button>
              <button className="btn btn-secondary" onClick={()=>setShowModal(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Novo Crediário */}
      {showNew && (
        <div className="modal-overlay" onClick={()=>setShowNew(false)}>
          <div className="modal" style={{ maxWidth:480, width:'95%' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Novo Crediário</h2>
              <button onClick={()=>setShowNew(false)}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <label className="form-label">Cliente *</label>
                  <select className="form-input" value={form.customer_id}
                    onChange={e => {
                      const c = customers.find(c=>c.id===e.target.value);
                      setForm(f=>({...f, customer_id:e.target.value, customer_name:c?.name||''}));
                    }}>
                    <option value="">Selecione o cliente...</option>
                    {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Valor Total (R$) *</label>
                  <input className="form-input" type="number" step="0.01" min="0"
                    value={form.total_amount||''}
                    onChange={e=>setForm(f=>({...f,total_amount:parseFloat(e.target.value)||0}))}
                    placeholder="0,00"/>
                </div>
                <div>
                  <label className="form-label">Número de Parcelas *</label>
                  <select className="form-input" value={form.installments}
                    onChange={e=>setForm(f=>({...f,installments:parseInt(e.target.value)}))}>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>(
                      <option key={n} value={n}>
                        {n}x {form.total_amount>0?'de '+formatBRL(form.total_amount/n):''}
                      </option>
                    ))}
                  </select>
                </div>
                {form.total_amount > 0 && form.installments > 0 && (
                  <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(99,102,241,.1)',
                    display:'flex', justifyContent:'space-between', fontSize:14 }}>
                    <span>{form.installments}x de</span>
                    <strong style={{ color:'#6366f1' }}>{formatBRL(form.total_amount/form.installments)}</strong>
                  </div>
                )}
                <div>
                  <label className="form-label">Observações</label>
                  <textarea className="form-input" rows={2} value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    placeholder="Opcional..."/>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={criarCrediario} disabled={saving}>
                <Save size={15}/> {saving?'Criando...':'Criar Crediário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

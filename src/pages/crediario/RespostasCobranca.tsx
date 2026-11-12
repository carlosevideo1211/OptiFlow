// Cobranca nova - Fase 1, etapa 3 (11/11/2026): respostas dos clientes entendidas pelo robo (WhatsApp oficial).
// Lista o que precisa da loja: PAGUEI a conferir, quer acordo, falar com a loja, nao consegue pagar.
// Modulo separado (tabela cobranca_respostas, gravada pelo whatsapp-webhook). So aparece com tenants.cobranca_nova.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Resposta {
  id: string; customer_id: string | null; phone: string; nome: string | null; intencao: string;
  texto: string | null; status: string; resposta_auto: string | null; created_at: string; resolvido_em: string | null;
}

const GRUPOS: { intencao: string; titulo: string; cor: string; ajuda: string }[] = [
  { intencao: 'paguei', titulo: 'Disseram que pagaram (conferir)', cor: '#22c55e',
    ajuda: 'O robô parou de cobrar esses clientes. Confira o Pix/dinheiro, dê baixa na parcela e marque "Já dei baixa". Se não pagou, marque "Não pagou" para a cobrança voltar.' },
  { intencao: 'pagar_vista', titulo: 'Querem pagar à vista', cor: '#6366f1', ajuda: 'Responda pela tela Mensagens com o valor do acordo e o Pix.' },
  { intencao: 'parcelar', titulo: 'Querem parcelar', cor: '#8b5cf6', ajuda: 'Responda pela tela Mensagens com as condições (entrada = 1 parcela, até 4x).' },
  { intencao: 'nao_consigo', titulo: 'Dizem que não conseguem pagar', cor: '#f59e0b', ajuda: 'Ligar ou responder para combinar uma forma que caiba no bolso.' },
  { intencao: 'falar_loja', titulo: 'Pediram para falar com a loja', cor: '#0ea5e9', ajuda: 'Responder pela tela Mensagens.' },
];

const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fone = (p: string) => { const d = p.replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : p; };

export function useRespostasPendentes(tenantId?: string | null, ativo?: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!tenantId || !ativo) return;
    // Conta as respostas esperando a loja + os acordos do Feirao esperando o Pix (11/11/2026).
    Promise.all([
      supabase.from('cobranca_respostas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pendente'),
      supabase.from('cobranca_acordos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'aguardando_pagamento'),
    ]).then(([r, a]) => setN((r.count || 0) + (a.count || 0)));
  }, [tenantId, ativo]);
  return n;
}

interface Acordo {
  id: string; customer_id: string; phone: string | null; status: string; tipo: string | null; valor_original: number | null; valor_juros: number | null;
  valor_vista: number | null; n_parcelas: number | null; valor_parcela: number | null; valor_acordo: number | null; pix_valor: number | null;
  expira_em: string | null; ofertado_em: string | null; aceito_em: string | null; fechado_em: string | null; fechado_por: string | null;
  customers?: { name: string } | null;
}
const brl = (v?: number | null) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const TIPO: Record<string, string> = { vista: 'À vista', entrada: 'Parcelado com entrada', sem_entrada: 'Parcelado sem entrada' };

export default function RespostasCobranca({ tenantId, onVerCliente }: { tenantId: string; onVerCliente: (nome: string) => void }) {
  const { user } = useAuth() as any;
  const navigate = useNavigate();
  const [lista, setLista] = useState<Resposta[]>([]);
  const [parar, setParar] = useState<Resposta[]>([]);
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [fechando, setFechando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const desde = new Date(Date.now() - 30 * 864e5).toISOString();
    const [{ data: p }, { data: pr }, { data: ac }] = await Promise.all([
      supabase.from('cobranca_respostas').select('*').eq('tenant_id', tenantId).eq('status', 'pendente').order('created_at'),
      supabase.from('cobranca_respostas').select('*').eq('tenant_id', tenantId).eq('intencao', 'parar')
        .gte('created_at', desde).order('created_at', { ascending: false }),
      supabase.from('cobranca_acordos').select('*, customers(name)').eq('tenant_id', tenantId)
        .gte('created_at', desde).order('created_at', { ascending: false }),
    ]);
    setLista((p as Resposta[]) || []);
    setParar((pr as Resposta[]) || []);
    setAcordos((ac as Acordo[]) || []);
    setCarregando(false);
  }, [tenantId]);

  const pagamentoRecebido = async (a: Acordo) => {
    if (fechando) return;
    if (!window.confirm(`Confirmar que o Pix de ${brl(a.pix_valor)} de ${a.customers?.name || 'cliente'} caiu na conta?\n\nO sistema vai criar o carnê do acordo (renegociação) e cancelar as parcelas antigas.`)) return;
    setFechando(a.id);
    const { error } = await supabase.rpc('cobranca_fechar_acordo', { p_acordo: a.id, p_por: user?.name || user?.email || 'loja' });
    setFechando(null);
    if (error) { toast.error('Não foi possível fechar o acordo: ' + error.message, { duration: 10000 }); return; }
    toast.success('Acordo fechado! Carnê de renegociação criado.');
    // Confirmacao para o cliente no WhatsApp (pedido do Carlos, 11/11/2026). Vai como mensagem livre: o cliente
    // conversou com o robo ha pouco (escolheu o acordo), entao a conversa de 24h da Meta normalmente esta aberta.
    if (a.phone) {
      const primeiro = (a.customers?.name || '').trim().split(/\s+/)[0];
      const prox = new Date(); prox.setMonth(prox.getMonth() + 1);
      const texto = a.tipo === 'vista'
        ? `Pagamento de ${brl(a.pix_valor)} confirmado${primeiro ? ', ' + primeiro : ''}! ✅ Seu acordo do Feirão Limpa Nome está QUITADO. Obrigado pela confiança!`
        : `Entrada de ${brl(a.pix_valor)} confirmada${primeiro ? ', ' + primeiro : ''}! ✅ Seu acordo do Feirão Limpa Nome está ativo: faltam ${(a.n_parcelas || 1) - 1}x de ${brl(a.valor_parcela)}, a próxima em ${prox.toLocaleDateString('pt-BR')}. Vamos te lembrar antes de cada vencimento, com o Pix.`;
      const { data: env, error: errEnv } = await supabase.functions.invoke('whatsapp-manage', { body: { action: 'send_reply', phone: a.phone, text: texto } });
      if (errEnv || (env as any)?.ok === false) toast('Acordo fechado, mas a confirmação no WhatsApp não foi: ' + ((env as any)?.error || errEnv?.message || 'erro'), { icon: '⚠️', duration: 9000 });
      else toast.success('Confirmação enviada ao cliente no WhatsApp.');
    }
    carregar();
  };

  const cancelarAcordo = async (a: Acordo) => {
    if (!window.confirm('Cancelar este acordo? A cobrança normal volta para esse cliente.')) return;
    const { error } = await supabase.from('cobranca_acordos').update({ status: 'cancelado', fechado_em: new Date().toISOString(), fechado_por: user?.name || 'loja' })
      .eq('id', a.id).eq('tenant_id', tenantId);
    if (error) { toast.error(error.message); return; }
    carregar();
  };
  useEffect(() => { carregar(); }, [carregar]);

  const marcar = async (r: Resposta, status: 'confirmado' | 'nao_pago' | 'resolvido') => {
    const { error } = await supabase.from('cobranca_respostas')
      .update({ status, resolvido_em: new Date().toISOString(), resolvido_por: user?.name || user?.email || 'loja' })
      .eq('id', r.id).eq('tenant_id', tenantId);
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return; }
    toast.success(status === 'nao_pago' ? 'Marcado: não pagou. A cobrança automática volta.' : 'Pronto!');
    setLista(l => l.filter(x => x.id !== r.id));
  };

  if (carregando) return <div className="empty-state"><p>Carregando...</p></div>;

  const btn = (cor: string): React.CSSProperties => ({ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${cor}`, background: 'transparent', color: cor });

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Respostas dos clientes ao WhatsApp oficial que o robô entendeu. O resto das mensagens continua na tela Mensagens.
      </div>
      {(() => {
        const agora = Date.now();
        const esperando = acordos.filter(a => a.status === 'aguardando_pagamento');
        const conversando = acordos.filter(a => a.status === 'ofertado' || a.status === 'escolhendo');
        const fechados = acordos.filter(a => a.status === 'fechado');
        if (!acordos.length) return null;
        return (
          <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: '4px solid #10b981' }}>
            <div style={{ fontWeight: 700 }}>Acordos do Feirão</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
              O robô fecha o acordo com o cliente e manda o Pix da loja. Quando o Pix cair na conta, clique em "Pagamento recebido":
              o carnê do acordo é criado sozinho e as parcelas antigas são canceladas.
            </div>
            {esperando.map(a => {
              const venceu = a.expira_em && new Date(a.expira_em).getTime() < agora;
              return (
                <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 600 }}>{a.customers?.name || 'Cliente'} <span style={{ fontSize: 12, color: '#10b981' }}>· {TIPO[a.tipo || ''] || ''}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Esperando Pix de <b>{brl(a.pix_valor)}</b>
                      {a.tipo === 'entrada' ? ` (entrada) + ${(a.n_parcelas || 1) - 1}x de ${brl(a.valor_parcela)}` : ''}
                      {' '}· dívida {brl((a.valor_original || 0) + (a.valor_juros || 0))}
                      {a.aceito_em ? ` · aceito ${fmt(a.aceito_em)}` : ''}
                      {venceu ? <b style={{ color: '#f87171' }}> · prazo do Pix venceu (pode confirmar se o cliente pagou)</b> : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {a.customers?.name && <button style={btn('#94a3b8')} onClick={() => onVerCliente(a.customers!.name)}>Ver parcelas</button>}
                    <button style={btn('#22c55e')} disabled={fechando === a.id} onClick={() => pagamentoRecebido(a)}>{fechando === a.id ? 'Fechando...' : 'Pagamento recebido'}</button>
                    <button style={btn('#f87171')} onClick={() => cancelarAcordo(a)}>Cancelar acordo</button>
                  </div>
                </div>
              );
            })}
            {conversando.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                Oferta enviada, esperando o cliente escolher: {conversando.map(a => a.customers?.name || 'cliente').join(', ')}
              </div>
            )}
            {fechados.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                Fechados nos últimos 30 dias ({fechados.length}): {fechados.map(a => `${a.customers?.name || 'cliente'} (${TIPO[a.tipo || ''] || ''}, ${brl(a.valor_acordo)})`).join(' · ')}
              </div>
            )}
          </div>
        );
      })()}
      {lista.length === 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 20, color: 'var(--text-muted)' }}>Nenhuma resposta esperando a loja. 👍</div>
      )}
      {GRUPOS.map(g => {
        const itens = lista.filter(r => r.intencao === g.intencao);
        if (!itens.length) return null;
        return (
          <div key={g.intencao} className="card" style={{ padding: 20, marginBottom: 16, borderLeft: `4px solid ${g.cor}` }}>
            <div style={{ fontWeight: 700 }}>{g.titulo} ({itens.length})</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 12px' }}>{g.ajuda}</div>
            {itens.map(r => {
              const dias = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 864e5);
              return (
                <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 600 }}>{r.nome || fone(r.phone)} {!r.customer_id && <span style={{ fontSize: 11, color: '#f59e0b' }}>(telefone sem cadastro)</span>}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {fone(r.phone)} · {fmt(r.created_at)}{dias >= 2 && r.intencao === 'paguei' ? <b style={{ color: '#f87171' }}> · há {dias} dias</b> : ''}
                    </div>
                    {r.texto && <div style={{ fontSize: 13, marginTop: 2 }}>“{r.texto}”</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {r.nome && <button style={btn('#94a3b8')} onClick={() => onVerCliente(r.nome!)}>Ver parcelas</button>}
                    <button style={btn('#0ea5e9')} onClick={() => navigate('/mensagens')}>Mensagens</button>
                    {g.intencao === 'paguei' ? (<>
                      <button style={btn('#22c55e')} onClick={() => marcar(r, 'confirmado')}>Já dei baixa</button>
                      <button style={btn('#f87171')} onClick={() => marcar(r, 'nao_pago')}>Não pagou</button>
                    </>) : (
                      <button style={btn('#22c55e')} onClick={() => marcar(r, 'resolvido')}>Resolvido</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {parar.length > 0 && (
        <div className="card" style={{ padding: 20, borderLeft: '4px solid #64748b' }}>
          <div style={{ fontWeight: 700 }}>Pediram para PARAR (últimos 30 dias) ({parar.length})</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
            O cadastro foi marcado para não receber mensagens automáticas. A cobrança fica só por ligação ou no balcão.
          </div>
          {parar.map(r => (
            <div key={r.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              {r.nome || fone(r.phone)} · {fmt(r.created_at)}{!r.customer_id && <span style={{ color: '#f59e0b' }}> · telefone sem cadastro: marcar manualmente</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Conversa com o cliente dentro de "Respostas da cobrança" (23/11/2026, pedido do Carlos: organizar tudo nessa tela).
// Até 24h depois da última mensagem do cliente: resposta livre. Depois: ligar ou "Chamar de volta" (modelo aprovado).
// Nada é enviado sem a loja clicar. Quem pediu PARAR não recebe o chamado.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

const H24 = 24 * 3600e3;
const so8 = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-8);
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export interface ClienteConversa {
  nome: string; phone: string | null; customer_id: string | null;
  resposta_id?: string; acordo_id?: string; intencao?: string; pixValor?: number | null;
}
interface Msg { id: string; direcao: string; tipo: string; texto: string | null; status: string | null; created_at: string; enviado_por: string | null; }

async function erroDe(data: any, error: any) {
  let msg = data?.error || '';
  if (error && !msg) { try { msg = (await error.context?.json())?.error || error.message; } catch { msg = error.message; } }
  return msg as string;
}

// Mesmas contas do robô do Feirão (regras do Carlos): entrada = 1 parcela, até 4x, parcela mínima de R$ 100.
function textoParcelar(nome: string, o: any) {
  const original = Number(o.original || 0), atualizado = Math.round((original + Number(o.juros || 0)) * 100) / 100;
  const nE = Math.max(1, Math.min(4, Math.floor(original / 100))), nS = Math.max(1, Math.min(4, Math.floor(atualizado / 100)));
  const pE = Math.floor((original / nE) * 100) / 100, pS = Math.floor((atualizado / nS) * 100) / 100;
  const primeiro = nome.trim().split(/\s+/)[0];
  if (!o.qtd) return '';
  if (nE <= 1) return `Olá ${primeiro}! Pelo valor do seu débito (${brl(original)}), o acordo do Feirão Limpa Nome fica à vista: ${brl(Number(o.vista || 0))} no Pix. Podemos fechar assim?`;
  return `Olá ${primeiro}! Para parcelar seu débito no Feirão Limpa Nome:\n\n✅ COM ENTRADA (sem juros): entrada de ${brl(pE)} no Pix + ${nE - 1}x de ${brl(pE)} por mês. Total ${brl(original)}.\n\n📅 SEM ENTRADA (com juros): ${nS}x de ${brl(pS)}, a 1ª em 7 dias. Total ${brl(atualizado)}.\n\nQual você prefere?`;
}

export function BotaoConversa({ tenantId, cliente, estilo }: { tenantId: string; cliente: ClienteConversa; estilo: (cor: string) => React.CSSProperties }) {
  const [aberto, setAberto] = useState(false);
  return <>
    <button style={estilo('#0ea5e9')} onClick={() => setAberto(true)} disabled={!cliente.phone}>💬 Conversar</button>
    {aberto && <Conversa tenantId={tenantId} cliente={cliente} fechar={() => setAberto(false)} />}
  </>;
}

function Conversa({ tenantId, cliente, fechar }: { tenantId: string; cliente: ClienteConversa; fechar: () => void }) {
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [optOut, setOptOut] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const f8 = so8(cliente.phone);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('whatsapp_mensagens').select('id, direcao, tipo, texto, status, created_at, enviado_por')
      .eq('tenant_id', tenantId).like('phone', `%${f8}`).order('created_at', { ascending: false }).limit(40);
    setMsgs(((data as Msg[]) || []).reverse());
  }, [tenantId, f8]);

  useEffect(() => {
    carregar();
    if (cliente.customer_id) {
      supabase.from('customers').select('whatsapp_opt_out').eq('id', cliente.customer_id).eq('tenant_id', tenantId).maybeSingle()
        .then(({ data }) => setOptOut(!!(data as any)?.whatsapp_opt_out));
      if (cliente.intencao === 'parcelar') {
        supabase.rpc('cobranca_oferta', { p_tenant: tenantId, p_customer: cliente.customer_id }).then(({ data }) => {
          if (data) setTexto(t => t || textoParcelar(cliente.nome, data));
        });
      }
    }
  }, [carregar]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar]);

  const ultima = [...(msgs || [])].reverse().find(m => m.direcao === 'in');
  const dentro = !!ultima && Date.now() - new Date(ultima.created_at).getTime() < H24;
  const digitos = (cliente.phone || '').replace(/\D/g, '').replace(/^55/, '');

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke('whatsapp-manage', { body: { action: 'send_reply', phone: cliente.phone, text: t } });
    const msg = await erroDe(data, error);
    setEnviando(false);
    if (msg || (data as any)?.ok === false) { toast.error(msg || 'Não enviou.', { duration: 9000 }); carregar(); return; }
    toast.success('Mensagem enviada.'); setTexto(''); carregar();
  };
  const chamar = async () => {
    const oQue = cliente.acordo_id ? 'um lembrete do acordo' : 'um convite para continuar o atendimento';
    if (!window.confirm(`Enviar a ${cliente.nome} ${oQue} pelo WhatsApp?\n\nÉ uma mensagem aprovada pela Meta e pode ter custo. Só pode repetir depois de 3 dias.`)) return;
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke('whatsapp-manage', { body: {
      action: 'send_retomada', ...(cliente.acordo_id ? { acordo_id: cliente.acordo_id } : { resposta_id: cliente.resposta_id }) } });
    const msg = await erroDe(data, error);
    setEnviando(false);
    if (msg || (data as any)?.ok === false) { toast.error(msg || 'Não enviou.', { duration: 9000 }); carregar(); return; }
    toast.success('Cliente chamado. Quando responder, você pode conversar por aqui.'); carregar();
  };

  const bt: React.CSSProperties = { padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary, #fff)', cursor: 'pointer', fontSize: 13, fontWeight: 600, textDecoration: 'none' };
  return (
    <div role="dialog" aria-modal="true" aria-label={`Conversa com ${cliente.nome}`} onClick={fechar}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 16, gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160, fontWeight: 700 }}>{cliente.nome}</div>
          {digitos && <a href={`tel:+55${digitos}`} style={bt}>📞 Ligar</a>}
          <button style={bt} onClick={() => navigate('/mensagens')}>Abrir em Mensagens</button>
          <button style={bt} onClick={fechar} aria-label="Fechar">✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'rgba(0,0,0,.2)', borderRadius: 8 }}>
          {msgs === null && <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>}
          {msgs?.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Nenhuma mensagem com este número.</div>}
          {msgs?.map(m => (
            <div key={m.id} style={{ alignSelf: m.direcao === 'out' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div style={{ padding: '6px 10px', borderRadius: 10, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid var(--border)',
                background: m.direcao === 'out' ? 'rgba(37,211,102,.16)' : 'var(--bg-input)' }}>{(m.texto || `[${m.tipo}]`).replace(/^\[retomada\] /, '')}</div>
              <div style={{ fontSize: 10.5, color: m.status === 'failed' ? '#f87171' : 'var(--text-muted)', textAlign: m.direcao === 'out' ? 'right' : 'left' }}>
                {fmt(m.created_at)}{m.direcao === 'out' && m.enviado_por ? ` · ${m.enviado_por}` : ''}{m.status === 'failed' ? ' · não entregue' : ''}
              </div>
            </div>))}
          <div ref={fimRef} />
        </div>
        {msgs !== null && (dentro ? <>
          <div style={{ fontSize: 12, color: '#22c55e' }}>✓ Pode responder: o cliente escreveu nas últimas 24h.</div>
          <textarea className="form-input" rows={texto.length > 120 ? 6 : 2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva a resposta..." />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={!texto.trim() || enviando} onClick={enviar}>{enviando ? 'Enviando...' : 'Enviar'}</button>
          </div>
        </> : optOut ? (
          <div style={{ fontSize: 13, color: '#f59e0b' }}>Este cliente pediu para não receber mensagens. Fale por ligação ou no balcão.</div>
        ) : <>
          <div style={{ fontSize: 13, color: '#f59e0b' }}>Passou de 24h desde a última mensagem do cliente: o WhatsApp só aceita ligação ou uma mensagem aprovada.</div>
          {cliente.intencao === 'parcelar' && texto && <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>Condições para falar na ligação:{'\n'}{texto}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={enviando} onClick={chamar}>{enviando ? 'Enviando...' : cliente.acordo_id ? '🔔 Lembrar do Pix' : '🔔 Chamar de volta'}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

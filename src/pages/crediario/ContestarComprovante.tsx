// Botao "Contestar" na lista "Disseram que pagaram" (Respostas da cobranca) - pedido do Carlos, 24/11/2026.
// Caso real: cliente mandou o comprovante de um Pix feito por outra pessoa (que ja tinha sido usado para pagar
// a parcela dessa outra pessoa). O botao abre uma janela com o motivo, monta a mensagem para o cliente (editavel),
// manda pelo WhatsApp oficial (whatsapp-manage send_reply) e marca a resposta como "nao pagou" (a cobranca volta).
import { useState } from 'react';
import ReactDOM from 'react-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);

const MOTIVOS: [string, string][] = [
  ['outra_pessoa', 'Pix de outra pessoa, já usado para pagar outra parcela'],
  ['nao_caiu', 'O Pix não apareceu na conta da loja'],
  ['valor_menor', 'O valor pago é menor que a parcela'],
  ['outro', 'Outro motivo (escrevo a mensagem)'],
];

function montarTexto(motivo: string, nome: string, parcela: { amount: number; due_date: string } | null) {
  const primeiro = (nome || '').trim().split(/\s+/)[0];
  const oi = `Olá${primeiro ? ', ' + primeiro : ''}!`;
  const sua = parcela ? `A sua parcela de ${brl(parcela.amount)} (vencimento ${dataBR(parcela.due_date)}) continua em aberto.` : 'A sua parcela continua em aberto.';
  const fim = 'Se quiser, mandamos o Pix para você pagar. Qualquer dúvida, é só responder aqui.';
  if (motivo === 'outra_pessoa') return `${oi} Recebemos o comprovante, mas esse Pix foi feito por outra pessoa e já foi usado para pagar a parcela dela. ${sua} ${fim}`;
  if (motivo === 'nao_caiu') return `${oi} Recebemos o comprovante, mas esse pagamento não apareceu na conta da loja. Pode conferir com o seu banco? ${sua} ${fim}`;
  if (motivo === 'valor_menor') return `${oi} Recebemos o comprovante, obrigado! Mas o valor pago é menor que o da parcela. ${sua} Pode completar a diferença? ${fim}`;
  return `${oi} `;
}

export function BotaoContestar({ tenantId, estilo, cliente, onContestado }: {
  tenantId: string; estilo: (cor: string) => React.CSSProperties;
  cliente: { nome: string; phone: string; customer_id: string | null };
  onContestado: () => Promise<void> | void;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('outra_pessoa');
  const [texto, setTexto] = useState('');
  const [parcela, setParcela] = useState<{ amount: number; due_date: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const abrir = async () => {
    let p: { amount: number; due_date: string } | null = null;
    if (cliente.customer_id) {
      // Proxima parcela em aberto do cliente (para a mensagem dizer o valor e o vencimento certos)
      const { data } = await supabase.from('crediario_parcelas').select('amount, due_date, crediario!inner(customer_id)')
        .eq('tenant_id', tenantId).eq('crediario.customer_id', cliente.customer_id)
        .not('status', 'in', '(pago,cancelado)').order('due_date').limit(1);
      const r = (data as any[] | null)?.[0];
      if (r?.due_date) p = { amount: Number(r.amount) || 0, due_date: String(r.due_date) };
    }
    setParcela(p); setMotivo('outra_pessoa'); setTexto(montarTexto('outra_pessoa', cliente.nome, p)); setAberto(true);
  };

  const trocarMotivo = (m: string) => { setMotivo(m); setTexto(montarTexto(m, cliente.nome, parcela)); };

  const enviar = async () => {
    const t = texto.trim();
    if (enviando || t.length < 15) { if (t.length < 15) toast.error('Escreva a mensagem para o cliente.'); return; }
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke('whatsapp-manage', { body: { action: 'send_reply', phone: cliente.phone, text: t } });
    let msg = (data as any)?.error || '';
    if (error && !msg) { try { msg = (await (error as any).context?.json())?.error || error.message; } catch { msg = error.message; } }
    if (msg || (data as any)?.ok === false) {
      setEnviando(false);
      if (!window.confirm(`A mensagem NÃO foi enviada:\n${msg || 'erro desconhecido'}\n\nMarcar como "não pagou" mesmo assim (a cobrança automática volta)? Você pode avisar o cliente por ligação.`)) return;
    } else toast.success('Contestação enviada ao cliente.');
    await onContestado();
    setEnviando(false); setAberto(false);
  };

  const janela = aberto && ReactDOM.createPortal(
    <div onClick={() => !enviando && setAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 520, padding: 20, background: 'var(--bg-card, #111827)' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Contestar comprovante · {cliente.nome}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          A mensagem vai pelo WhatsApp oficial e o cliente volta para a cobrança automática (igual a "Não pagou").
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Motivo</div>
        {MOTIVOS.map(([k, t]) => (
          <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
            <input type="radio" checked={motivo === k} onChange={() => trocarMotivo(k)} /> {t}
          </label>
        ))}
        <div style={{ fontSize: 13, fontWeight: 600, margin: '12px 0 6px' }}>Mensagem para o cliente (pode editar)</div>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={6}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'inherit', fontSize: 13, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-secondary" disabled={enviando} onClick={() => setAberto(false)}>Cancelar</button>
          <button className="btn btn-primary" disabled={enviando} onClick={enviar} style={{ background: '#f97316', borderColor: '#f97316' }}>
            {enviando ? 'Enviando...' : 'Enviar e voltar a cobrança'}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root') || document.body);

  return (<>
    <button style={estilo('#f97316')} onClick={abrir}>Contestar comprovante</button>
    {janela}
  </>);
}

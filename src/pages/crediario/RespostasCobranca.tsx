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
    supabase.from('cobranca_respostas').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'pendente').then(({ count }) => setN(count || 0));
  }, [tenantId, ativo]);
  return n;
}

export default function RespostasCobranca({ tenantId, onVerCliente }: { tenantId: string; onVerCliente: (nome: string) => void }) {
  const { user } = useAuth() as any;
  const navigate = useNavigate();
  const [lista, setLista] = useState<Resposta[]>([]);
  const [parar, setParar] = useState<Resposta[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const desde = new Date(Date.now() - 30 * 864e5).toISOString();
    const [{ data: p }, { data: pr }] = await Promise.all([
      supabase.from('cobranca_respostas').select('*').eq('tenant_id', tenantId).eq('status', 'pendente').order('created_at'),
      supabase.from('cobranca_respostas').select('*').eq('tenant_id', tenantId).eq('intencao', 'parar')
        .gte('created_at', desde).order('created_at', { ascending: false }),
    ]);
    setLista((p as Resposta[]) || []);
    setParar((pr as Resposta[]) || []);
    setCarregando(false);
  }, [tenantId]);
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

// Cobranca nova - Fase 2, Quem ligar hoje (11/11/2026): ate 15 clientes por dia, por prioridade (funcao
// cobranca_ligar_hoje), com o resultado da ligacao anotado em cobranca_ligacoes. Quem foi anotado sai da lista por 7 dias.
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Linha { customer_id: string; nome: string; telefone: string; prioridade: number; motivo: string; divida: number; dias_max: number;
  ultima_ligacao: string | null; ultima_ligacao_em: string | null }
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fone = (t: string) => { let d = t.replace(/\D/g, ''); if (d.startsWith('55') && d.length >= 12) d = d.slice(2); return d; };
const COR: Record<number, string> = { 1: '#ef4444', 2: '#f97316', 3: '#8b5cf6', 4: '#0ea5e9', 5: '#64748b' };
const RESULTADOS: { v: string; label: string; cor: string }[] = [
  { v: 'vai_pagar', label: 'Vai pagar', cor: '#22c55e' },
  { v: 'promessa', label: 'Prometeu (data)', cor: '#0ea5e9' },
  { v: 'nao_atendeu', label: 'Não atendeu', cor: '#94a3b8' },
  { v: 'numero_errado', label: 'Número errado', cor: '#f59e0b' },
  { v: 'recusou', label: 'Recusou', cor: '#f87171' },
];

export default function LigarHoje({ tenantId }: { tenantId: string }) {
  const { user } = useAuth() as any;
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [data, setData] = useState('');

  const carregar = useCallback(() => {
    supabase.rpc('cobranca_ligar_hoje', { p_tenant: tenantId, p_limite: 15 }).then(({ data, error }) => {
      if (error) setErro(error.message); else setLinhas((data as Linha[]) || []);
    });
  }, [tenantId]);
  useEffect(() => { carregar(); }, [carregar]);

  const anotar = async (l: Linha, resultado: string) => {
    if (resultado === 'promessa' && !/^\d{4}-\d{2}-\d{2}$/.test(data)) { toast.error('Informe a data que o cliente prometeu pagar.'); return; }
    const { error } = await supabase.from('cobranca_ligacoes').insert([{ tenant_id: tenantId, customer_id: l.customer_id, resultado,
      promessa_data: resultado === 'promessa' ? data : null, obs: obs.trim() || null, criado_por: user?.name || user?.email || 'loja' }]);
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return; }
    if (resultado === 'numero_errado') {
      // Vai para a lista "Corrigir telefones".
      await supabase.from('customers').update({ telefone_sem_whatsapp_em: new Date().toISOString() }).eq('id', l.customer_id).eq('tenant_id', tenantId);
    }
    toast.success('Anotado!');
    setAberto(null); setObs(''); setData('');
    setLinhas(ls => (ls || []).filter(x => x.customer_id !== l.customer_id));
  };

  if (erro) return <div className="card" style={{ padding: 20, color: '#f87171' }}>Não foi possível carregar: {erro}</div>;
  if (!linhas) return <div className="empty-state"><p>Carregando...</p></div>;
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Até 15 clientes por dia, por ordem de prioridade. Ligue, anote o resultado e o cliente sai da lista por 7 dias.
        Promessa que vencer sem pagamento volta para o topo.
      </div>
      {linhas.length === 0 && <div className="card" style={{ padding: 20, color: 'var(--text-muted)' }}>Ninguém para ligar hoje. 👍</div>}
      {linhas.map(l => {
        const d = fone(l.telefone);
        return (
          <div key={l.customer_id} className="card" style={{ padding: 14, marginBottom: 10, borderLeft: `4px solid ${COR[l.prioridade]}` }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700 }}>{l.nome}</div>
                <div style={{ fontSize: 12, color: COR[l.prioridade], fontWeight: 600 }}>{l.motivo}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Deve {brl(l.divida)} · {l.dias_max} dias de atraso
                  {l.ultima_ligacao ? ` · última ligação: ${l.ultima_ligacao} (${l.ultima_ligacao_em?.split('-').reverse().join('/')})` : ''}
                </div>
              </div>
              <a className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} href={`tel:+55${d}`}>📞 ({d.slice(0, 2)}) {d.slice(2, -4)}-{d.slice(-4)}</a>
              <a className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} href={`https://wa.me/55${d}`} target="_blank" rel="noreferrer">WhatsApp</a>
              <button className="btn" style={{ padding: '6px 12px', fontSize: 13, background: '#6366f1', color: '#fff' }}
                onClick={() => { setAberto(aberto === l.customer_id ? null : l.customer_id); setObs(''); setData(''); }}>Anotar resultado</button>
            </div>
            {aberto === l.customer_id && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="form-input" style={{ flex: 1, minWidth: 200 }} placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} />
                <input type="date" className="form-input" style={{ width: 160 }} value={data} onChange={e => setData(e.target.value)} title="Data prometida" />
                {RESULTADOS.map(r => (
                  <button key={r.v} onClick={() => anotar(l, r.v)} style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${r.cor}`, background: 'transparent', color: r.cor }}>{r.label}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

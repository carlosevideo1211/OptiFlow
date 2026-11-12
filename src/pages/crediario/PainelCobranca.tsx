// Cobranca nova - Fase 1, etapa 1 (11/11/2026): painel de resultado na tela Crediario.
// Modulo separado: so le os numeros da funcao cobranca_painel (supabase/migrations/20261111_cobranca_painel.sql).
// Aparece so nas lojas com tenants.cobranca_nova = true (interruptor por loja; hoje so a Castanho).
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatBRL } from '../../types/index';

export function useCobrancaNova(tenantId?: string | null): boolean {
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    if (!tenantId) return;
    supabase.from('tenants').select('cobranca_nova').eq('id', tenantId).maybeSingle()
      .then(({ data }) => setAtivo((data as any)?.cobranca_nova === true));
  }, [tenantId]);
  return ativo;
}

interface Mes { mes: string; base: number; pagas: number; base_outras: number; pagas_outras: number }
interface Faixa { faixa: string; minha: boolean; qtd: number; valor: number }
interface Rec { faixa: string; qtd: number; valor: number }
interface Feirao {
  ofertas: number; nao_entregues: number; esperando_escolha: number; esperando_pix: number; fechados: number;
  fechados_tipo: Record<string, number>; valor_acordos: number; divida_negociada: number; recebido: number;
  por_grupo: { grupo: string; ofertas: number; fechados: number; recebido: number }[];
  retorno: { cobrados: number; pagaram: number; cobrados_outras: number; pagaram_outras: number };
}
const META_FEIRAO = { valor: 5000, acordos: 30 };
interface Painel { hoje: string; outras_lojas: number; meses: Mes[]; recuperado: Rec[]; faixas: Faixa[] }

const FAIXAS = ['1-30', '31-90', '91-365', '+1 ano'];
const FAIXA_LABEL: Record<string, string> = {
  '1-30': '1 a 30 dias', '31-90': '31 a 90 dias', '91-365': '91 dias a 1 ano', '+1 ano': 'Mais de 1 ano',
};
const FAIXA_COR: Record<string, string> = { '1-30': '#facc15', '31-90': '#fb923c', '91-365': '#f87171', '+1 ano': '#b91c1c' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const META = 60;

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const nomeMes = (iso: string) => { const [y, m] = iso.split('-'); return `${MESES[parseInt(m, 10) - 1]}/${y.slice(2)}`; };

export default function PainelCobranca({ tenantId }: { tenantId: string }) {
  const [dados, setDados] = useState<Painel | null>(null);
  const [erro, setErro] = useState('');
  const [feirao, setFeirao] = useState<Feirao | null>(null);

  useEffect(() => {
    let vivo = true;
    supabase.rpc('cobranca_painel', { p_tenant: tenantId }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) setErro(error.message); else setDados(data as Painel);
    });
    supabase.rpc('cobranca_painel_feirao', { p_tenant: tenantId }).then(({ data }) => { if (vivo && data) setFeirao(data as Feirao); });
    return () => { vivo = false; };
  }, [tenantId]);

  if (erro) return <div className="card" style={{ padding: 20, color: '#f87171' }}>Não foi possível carregar o painel: {erro}</div>;
  if (!dados) return <div className="empty-state"><p>Carregando...</p></div>;

  const meses = dados.meses;
  const mesAtual = dados.hoje.slice(0, 7);
  const fechados = meses.filter(m => m.mes.slice(0, 7) !== mesAtual && m.base > 0);
  const ultimo = fechados[fechados.length - 1];
  const atual = meses.find(m => m.mes.slice(0, 7) === mesAtual);

  const recTotal = dados.recuperado.reduce((s, r) => s + Number(r.valor), 0);
  const recQtd = dados.recuperado.reduce((s, r) => s + Number(r.qtd), 0);

  const minhas = dados.faixas.filter(f => f.minha);
  const outras = dados.faixas.filter(f => !f.minha);
  const totMinha = minhas.reduce((s, f) => s + Number(f.valor), 0);
  const totOutras = outras.reduce((s, f) => s + Number(f.valor), 0);
  const faixa = (lista: Faixa[], k: string) => lista.find(f => f.faixa === k);

  const Card = ({ titulo, cor, children }: { titulo: string; cor: string; children: React.ReactNode }) => (
    <div className="card" style={{ padding: 20, borderTop: `3px solid ${cor}` }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{titulo}</div>
      {children}
    </div>
  );

  const pUlt = ultimo ? pct(ultimo.pagas, ultimo.base) : null;
  const pUltOutras = ultimo ? pct(ultimo.pagas_outras, ultimo.base_outras) : null;
  const pAtual = atual ? pct(atual.pagas, atual.base) : null;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginBottom: 20 }}>
        <Card titulo={`Pagas até 5 dias após o vencimento · ${ultimo ? nomeMes(ultimo.mes) : '-'}`} cor="#6366f1">
          <div style={{ fontSize: 30, fontWeight: 800, color: '#6366f1' }}>{pUlt ?? '-'}%</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {ultimo ? `${ultimo.pagas} de ${ultimo.base} parcelas` : ''} · meta {META}% em fev/2027
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Outras óticas: {pUltOutras ?? '-'}%</div>
        </Card>
        <Card titulo={`Mês atual (${nomeMes(dados.hoje)}) · parcial`} cor="#a78bfa">
          <div style={{ fontSize: 30, fontWeight: 800, color: '#a78bfa' }}>{pAtual ?? '-'}%</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {atual ? `${atual.pagas} de ${atual.base} parcelas (vencidas há 5+ dias)` : 'Ainda sem parcelas com 5 dias de vencidas'}
          </div>
        </Card>
        <Card titulo={`Recuperado em ${nomeMes(dados.hoje)} (atraso de 30+ dias)`} cor="#22c55e">
          <div style={{ fontSize: 30, fontWeight: 800, color: '#22c55e' }}>{formatBRL(recTotal)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {recQtd} parcelas · {['31-90', '91-365', '+1 ano'].map(k => {
              const r = dados.recuperado.find(x => x.faixa === k);
              return `${FAIXA_LABEL[k]}: ${formatBRL(Number(r?.valor || 0))}`;
            }).join(' · ')}
          </div>
        </Card>
      </div>

      {feirao && (() => {
        const ret = feirao.retorno; const pR = pct(ret.pagaram, ret.cobrados); const pRo = pct(ret.pagaram_outras, ret.cobrados_outras);
        const barra = (v: number, meta: number, cor: string) => (
          <div style={{ height: 10, background: 'rgba(255,255,255,.06)', borderRadius: 5, marginTop: 6 }}>
            <div style={{ width: `${Math.min(100, (v / meta) * 100)}%`, height: '100%', background: cor, borderRadius: 5 }} />
          </div>);
        const TIPO: Record<string, string> = { vista: 'à vista', entrada: 'com entrada', sem_entrada: 'sem entrada' };
        return (
          <div className="card" style={{ padding: 20, marginBottom: 20, borderTop: '3px solid #10b981' }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Feirão Limpa Nome (até 31/12)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Recebido pelos acordos</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{formatBRL(Number(feirao.recebido))}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>meta {formatBRL(META_FEIRAO.valor)}</div>
                {barra(Number(feirao.recebido), META_FEIRAO.valor, '#10b981')}
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Acordos fechados</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#6366f1' }}>{feirao.fechados}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>meta {META_FEIRAO.acordos}{feirao.fechados ? ' · ' + Object.entries(feirao.fechados_tipo).map(([t, n]) => `${n} ${TIPO[t] || t}`).join(', ') : ''}</div>
                {barra(feirao.fechados, META_FEIRAO.acordos, '#6366f1')}
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ofertas enviadas</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{feirao.ofertas}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {feirao.esperando_escolha} esperando o cliente · {feirao.esperando_pix} esperando o Pix · {feirao.nao_entregues} não entregues (telefone)
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Dívida negociada nos acordos</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{formatBRL(Number(feirao.divida_negociada))}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>valor dos acordos: {formatBRL(Number(feirao.valor_acordos))}</div>
              </div>
            </div>
            {feirao.por_grupo.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                Por grupo: {feirao.por_grupo.map(g => `${g.grupo}: ${g.ofertas} ofertas, ${g.fechados} acordos, ${formatBRL(Number(g.recebido))}`).join(' · ')}
              </div>
            )}
            <div style={{ fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
              <b>Retorno da cobrança de atraso (90 dias):</b> {pR ?? '-'}% dos {ret.cobrados} clientes cobrados (30+ dias de atraso) pagaram alguma
              parcela depois da mensagem · outras óticas {pRo ?? '-'}% · meta 15% em fev/2027
            </div>
          </div>
        );
      })()}

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Pagas até 5 dias após o vencimento, mês a mês</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Das parcelas que ainda estavam em aberto na véspera do vencimento, quantas foram pagas até 5 dias depois.
          Comparação com as outras {dados.outras_lojas} óticas do OptiFlow somadas.
        </div>
        {meses.map(m => {
          const p = pct(m.pagas, m.base); const po = pct(m.pagas_outras, m.base_outras);
          return (
            <div key={m.mes} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{nomeMes(m.mes)}{m.mes.slice(0, 7) === mesAtual ? '*' : ''}</div>
              <div>
                <div style={{ position: 'relative', height: 14, background: 'rgba(255,255,255,.06)', borderRadius: 7 }}>
                  <div style={{ width: `${p ?? 0}%`, height: '100%', background: '#6366f1', borderRadius: 7 }} />
                  <div title={`Meta ${META}%`} style={{ position: 'absolute', left: `${META}%`, top: -2, bottom: -2, width: 2, background: '#22c55e' }} />
                  {po != null && <div title={`Outras óticas ${po}%`} style={{ position: 'absolute', left: `calc(${po}% - 1px)`, top: -2, bottom: -2, width: 2, background: '#94a3b8' }} />}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {m.pagas} de {m.base} parcelas{m.base < 50 && m.mes.slice(0, 7) === mesAtual ? ' (poucas parcelas ainda)' : ''} · outras óticas {po ?? '-'}%
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, textAlign: 'right', color: (p ?? 0) >= META ? '#22c55e' : '#a5b4fc' }}>{p ?? '-'}%</div>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          <span style={{ color: '#22c55e' }}>▮</span> meta {META}% · <span style={{ color: '#94a3b8' }}>▮</span> outras óticas · * mês em andamento, só vencimentos de 5+ dias atrás.
          O dia do pagamento é o dia da baixa no sistema: baixa atrasada faz o número cair.
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Dívida vencida em aberto hoje, por tempo de atraso</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Total {formatBRL(totMinha)} · valor original das parcelas, sem juros.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          {FAIXAS.map(k => {
            const f = faixa(minhas, k); const o = faixa(outras, k);
            const pM = pct(Number(f?.valor || 0), totMinha); const pO = pct(Number(o?.valor || 0), totOutras);
            return (
              <div key={k} style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)', borderLeft: `4px solid ${FAIXA_COR[k]}` }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{FAIXA_LABEL[k]}</div>
                <div style={{ fontSize: 20, fontWeight: 800, margin: '4px 0' }}>{formatBRL(Number(f?.valor || 0))}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f?.qtd || 0} parcelas · {pM ?? 0}% da dívida</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Outras óticas: {pO ?? 0}% da dívida delas</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

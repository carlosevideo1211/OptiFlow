// Caixa do dia (Fase 5 do visual novo, 26/10/2026): uma tela só para abrir, acompanhar e fechar o caixa.
// Movimento do dia = financial_transactions PAGOS no dia (pela data local de paid_at): vendas, entradas, parcelas de
// carnê, outras receitas e as saídas (despesas/sangrias). A tabela caixa_dia guarda só o que a loja informa:
// troco inicial, dinheiro contado e o resultado do fechamento. Usado no Financeiro e na aba Caixa do Dia de Vendas.
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { formatBRL } from '../types/index';
import { abrirDocumentoImprimivel, getCabecalhoLoja, printBaseStyle } from '../utils/printDoc';
import { toLocalDateStr } from '../pages/crediario/crediarioTypes';

const FORMAS: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', cartao: 'Cartão',
  transferencia: 'Transferência', boleto: 'Boleto', crediario: 'Não informada', '': 'Não informada',
};
const FORMAS_SAIDA = ['dinheiro', 'pix', 'debito', 'transferencia'];

interface Mov { id: string; hora: string; descricao: string; valor: number; forma: string; tipo: 'entrada' | 'saida'; origem: string; }
interface Caixa {
  id?: string; troco_inicial: number; dinheiro_contado: number | null; dinheiro_esperado: number | null; diferenca: number | null;
  obs: string | null; fechado_em: string | null; fechado_por: string | null; aberto_por: string | null;
}

function somarDias(s: string, n: number) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return toLocalDateStr(d); }
const br = (s: string) => s.split('-').reverse().join('/');
const num = (v: string) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };

export default function CaixaDoDia({ onMudou }: { onMudou?: () => void } = {}) {
  const { tenantId, user } = useAuth();
  const operador = (user as any)?.full_name || 'Operador';
  const [data, setData] = useState(toLocalDateStr());
  const [movs, setMovs] = useState<Mov[]>([]);
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [troco, setTroco] = useState('');
  const [contado, setContado] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [saida, setSaida] = useState({ descricao: '', valor: '', forma: 'dinheiro' });
  const [loja, setLoja] = useState<any>(null);

  useEffect(() => {
    if (tenantId) supabase.from('store_settings').select('*').eq('tenant_id', tenantId).maybeSingle().then(({ data }) => setLoja(data));
  }, [tenantId]);

  const carregar = async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      const rows = await fetchAllRows<any>((rf, rt) => supabase.from('financial_transactions')
        .select('id, type, description, category, amount, paid_at, payment_method, crediario_parcela_id')
        .eq('tenant_id', tenantId).eq('status', 'pago')
        .gte('paid_at', somarDias(data, -1)).lte('paid_at', somarDias(data, 1) + 'T23:59:59')
        .order('paid_at').range(rf, rt));
      const out: Mov[] = [];
      for (const r of rows) {
        if (!r.paid_at) continue;
        const d = new Date(r.paid_at);
        if (toLocalDateStr(d) !== data) continue;
        const desc = String(r.description || '');
        const entrada = r.type === 'receita';
        let origem = entrada ? 'Outras entradas' : 'Saída';
        if (entrada) {
          if (r.crediario_parcela_id || /^parcela/i.test(desc) || /^credi[aá]rio venda/i.test(desc)) origem = 'Carnê (parcela)';
          else if (/^Venda #/.test(desc)) origem = 'Venda';
          else if (/consulta/i.test(r.category || '') || /consulta|exame/i.test(desc)) origem = 'Consulta';
        }
        out.push({ id: r.id, hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), descricao: desc,
          valor: Number(r.amount) || 0, forma: r.payment_method || '', tipo: entrada ? 'entrada' : 'saida', origem });
      }
      setMovs(out);
      const { data: cx } = await supabase.from('caixa_dia').select('*').eq('tenant_id', tenantId).eq('data', data).maybeSingle();
      setCaixa(cx as Caixa | null);
      setTroco(cx ? String(cx.troco_inicial ?? 0).replace('.', ',') : '');
      setContado(cx?.dinheiro_contado != null ? String(cx.dinheiro_contado).replace('.', ',') : '');
      setObs(cx?.obs || '');
    } finally { setCarregando(false); }
  };
  useEffect(() => { carregar(); }, [tenantId, data]);  // eslint-disable-line react-hooks/exhaustive-deps

  const entradas = movs.filter(m => m.tipo === 'entrada');
  const saidas = movs.filter(m => m.tipo === 'saida');
  const totEntradas = entradas.reduce((s, m) => s + m.valor, 0);
  const totSaidas = saidas.reduce((s, m) => s + m.valor, 0);
  const porForma = useMemo(() => {
    const mapa: Record<string, { entradas: number; saidas: number }> = {};
    for (const m of movs) {
      const k = FORMAS[m.forma] !== undefined ? m.forma : '';
      mapa[k] = mapa[k] || { entradas: 0, saidas: 0 };
      if (m.tipo === 'entrada') mapa[k].entradas += m.valor; else mapa[k].saidas += m.valor;
    }
    return Object.entries(mapa).sort((a, b) => (b[1].entradas - b[1].saidas) - (a[1].entradas - a[1].saidas));
  }, [movs]);
  const porOrigem = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const m of entradas) mapa[m.origem] = (mapa[m.origem] || 0) + m.valor;
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [entradas]);
  const dinEntradas = entradas.filter(m => m.forma === 'dinheiro').reduce((s, m) => s + m.valor, 0);
  const dinSaidas = saidas.filter(m => m.forma === 'dinheiro').reduce((s, m) => s + m.valor, 0);
  const esperado = num(troco) + dinEntradas - dinSaidas;
  const diferenca = contado.trim() ? num(contado) - esperado : null;
  const fechado = !!caixa?.fechado_em;

  const salvarCaixa = async (fechar: boolean) => {
    if (!tenantId || salvando) return;
    if (fechar && !contado.trim()) { toast.error('Conte o dinheiro da gaveta e informe o valor para fechar o caixa'); return; }
    setSalvando(true);
    try {
      const payload: any = {
        tenant_id: tenantId, data, troco_inicial: num(troco), obs: obs || null,
        aberto_por: caixa?.aberto_por || operador,
      };
      if (fechar) Object.assign(payload, {
        dinheiro_contado: num(contado), dinheiro_esperado: esperado, diferenca: num(contado) - esperado,
        total_entradas: totEntradas, total_saidas: totSaidas, fechado_em: new Date().toISOString(), fechado_por: operador,
      });
      const { error } = await supabase.from('caixa_dia').upsert(payload, { onConflict: 'tenant_id,data' });
      if (error) throw error;
      toast.success(fechar ? 'Caixa fechado!' : 'Troco inicial salvo');
      await carregar();
      if (fechar) imprimir(num(contado));
    } catch (e: any) { toast.error('Não foi possível salvar o caixa: ' + (e?.message || 'erro')); }
    finally { setSalvando(false); }
  };

  const lancarSaida = async () => {
    const valor = num(saida.valor);
    if (!saida.descricao.trim() || valor <= 0) { toast.error('Informe a descrição e o valor da saída'); return; }
    if (data !== toLocalDateStr()) { toast.error('Saídas só podem ser lançadas no caixa de hoje'); return; }
    const { error } = await supabase.from('financial_transactions').insert([{
      tenant_id: tenantId, type: 'despesa', description: saida.descricao.trim(), category: 'Saída de caixa',
      amount: valor, due_date: data, paid_at: new Date().toISOString(), status: 'pago', payment_method: saida.forma,
    }]);
    if (error) { toast.error('Erro ao lançar a saída: ' + error.message); return; }
    toast.success('Saída lançada');
    setSaida({ descricao: '', valor: '', forma: 'dinheiro' });
    carregar();
    onMudou?.();
  };

  const imprimir = (contadoValor?: number) => {
    const cont = contadoValor ?? (caixa?.dinheiro_contado ?? null);
    const dif = cont != null ? cont - esperado : null;
    const linhaForma = porForma.map(([f, v]) => '<tr><td>' + (FORMAS[f] || f) + '</td><td style="text-align:right">' + formatBRL(v.entradas) + '</td><td style="text-align:right">' + formatBRL(v.saidas) + '</td></tr>').join('');
    const linhaOrigem = porOrigem.map(([o, v]) => '<tr><td>' + o + '</td><td style="text-align:right">' + formatBRL(v) + '</td></tr>').join('');
    const linhaMov = movs.map(m => '<tr><td>' + m.hora + '</td><td>' + m.descricao + '</td><td>' + (FORMAS[m.forma] || m.forma) + '</td><td style="text-align:right;color:' + (m.tipo === 'entrada' ? '#15803d' : '#b91c1c') + '">' + (m.tipo === 'entrada' ? '' : '- ') + formatBRL(m.valor) + '</td></tr>').join('');
    const body = getCabecalhoLoja(loja, 'Fechamento de caixa — ' + br(data))
      + '<table><tr><th>Entradas</th><th>Saídas</th><th>Saldo do dia</th></tr><tr><td>' + formatBRL(totEntradas) + '</td><td>' + formatBRL(totSaidas) + '</td><td><b>' + formatBRL(totEntradas - totSaidas) + '</b></td></tr></table>'
      + '<h3>Dinheiro na gaveta</h3><table>'
      + '<tr><td>Troco inicial</td><td style="text-align:right">' + formatBRL(num(troco)) + '</td></tr>'
      + '<tr><td>+ Entradas em dinheiro</td><td style="text-align:right">' + formatBRL(dinEntradas) + '</td></tr>'
      + '<tr><td>− Saídas em dinheiro</td><td style="text-align:right">' + formatBRL(dinSaidas) + '</td></tr>'
      + '<tr><td><b>Esperado</b></td><td style="text-align:right"><b>' + formatBRL(esperado) + '</b></td></tr>'
      + (cont != null ? '<tr><td>Contado</td><td style="text-align:right">' + formatBRL(cont) + '</td></tr><tr><td><b>Diferença</b></td><td style="text-align:right"><b>' + (dif! >= 0 ? '' : '- ') + formatBRL(Math.abs(dif!)) + (Math.abs(dif!) < 0.01 ? ' (bateu)' : dif! > 0 ? ' (sobrou)' : ' (faltou)') + '</b></td></tr>' : '')
      + '</table>'
      + '<h3>Por forma de pagamento</h3><table><tr><th>Forma</th><th>Entradas</th><th>Saídas</th></tr>' + linhaForma + '</table>'
      + '<h3>Entradas por origem</h3><table>' + linhaOrigem + '</table>'
      + '<h3>Movimentos</h3><table><tr><th>Hora</th><th>Descrição</th><th>Forma</th><th>Valor</th></tr>' + linhaMov + '</table>'
      + (obs ? '<p><b>Obs.:</b> ' + obs + '</p>' : '')
      + '<p style="margin-top:40px">______________________________<br/>' + (caixa?.fechado_por || operador) + ' — responsável pelo caixa</p>';
    abrirDocumentoImprimivel({
      title: 'Fechamento de caixa', filename: 'fechamento-caixa-' + data + '.pdf',
      css: printBaseStyle + 'h3{margin:14px 0 4px;font-size:13px}',
      body, windowFeatures: 'width=840,height=900',
    });
  };

  const card = (l: string, v: string, c: string, sub?: string) => (
    <div className="card" style={{ padding: 14, borderTop: '3px solid ' + c }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Dia do caixa</label>
        <input type="date" className="form-input" style={{ width: 160 }} value={data} max={toLocalDateStr()} onChange={e => e.target.value && setData(e.target.value)} />
        {fechado
          ? <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 12, background: 'rgba(34,197,94,.15)', color: '#22c55e' }}>
              ✓ Fechado às {new Date(caixa!.fechado_em!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} por {caixa!.fechado_por}
            </span>
          : <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 12, background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>Caixa aberto</span>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={() => imprimir()}>🖨️ Imprimir</button>
      </div>

      {carregando ? <div className="empty-state"><p>Carregando...</p></div> : (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 16 }}>
          {card('Entradas do dia', formatBRL(totEntradas), '#22c55e', entradas.length + ' lançamento(s)')}
          {card('Saídas do dia', formatBRL(totSaidas), '#f87171', saidas.length + ' lançamento(s)')}
          {card('Saldo do dia', formatBRL(totEntradas - totSaidas), '#6366f1')}
          {card('Dinheiro esperado na gaveta', formatBRL(esperado), '#f59e0b', 'troco + entradas − saídas em dinheiro')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>💵 Dinheiro na gaveta</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label">Troco inicial (R$)</label>
                <input className="form-input" inputMode="decimal" value={troco} onChange={e => setTroco(e.target.value)} placeholder="0,00" disabled={fechado} />
              </div>
              <div>
                <label className="form-label">Dinheiro contado (R$)</label>
                <input className="form-input" inputMode="decimal" value={contado} onChange={e => setContado(e.target.value)} placeholder="contar ao fechar" />
              </div>
            </div>
            <div style={{ fontSize: 13, margin: '10px 0', lineHeight: 1.7 }}>
              Troco {formatBRL(num(troco))} + entradas em dinheiro {formatBRL(dinEntradas)} − saídas em dinheiro {formatBRL(dinSaidas)} = <b>{formatBRL(esperado)}</b>
              {diferenca != null && (
                <div style={{ fontWeight: 700, color: Math.abs(diferenca) < 0.01 ? '#22c55e' : diferenca > 0 ? '#06b6d4' : '#f87171' }}>
                  {Math.abs(diferenca) < 0.01 ? '✓ Bateu certinho' : diferenca > 0 ? 'Sobrou ' + formatBRL(diferenca) : 'Faltou ' + formatBRL(-diferenca)}
                </div>
              )}
            </div>
            <input className="form-input" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)" style={{ marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!fechado && <button className="btn btn-secondary" disabled={salvando} onClick={() => salvarCaixa(false)}>Salvar troco</button>}
              <button className="btn btn-primary" disabled={salvando} onClick={() => salvarCaixa(true)}>{fechado ? 'Refazer fechamento' : '🔒 Fechar caixa'}</button>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Por forma de pagamento</div>
            {porForma.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum movimento neste dia.</div> : (
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead><tr><th style={{ textAlign: 'left' }}>Forma</th><th style={{ textAlign: 'right' }}>Entradas</th><th style={{ textAlign: 'right' }}>Saídas</th></tr></thead>
                <tbody>{porForma.map(([f, v]) => (
                  <tr key={f}><td>{FORMAS[f] || f}</td><td style={{ textAlign: 'right', color: '#22c55e' }}>{formatBRL(v.entradas)}</td><td style={{ textAlign: 'right', color: '#f87171' }}>{v.saidas ? formatBRL(v.saidas) : '—'}</td></tr>
                ))}</tbody>
              </table>
            )}
            {porOrigem.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {porOrigem.map(([o, v]) => <span key={o}>{o}: <b style={{ color: 'var(--text)' }}>{formatBRL(v)}</b></span>)}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>➖ Lançar saída (sangria, despesa paga do caixa)</div>
            <input className="form-input" value={saida.descricao} onChange={e => setSaida(s => ({ ...s, descricao: e.target.value }))} placeholder="Descrição (ex.: compra de café, sangria)" style={{ marginBottom: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input className="form-input" inputMode="decimal" value={saida.valor} onChange={e => setSaida(s => ({ ...s, valor: e.target.value }))} placeholder="Valor (R$)" />
              <select className="form-input" value={saida.forma} onChange={e => setSaida(s => ({ ...s, forma: e.target.value }))}>
                {FORMAS_SAIDA.map(f => <option key={f} value={f}>{FORMAS[f]}</option>)}
              </select>
            </div>
            <button className="btn btn-secondary" style={{ color: '#f87171' }} onClick={lancarSaida} disabled={data !== toLocalDateStr()}>Lançar saída</button>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Hora</th><th>Descrição</th><th>Origem</th><th>Forma</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {movs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Nenhum movimento em {br(data)}.</td></tr>}
                {movs.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 13 }}>{m.hora}</td>
                    <td style={{ fontSize: 13 }}>{m.descricao}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.origem}</td>
                    <td style={{ fontSize: 13 }}>{FORMAS[m.forma] || m.forma}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: m.tipo === 'entrada' ? '#22c55e' : '#f87171' }}>{m.tipo === 'entrada' ? '+' : '−'}{formatBRL(m.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}
    </div>
  );
}

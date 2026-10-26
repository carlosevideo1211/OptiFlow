// Relatório de Recebimentos (pedido do Carlos em 25/10/2026): tudo o que ENTROU de dinheiro de verdade na ótica
// no período — vendas à vista, entradas de vendas no crediário, parcelas recebidas, consultas e outras entradas.
// Fonte: financial_transactions com type='receita' e status='pago' (o que está "a receber" não entra), pela DATA EM
// QUE O DINHEIRO ENTROU (paid_at, no horário local). Até 25/10/2026 a entrada das vendas no crediário era gravada com
// forma "crediario" (o sistema não perguntava como foi paga): aparece como "Não informada (entrada)".
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchAllRows } from '../../lib/fetchAll';
import { formatBRL } from '../../types/index';
import { abrirDocumentoImprimivel, getCabecalhoLoja, printBaseStyle, type DadosLoja } from '../../utils/printDoc';
import { toLocalDateStr } from '../crediario/crediarioTypes';
import { norm } from '../../utils/normalize';

const FORMAS: Record<string, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', credito: 'Cartão de crédito', debito: 'Cartão de débito', cartao: 'Cartão',
  transferencia: 'Transferência', boleto: 'Boleto', crediario: 'Não informada (entrada)', '': 'Não informada',
};
const ORIGENS = ['Venda à vista', 'Entrada de venda no crediário', 'Pagamento de carnê (parcela)', 'Consultas', 'Outras entradas'];

interface Receb { id: string; data: string; hora: string; descricao: string; valor: number; forma: string; origem: string; }

function dataLocal(iso: string) {
  const d = new Date(iso);
  return { data: toLocalDateStr(d), hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
}
function somarDias(s: string, n: number) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return toLocalDateStr(d); }
function br(s: string) { return s.split('-').reverse().join('/'); }

export default function RecebimentosTab({ loja }: { loja: DadosLoja | null }) {
  const { tenantId } = useAuth();
  const hoje = toLocalDateStr();
  const [de, setDe] = useState(hoje.slice(0, 8) + '01');
  const [ate, setAte] = useState(hoje);
  const [itens, setItens] = useState<Receb[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroForma, setFiltroForma] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');

  const carregar = async () => {
    if (!tenantId) return;
    setCarregando(true);
    try {
      // paid_at é gravado em UTC: busca com 1 dia de folga e filtra pela data local.
      const rows = await fetchAllRows<any>((rf, rt) => supabase.from('financial_transactions')
        .select('id, description, category, amount, paid_at, payment_method, crediario_parcela_id')
        .eq('tenant_id', tenantId).eq('type', 'receita').eq('status', 'pago')
        .gte('paid_at', somarDias(de, -1)).lte('paid_at', somarDias(ate, 1) + 'T23:59:59')
        .order('paid_at').range(rf, rt));
      // Forma de pagamento das vendas citadas (para separar venda à vista de entrada do crediário).
      const nums = Array.from(new Set(rows.map(r => (String(r.description || '').match(/^Venda #(\d+)/) || [])[1]).filter(Boolean))).map(Number);
      const formaVenda: Record<number, string> = {};
      for (let i = 0; i < nums.length; i += 400) {
        const { data } = await supabase.from('sales').select('sale_number, payment_method').eq('tenant_id', tenantId).in('sale_number', nums.slice(i, i + 400));
        (data || []).forEach((s: any) => { formaVenda[s.sale_number] = s.payment_method; });
      }
      const out: Receb[] = [];
      for (const r of rows) {
        if (!r.paid_at) continue;
        const { data, hora } = dataLocal(r.paid_at);
        if (data < de || data > ate) continue;
        const desc = String(r.description || '');
        const num = Number((desc.match(/^Venda #(\d+)/) || [])[1] || 0);
        let origem = 'Outras entradas';
        if (r.crediario_parcela_id || /^parcela/i.test(desc) || /^credi[aá]rio venda/i.test(desc)) origem = 'Pagamento de carnê (parcela)';
        else if (num) origem = (formaVenda[num] === 'crediario' || r.payment_method === 'crediario') ? 'Entrada de venda no crediário' : 'Venda à vista';
        else if (/consulta/i.test(r.category || '') || /consulta|exame/i.test(desc)) origem = 'Consultas';
        out.push({ id: r.id, data, hora, descricao: desc, valor: Number(r.amount) || 0, forma: r.payment_method || '', origem });
      }
      setItens(out);
    } finally { setCarregando(false); }
  };
  useEffect(() => { carregar(); }, [tenantId, de, ate]);  // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const q = norm(busca);
    return itens.filter(i => (!filtroForma || i.forma === filtroForma) && (!filtroOrigem || i.origem === filtroOrigem) &&
      (!q || norm(i.descricao).includes(q)));
  }, [itens, busca, filtroForma, filtroOrigem]);
  const total = lista.reduce((s, i) => s + i.valor, 0);
  const agrupar = (k: (i: Receb) => string) => {
    const m: Record<string, { n: number; v: number }> = {};
    lista.forEach(i => { const c = k(i); m[c] = m[c] || { n: 0, v: 0 }; m[c].n++; m[c].v += i.valor; });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  };
  const porForma = agrupar(i => i.forma);
  const porOrigem = agrupar(i => i.origem);
  const porDia = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    lista.forEach(i => { m[i.data] = m[i.data] || {}; m[i.data][i.forma] = (m[i.data][i.forma] || 0) + i.valor; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [lista]);
  const formasDia = Array.from(new Set(lista.map(i => i.forma)));
  const nomeForma = (f: string) => FORMAS[f] ?? f;

  const periodo = (tipo: string) => {
    if (tipo === 'hoje') { setDe(hoje); setAte(hoje); }
    if (tipo === 'mes') { setDe(hoje.slice(0, 8) + '01'); setAte(hoje); }
    if (tipo === 'passado') {
      const d = new Date(hoje.slice(0, 8) + '01T12:00:00'); d.setDate(0);
      const fim = toLocalDateStr(d); setDe(fim.slice(0, 8) + '01'); setAte(fim);
    }
  };

  const exportarCSV = () => {
    const linhas = [['Data', 'Hora', 'Descrição', 'Origem', 'Forma', 'Valor']].concat(
      lista.map(i => [br(i.data), i.hora, i.descricao, i.origem, nomeForma(i.forma), i.valor.toFixed(2).replace('.', ',')]));
    const csv = linhas.map(l => l.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `recebimentos_${de}_a_${ate}.csv`; a.click();
  };

  const imprimir = () => {
    const tab = (cab: string[], linhas: string[][], rodape?: string[]) => `<table><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map(l => `<tr>${l.map((c, j) => `<td${j === l.length - 1 ? ' style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      ${rodape ? `<tfoot><tr>${rodape.map((c, j) => `<td${j === rodape.length - 1 ? ' style="text-align:right"' : ''}><b>${c}</b></td>`).join('')}</tr></tfoot>` : ''}</table>`;
    const body = `${getCabecalhoLoja(loja)}
      <h2 style="text-align:center;margin:6px 0">Relatório de Recebimentos</h2>
      <p style="text-align:center;margin:0 0 12px">Período: ${br(de)} a ${br(ate)} · Somente valores efetivamente recebidos</p>
      <h3>Total recebido: ${formatBRL(total)} (${lista.length} recebimentos)</h3>
      <h3>Por forma de pagamento</h3>${tab(['Forma', 'Qtd.', 'Valor'], porForma.map(([f, x]) => [nomeForma(f), String(x.n), formatBRL(x.v)]), ['Total', String(lista.length), formatBRL(total)])}
      <h3>Por origem</h3>${tab(['Origem', 'Qtd.', 'Valor'], porOrigem.map(([o, x]) => [o, String(x.n), formatBRL(x.v)]), ['Total', String(lista.length), formatBRL(total)])}
      <h3>Por dia</h3>${tab(['Dia', ...formasDia.map(nomeForma), 'Total'], porDia.map(([d, m]) => [br(d), ...formasDia.map(f => m[f] ? formatBRL(m[f]) : '—'), formatBRL(Object.values(m).reduce((a, b) => a + b, 0))]))}
      <h3>Lançamentos</h3>${tab(['Data', 'Descrição', 'Origem', 'Forma', 'Valor'], lista.map(i => [`${br(i.data)} ${i.hora}`, i.descricao, i.origem, nomeForma(i.forma), formatBRL(i.valor)]), ['', '', '', 'Total', formatBRL(total)])}`;
    abrirDocumentoImprimivel({ title: 'Recebimentos', filename: `recebimentos_${de}_a_${ate}.pdf`,
      css: printBaseStyle + 'table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#eef1f8}h3{margin:14px 0 6px;font-size:13px}',
      body });
  };

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 } as const;
  const inp = { padding: '7px 10px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' } as const;

  return (
    <div>
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontWeight: 700 }}>💰 Recebimentos</span>
        <input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} />
        <span>a</span>
        <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} />
        {[['hoje', 'Hoje'], ['mes', 'Este mês'], ['passado', 'Mês passado']].map(([k, t]) =>
          <button key={k} className="btn btn-secondary" onClick={() => periodo(k)}>{t}</button>)}
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={exportarCSV} disabled={!lista.length}>Excel (CSV)</button>
        <button className="btn btn-primary" onClick={imprimir} disabled={!lista.length}>Imprimir / PDF</button>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '-6px 0 12px' }}>
        Só entra o dinheiro que <b>já foi recebido</b>, na data em que entrou: vendas à vista, entradas do crediário, parcelas pagas,
        consultas e outras entradas lançadas no Financeiro. Parcelas a vencer não aparecem aqui.
      </div>
      {carregando ? <div style={{ padding: 30, textAlign: 'center' }}>Carregando…</div> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 14 }}>
          <div style={{ ...card, borderTop: '3px solid #22c55e' }}><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>TOTAL RECEBIDO</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#22c55e' }}>{formatBRL(total)}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lista.length} recebimentos</div></div>
          {porForma.slice(0, 5).map(([f, x]) => (
            <div key={f} style={card}><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{nomeForma(f).toUpperCase()}</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{formatBRL(x.v)}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{x.n} · {total ? Math.round(100 * x.v / total) : 0}%</div></div>))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12, marginBottom: 14 }}>
          <div style={card}><b>Por origem</b>
            {porOrigem.map(([o, x]) => <div key={o} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={() => setFiltroOrigem(filtroOrigem === o ? '' : o)}><span>{filtroOrigem === o ? '🔎 ' : ''}{o} <span style={{ color: 'var(--text-muted)' }}>({x.n})</span></span><b>{formatBRL(x.v)}</b></div>)}</div>
          <div style={card}><b>Por dia</b>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>{porDia.map(([d, m]) => <div key={d} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{br(d)}</span><b>{formatBRL(Object.values(m).reduce((a, b) => a + b, 0))}</b></div>)}</div></div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input placeholder="Buscar cliente ou descrição…" value={busca} onChange={e => setBusca(e.target.value)} style={{ ...inp, flex: 1, minWidth: 200 }} />
            <select value={filtroForma} onChange={e => setFiltroForma(e.target.value)} style={inp}>
              <option value="">Todas as formas</option>{Array.from(new Set(itens.map(i => i.forma))).map(f => <option key={f} value={f}>{nomeForma(f)}</option>)}</select>
            <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)} style={inp}>
              <option value="">Todas as origens</option>{ORIGENS.map(o => <option key={o}>{o}</option>)}</select>
          </div>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th style={{ padding: 6 }}>Data</th><th>Descrição</th><th>Origem</th><th>Forma</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
            <tbody>{lista.map(i => <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{br(i.data)} {i.hora}</td><td>{i.descricao}</td><td>{i.origem}</td>
              <td style={{ color: i.forma === 'crediario' || !i.forma ? '#f59e0b' : undefined }}>{nomeForma(i.forma)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatBRL(i.valor)}</td></tr>)}</tbody>
          </table>{!lista.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum recebimento no período.</div>}</div>
        </div>
      </>}
    </div>
  );
}

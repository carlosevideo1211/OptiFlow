// Estoque de lentes por grau + lentes mais vendidas, média e giro (26/10/2026, pedidos do Carlos).
// Tabelas no banco: lentes_grade_produto (quais lentes e o tipo vs/mf), lentes_grade (quantidade de cada grau) e
// lentes_grade_mov (movimentos). A baixa pela OS é automática no banco (trigger sync_lentes_os): 1 lente por olho,
// a partir de lentes_grade_inicio. Vendas e giro vêm da função lentes_mais_vendidas (todas as OS com lente de grau).
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import toast from 'react-hot-toast';
import { toLocalDateStr } from './crediario/crediarioTypes';
import { abrirDocumentoImprimivel } from '../utils/printDoc';

interface ProdGrade { product_id: string; tipo: 'vs' | 'mf'; nome: string; }
interface Cel { id?: string; esf: number; cil: number; adicao: number; olho: string; quantidade: number; conferir: boolean; }
interface Vendida { mes: string; produto: string; tipo: string; esf: number; cil: number; adicao: number; olho: string; lentes: number; }
type Modo = 'entrada' | 'saida' | 'contagem';
type Visao = 'estoque' | 'vendas' | 'cobertura';

const CILS = [0, -0.25, -0.5, -0.75, -1, -1.25, -1.5, -1.75, -2];
const ADDS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const MESES_GIRO = 6;
const faixa = (de: number, ate: number) => { const r: number[] = []; const p = de <= ate ? 0.25 : -0.25; for (let v = de; p > 0 ? v <= ate + 1e-9 : v >= ate - 1e-9; v += p) r.push(Math.round(v * 100) / 100); return r; };
const g = (v: number, sinal = true) => (sinal && v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',');
const chave = (e: number, c: number, a: number, o: string) => `${e.toFixed(2)}|${c.toFixed(2)}|${a.toFixed(2)}|${o}`;
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m: string) => NOMES_MES[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);
const descGrau = (tipo: string, e: number, c: number, a: number, o: string) =>
  tipo === 'mf' ? `esf ${g(e)} · adição ${g(a, false)} · ${o}` : `esf ${g(e)} · cil ${g(c)}`;

// Período dos últimos N meses (incluindo o atual): [primeiro dia, hoje].
function periodoMeses(n: number) {
  const hoje = toLocalDateStr();
  const d = new Date(hoje.slice(0, 8) + '01T12:00:00'); d.setMonth(d.getMonth() - (n - 1));
  return { de: toLocalDateStr(d), ate: hoje };
}
async function buscarVendas(de: string, ate: string): Promise<Vendida[]> {
  const { data, error } = await supabase.rpc('lentes_mais_vendidas', { p_de: de, p_ate: ate });
  if (error) { toast.error(error.message); return []; }
  return (data || []).map((r: any) => ({ ...r, esf: +r.esf, cil: +r.cil, adicao: +r.adicao, lentes: +r.lentes }));
}

export default function LentesGradePage() {
  const { tenantId } = useAuth();
  const location = useLocation();
  // Vindo do botao "Ver por grau" da tela Estoque: abre direto naquela lente.
  const produtoPedido = (location.state as any)?.produtoId as string | undefined;
  const [aba, setAba] = useState<'estoque' | 'vendidas' | 'giro' | 'movimentos'>('estoque');
  const [prods, setProds] = useState<ProdGrade[]>([]);
  const [prodId, setProdId] = useState('');
  const [cels, setCels] = useState<Record<string, Cel>>({});
  const [carregando, setCarregando] = useState(true);
  const [soConferir, setSoConferir] = useState(false);
  const [inicio, setInicio] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>('entrada');
  const [visao, setVisao] = useState<Visao>('estoque');
  const [vendas6, setVendas6] = useState<Vendida[]>([]);

  const prod = prods.find(p => p.product_id === prodId);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase.from('lentes_grade_produto').select('product_id, tipo').eq('tenant_id', tenantId);
      const ids = (data || []).map((r: any) => r.product_id);
      const { data: ps } = ids.length ? await supabase.from('products').select('id, name').in('id', ids) : { data: [] as any[] };
      const nomes: Record<string, string> = {}; (ps || []).forEach((p: any) => { nomes[p.id] = p.name; });
      const lista = (data || []).map((r: any) => ({ product_id: r.product_id, tipo: r.tipo, nome: nomes[r.product_id] || '?' }))
        .sort((a: ProdGrade, b: ProdGrade) => a.nome.localeCompare(b.nome));
      setProds(lista);
      if (lista.length && !prodId) setProdId(lista.some((x: ProdGrade) => x.product_id === produtoPedido) ? produtoPedido! : lista[0].product_id);
      const { data: ini } = await supabase.from('lentes_grade_inicio').select('inicio').eq('tenant_id', tenantId).maybeSingle();
      setInicio(ini?.inicio || null);
      if (!lista.length) setCarregando(false);
      const p = periodoMeses(MESES_GIRO);
      setVendas6(await buscarVendas(p.de, p.ate));
    })();
  }, [tenantId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const carregar = async () => {
    if (!tenantId || !prodId) return;
    setCarregando(true);
    const rows = await fetchAllRows<any>((rf, rt) => supabase.from('lentes_grade').select('id, esf, cil, adicao, olho, quantidade, conferir')
      .eq('tenant_id', tenantId).eq('product_id', prodId).range(rf, rt));
    const m: Record<string, Cel> = {};
    rows.forEach(r => { const c = { ...r, esf: +r.esf, cil: +r.cil, adicao: +r.adicao }; m[chave(c.esf, c.cil, c.adicao, c.olho)] = c; });
    setCels(m); setCarregando(false);
  };
  useEffect(() => { carregar(); }, [prodId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // vendas dos últimos 6 meses deste produto, por grau
  const vendidasGrau = useMemo(() => {
    const m: Record<string, number> = {};
    vendas6.filter(v => v.produto === prod?.nome).forEach(v => { const k = chave(v.esf, v.cil, v.adicao, v.olho); m[k] = (m[k] || 0) + v.lentes; });
    return m;
  }, [vendas6, prod]);

  const lancar = async (esf: number, cil: number, adicao: number, olho: string) => {
    const atual = cels[chave(esf, cil, adicao, olho)];
    const q0 = atual?.quantidade ?? 0;
    const desc = `${prod?.nome} — ${descGrau(prod?.tipo || 'vs', esf, cil, adicao, olho === 'R' ? 'direito (R)' : 'esquerdo (L)')}\nTem agora: ${q0}`;
    const pergunta = modo === 'entrada' ? 'Quantas lentes ENTRARAM (chegaram)?' : modo === 'saida' ? 'Quantas lentes SAÍRAM (venda sem OS, quebra, devolução ao laboratório)?' : 'Quantidade CONTADA na prateleira agora:';
    const txt = window.prompt(`${desc}\n\n${pergunta}${atual?.conferir ? '\n(esta casa estava marcada para conferir)' : ''}`, modo === 'contagem' ? String(q0) : '1');
    if (txt === null) return;
    const n = parseInt(txt, 10);
    if (Number.isNaN(n) || n < 0) { toast.error('Digite um número inteiro (0 ou mais).'); return; }
    let motivo = 'ajuste', obs = '';
    if (modo === 'saida') {
      const m = window.prompt('Motivo da saída (opcional): venda sem OS, quebra, devolução…', 'venda sem OS');
      if (m === null) return;
      obs = m.trim().slice(0, 80); motivo = 'saida';
    }
    const nova = modo === 'entrada' ? q0 + n : modo === 'saida' ? q0 - n : n;
    const delta = nova - q0;
    if (modo !== 'contagem' && !delta) return;
    const { error } = await supabase.from('lentes_grade').upsert({ tenant_id: tenantId, product_id: prodId, esf, cil, adicao, olho, quantidade: nova,
      conferir: modo === 'contagem' ? false : !!atual?.conferir, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,product_id,esf,cil,adicao,olho' });
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    if (delta) await supabase.from('lentes_grade_mov').insert({ tenant_id: tenantId, product_id: prodId, esf, cil, adicao, olho, delta,
      motivo: modo === 'entrada' ? 'entrada' : motivo, obs: modo === 'contagem' ? 'Contagem na prateleira' : obs });
    toast.success(modo === 'entrada' ? `+${n} entrada ✓` : modo === 'saida' ? `−${n} saída ✓` : 'Contagem salva ✓');
    carregar();
  };

  const ligarBaixa = async () => {
    if (!window.confirm('Ligar a baixa automática? A partir de agora, toda OS (que não seja orçamento) com estas lentes tira 1 lente por olho do grau da receita. Se a OS for cancelada ou excluída, a lente volta.')) return;
    const agora = new Date().toISOString();
    const { error } = await supabase.from('lentes_grade_inicio').upsert({ tenant_id: tenantId, inicio: agora });
    if (error) { toast.error(error.message); return; }
    setInicio(agora); toast.success('Baixa automática ligada ✓');
  };

  const valor = (e: number, c: number, a: number, o: string) => cels[chave(e, c, a, o)];
  const media = (k: string) => (vendidasGrau[k] || 0) / MESES_GIRO;
  const celula = (e: number, c: number, a: number, o: string) => {
    const k = chave(e, c, a, o), v = cels[k];
    const q = v?.quantidade ?? null;
    const key = o + a + c;
    if (soConferir && !v?.conferir) return <td key={key} style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }} />;
    let txt: any = q === null ? <span style={{ opacity: .25 }}>·</span> : q;
    let cor = q === null ? 'transparent' : q <= 0 ? 'rgba(239,68,68,.25)' : q === 1 ? 'rgba(245,158,11,.22)' : 'transparent';
    if (visao === 'vendas') {
      const vend = vendidasGrau[k] || 0;
      txt = vend || <span style={{ opacity: .25 }}>0</span>;
      cor = vend >= 6 ? 'rgba(34,197,94,.45)' : vend >= 3 ? 'rgba(34,197,94,.28)' : vend >= 1 ? 'rgba(34,197,94,.13)' : (q ?? 0) > 0 ? 'rgba(148,163,184,.15)' : 'transparent';
    } else if (visao === 'cobertura') {
      const md = media(k), est = Math.max(0, q ?? 0);
      if (!md) { txt = est ? '∞' : <span style={{ opacity: .25 }}>·</span>; cor = est ? 'rgba(148,163,184,.18)' : 'transparent'; }
      else { const meses = est / md; txt = meses < 10 ? meses.toFixed(1).replace('.', ',') : Math.round(meses); cor = meses < 1 ? 'rgba(239,68,68,.3)' : meses < 2 ? 'rgba(245,158,11,.25)' : 'rgba(34,197,94,.15)'; }
    }
    return <td key={key} onClick={() => lancar(e, c, a, o)}
      title={`${descGrau(prod?.tipo || 'vs', e, c, a, o)}\nEstoque: ${q ?? 0} · vendidas em ${MESES_GIRO} meses: ${vendidasGrau[k] || 0}`}
      style={{ border: '1px solid var(--border)', textAlign: 'center', cursor: 'pointer', padding: '4px 2px', minWidth: 34, background: cor, fontWeight: 700,
        outline: v?.conferir ? '2px solid #eab308' : undefined, outlineOffset: -2 }}>{txt}{v?.conferir && visao === 'estoque' ? <sup style={{ color: '#eab308' }}>?</sup> : null}</td>;
  };
  const th = { border: '1px solid var(--border)', padding: '4px 6px', fontSize: 11.5, background: 'var(--bg-input)', whiteSpace: 'nowrap' } as const;
  const somaLinha = (pares: [number, number, number, string][]) => pares.reduce((s, [e, c, a, o]) => {
    const k = chave(e, c, a, o);
    return s + (visao === 'vendas' ? (vendidasGrau[k] || 0) : Math.max(0, cels[k]?.quantidade || 0));
  }, 0);

  const tabelaVS = (titulo: string, esfs: number[]) => (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, margin: '6px 0' }}>{titulo}</div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr><th style={th}>ESF \ CIL</th>{CILS.map(c => <th key={c} style={th}>{g(c)}</th>)}<th style={th}>Total</th></tr></thead>
        <tbody>{esfs.map(e => <tr key={e}><th style={th}>{g(e)}</th>{CILS.map(c => celula(e, c, 0, ''))}
          <td style={{ ...th, textAlign: 'right' }}>{visao === 'cobertura' ? '' : somaLinha(CILS.map(c => [e, c, 0, ''] as [number, number, number, string]))}</td></tr>)}</tbody>
      </table></div>);
  const tabelaMF = () => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr><th style={th} rowSpan={2}>ESF</th>{ADDS.map(a => <th key={a} style={th} colSpan={2}>Adição {g(a, false)}</th>)}<th style={th} rowSpan={2}>Total</th></tr>
          <tr>{ADDS.map(a => ['R', 'L'].map(o => <th key={a + o} style={th}>{o}</th>))}</tr></thead>
        <tbody>{faixa(0, 3).map(e => <tr key={e}><th style={th}>{g(e)}</th>{ADDS.map(a => ['R', 'L'].map(o => celula(e, 0, a, o)))}
          <td style={{ ...th, textAlign: 'right' }}>{visao === 'cobertura' ? '' : somaLinha(ADDS.flatMap(a => ['R', 'L'].map(o => [e, 0, a, o] as [number, number, number, string])))}</td></tr>)}</tbody>
      </table></div>);

  // Impressão igual às folhas da loja (com as quantidades atuais ou em branco para contagem)
  const imprimir = (emBranco: boolean) => {
    if (!prod) return;
    const cel = (e: number, c: number, a: number, o: string) => { if (emBranco) return '<td></td>'; const q = cels[chave(e, c, a, o)]?.quantidade; return `<td>${q === undefined || q === null ? '' : q}</td>`; };
    const titulo = prod.nome.toUpperCase() + (emBranco ? ' — CONTAGEM' : ` — ${new Date().toLocaleDateString('pt-BR')}`);
    let html = '';
    if (prod.tipo === 'vs') {
      const tab = (nomeT: string, esfs: number[]) => `<table><thead><tr><th colspan="10">${titulo}</th></tr><tr><th colspan="10">${nomeT}</th></tr>
        <tr><th>DIOP</th>${CILS.map(c => `<th>${g(c)}</th>`).join('')}</tr></thead>
        <tbody>${esfs.map(e => `<tr><th>${g(e)}</th>${CILS.map(c => cel(e, c, 0, '')).join('')}</tr>`).join('')}</tbody></table>`;
      html = `<div class="print-page">${tab('ESF. 0,00 A +6,00 ATÉ CIL. 2,00', faixa(0, 6))}</div><div class="print-page">${tab('ESF. −0,25 A −6,00 ATÉ CIL. 2,00', faixa(-0.25, -6))}</div>`;
    } else {
      html = `<div class="print-page"><table><thead><tr><th colspan="19">${titulo}</th></tr><tr><th colspan="19">ADIÇÕES</th></tr>
        <tr><th rowspan="2">ESF.</th>${ADDS.map(a => `<th colspan="2">${g(a, false)}</th>`).join('')}</tr>
        <tr>${ADDS.map(() => '<th>R</th><th>L</th>').join('')}</tr></thead>
        <tbody>${faixa(0, 3).map(e => `<tr><th>${g(e)}</th>${ADDS.map(a => cel(e, 0, a, 'R') + cel(e, 0, a, 'L')).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    abrirDocumentoImprimivel({ title: titulo, filename: `${prod.nome.replace(/\s+/g, '_')}${emBranco ? '_contagem' : ''}.pdf`,
      css: `body{font-family:Arial,sans-serif;color:#000} table{border-collapse:collapse;width:100%;margin:0 auto}
        th,td{border:1px solid #000;text-align:center;font-size:${prod.tipo === 'vs' ? 12 : 11}px;height:${prod.tipo === 'vs' ? 24 : 30}px;padding:1px 3px}
        thead th{background:#eee;font-weight:bold} tbody th{background:#f6f6f6;width:60px}`,
      body: html });
  };

  const total = Object.values(cels).reduce((s, c) => s + Math.max(0, c.quantidade), 0);
  const zerados = Object.values(cels).filter(c => c.quantidade <= 0).length;
  const conferir = Object.values(cels).filter(c => c.conferir).length;
  const vendidas6Prod = Object.values(vendidasGrau).reduce((s, v) => s + v, 0);
  const btnAba = (k: typeof aba, t: string) => <button onClick={() => setAba(k)} style={{ padding: '9px 16px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: aba === k ? '#6366f1' : 'transparent', color: aba === k ? 'white' : 'var(--text-muted)', borderRadius: '6px 6px 0 0' }}>{t}</button>;
  const seg = <T extends string>(atual: T, set: (v: T) => void, ops: [T, string][]) => (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {ops.map(([k, t]) => <button key={k} onClick={() => set(k)} style={{ padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        background: atual === k ? '#6366f1' : 'transparent', color: atual === k ? '#fff' : 'var(--text-muted)' }}>{t}</button>)}
    </div>);

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>👓 Lentes por grau</h1>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Estoque de cada grau, as lentes que mais saem e as que estão paradas.{' '}
        {inicio ? <>Baixa automática pelas OS <b style={{ color: '#22c55e' }}>ligada</b> desde {new Date(inicio).toLocaleString('pt-BR')}.</>
          : <><b style={{ color: '#f59e0b' }}>Baixa automática desligada.</b> <button className="btn btn-primary" style={{ marginLeft: 8, padding: '4px 10px' }} onClick={ligarBaixa}>Ligar</button></>}
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {btnAba('estoque', 'Estoque por grau')}{btnAba('vendidas', 'Mais vendidas e média')}{btnAba('giro', 'Giro e reposição')}{btnAba('movimentos', 'Movimentos')}
      </div>
      {(aba === 'estoque' || aba === 'giro') && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {prods.map(p => <button key={p.product_id} className={p.product_id === prodId ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setProdId(p.product_id)}>{p.nome}</button>)}
      </div>}
      {aba === 'estoque' && <>
        {!prods.length && !carregando && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma lente com estoque por grau ainda.</div>}
        {prod && <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Ao clicar numa casa:</span>
            {seg<Modo>(modo, setModo, [['entrada', '➕ Entrada'], ['saida', '➖ Saída'], ['contagem', '🔢 Corrigir contagem']])}
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', marginLeft: 8 }}>Mostrar:</span>
            {seg<Visao>(visao, setVisao, [['estoque', 'Estoque'], ['vendas', `Vendidas (${MESES_GIRO} meses)`], ['cobertura', 'Meses de estoque']])}
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={() => imprimir(false)}>🖨️ Imprimir</button>
            <button className="btn btn-secondary" onClick={() => imprimir(true)}>🖨️ Folha de contagem</button>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
            <span><b>{total}</b> lentes em estoque</span><span style={{ color: '#ef4444' }}><b>{zerados}</b> graus zerados</span>
            <span style={{ color: '#22c55e' }}><b>{vendidas6Prod}</b> vendidas em {MESES_GIRO} meses (média {(vendidas6Prod / MESES_GIRO).toFixed(1).replace('.', ',')}/mês)</span>
            <label style={{ color: '#eab308', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={soConferir} onChange={e => setSoConferir(e.target.checked)} /> <b>{conferir}</b> para conferir</label>
            <span style={{ color: 'var(--text-muted)' }}>{prod.tipo === 'mf' ? 'Contada por lado: R = direito, L = esquerdo.' : 'Contada por peça (cada olho usa 1 lente).'}</span>
          </div>
          {carregando ? <div style={{ padding: 20 }}>Carregando…</div> : prod.tipo === 'vs'
            ? <>{tabelaVS('Esférico positivo (0,00 a +6,00)', faixa(0, 6))}{tabelaVS('Esférico negativo (−0,25 a −6,00)', faixa(-0.25, -6))}</>
            : tabelaMF()}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            {visao === 'estoque' && <><span style={{ background: 'rgba(239,68,68,.25)', padding: '0 6px' }}>vermelho</span> = acabou · <span style={{ background: 'rgba(245,158,11,.22)', padding: '0 6px' }}>laranja</span> = só 1 · <span style={{ outline: '2px solid #eab308', padding: '0 6px' }}>?</span> = número ilegível na folha, conferir na prateleira</>}
            {visao === 'vendas' && <>Quantas lentes de cada grau saíram nas OS dos últimos {MESES_GIRO} meses. <span style={{ background: 'rgba(34,197,94,.45)', padding: '0 6px' }}>verde forte</span> = sai muito · <span style={{ background: 'rgba(148,163,184,.15)', padding: '0 6px' }}>cinza</span> = tem estoque e não saiu nenhuma.</>}
            {visao === 'cobertura' && <>Para quantos meses o estoque dá, no ritmo de venda dos últimos {MESES_GIRO} meses. <span style={{ background: 'rgba(239,68,68,.3)', padding: '0 6px' }}>vermelho</span> = acaba em menos de 1 mês · ∞ = parado (não vende).</>}
          </div>
        </div>}
      </>}
      {aba === 'vendidas' && <MaisVendidas />}
      {aba === 'giro' && prod && <Giro prod={prod} cels={cels} vendidas={vendidasGrau} />}
      {aba === 'movimentos' && <Movimentos prods={prods} />}
    </div>
  );
}

function Giro({ prod, cels, vendidas }: { prod: ProdGrade; cels: Record<string, Cel>; vendidas: Record<string, number> }) {
  const lista = Object.values(cels).map(c => {
    const k = chave(c.esf, c.cil, c.adicao, c.olho), v = vendidas[k] || 0, md = v / MESES_GIRO;
    return { ...c, vendidas: v, media: md, meses: md ? Math.max(0, c.quantidade) / md : Infinity };
  });
  const parados = lista.filter(c => c.quantidade > 0 && c.vendidas === 0).sort((a, b) => b.quantidade - a.quantidade);
  const pouco = lista.filter(c => c.quantidade > 0 && c.vendidas > 0 && c.vendidas <= 2 && c.meses > 6).sort((a, b) => b.meses - a.meses);
  const repor = lista.filter(c => c.vendidas >= 2 && c.meses < 2).sort((a, b) => a.meses - b.meses);
  const pecasParadas = parados.reduce((s, c) => s + c.quantidade, 0);
  const desc = (c: Cel) => descGrau(prod.tipo, c.esf, c.cil, c.adicao, c.olho);
  const bloco = (titulo: string, cor: string, explica: string, itens: typeof lista, col: (c: typeof lista[0]) => string) => (
    <div className="card" style={{ padding: 14, borderTop: `3px solid ${cor}` }}>
      <b>{titulo} ({itens.length})</b>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 8px' }}>{explica}</div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {itens.map(c => <div key={chave(c.esf, c.cil, c.adicao, c.olho)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
          <span style={{ fontFamily: 'monospace' }}>{desc(c)}</span><span style={{ whiteSpace: 'nowrap' }}>{col(c)}</span></div>)}
        {!itens.length && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum.</div>}
      </div>
    </div>);
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
        {prod.nome}: análise dos últimos {MESES_GIRO} meses de OS. <b style={{ color: 'var(--text-primary)' }}>{pecasParadas}</b> lentes paradas (com estoque e nenhuma venda).
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
        {bloco('🛒 Repor logo', '#ef4444', 'Vendem bem e o estoque acaba em menos de 2 meses.', repor, c => `tem ${Math.max(0, c.quantidade)} · ${c.media.toFixed(1).replace('.', ',')}/mês · ${c.meses < 0.05 ? 'acabou' : c.meses.toFixed(1).replace('.', ',') + ' mês'}`)}
        {bloco('🐢 Pouco giro', '#f59e0b', `Venderam 1 ou 2 em ${MESES_GIRO} meses e o estoque dura mais de 6 meses.`, pouco, c => `tem ${c.quantidade} · vendeu ${c.vendidas}`)}
        {bloco('🧊 Paradas (sem venda)', '#94a3b8', `Têm estoque e nenhuma OS em ${MESES_GIRO} meses. Evite comprar mais.`, parados, c => `tem ${c.quantidade}`)}
      </div>
    </div>
  );
}

function MaisVendidas() {
  const hoje = toLocalDateStr();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [dados, setDados] = useState<Vendida[]>([]);
  const [filtro, setFiltro] = useState('');
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    (async () => {
      setCarregando(true);
      const d = new Date(mes + '-01T12:00:00'); d.setMonth(d.getMonth() - 5);
      const fim = new Date(mes + '-01T12:00:00'); fim.setMonth(fim.getMonth() + 1); fim.setDate(0);
      setDados(await buscarVendas(toLocalDateStr(d).slice(0, 8) + '01', toLocalDateStr(fim)));
      setCarregando(false);
    })();
  }, [mes]);
  const meses = useMemo(() => {
    const out: string[] = []; const d = new Date(mes + '-01T12:00:00'); d.setMonth(d.getMonth() - 5);
    for (let i = 0; i < 6; i++) { out.push(toLocalDateStr(d).slice(0, 7)); d.setMonth(d.getMonth() + 1); }
    return out;
  }, [mes]);
  const produtos = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    dados.forEach(d => { m[d.produto] = m[d.produto] || {}; m[d.produto][d.mes] = (m[d.produto][d.mes] || 0) + d.lentes; });
    return Object.entries(m).sort((a, b) => (b[1][mes] || 0) - (a[1][mes] || 0));
  }, [dados, mes]);
  const mediaGrau = useMemo(() => {
    const m: Record<string, number> = {};
    dados.forEach(d => { const k = d.produto + '|' + chave(d.esf, d.cil, d.adicao, d.olho); m[k] = (m[k] || 0) + d.lentes; });
    return m;
  }, [dados]);
  const top = dados.filter(d => d.mes === mes && (!filtro || d.produto === filtro)).sort((a, b) => b.lentes - a.lentes).slice(0, 40);
  const desc = (d: Vendida) => d.tipo === 'vs' ? `esf ${g(d.esf)}  cil ${g(d.cil)}` : d.tipo === 'mf' ? `esf ${g(d.esf)}  adição ${g(d.adicao, false)}  ${d.olho}` : `esf ${g(d.esf)}${d.adicao ? '  adição ' + g(d.adicao, false) : ''}  ${d.olho}`;
  const th = { textAlign: 'left' as const, padding: 6, color: 'var(--text-muted)', fontSize: 12 };
  const fmt = (n: number) => n.toFixed(1).replace('.', ',');
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label>Mês <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className="form-input" style={{ width: 170, display: 'inline-block' }} /></label>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Conta 1 lente por olho de cada OS (fora orçamento) com lente de grau. Média = últimos 6 meses.</span>
      </div>
      {carregando ? <div style={{ padding: 20 }}>Carregando…</div> : <>
        <div className="card" style={{ padding: 14, marginBottom: 14, overflowX: 'auto' }}>
          <b>Lentes por produto — últimos 6 meses</b>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
            <thead><tr><th style={th}>Lente</th>{meses.map(m => <th key={m} style={{ ...th, textAlign: 'right' }}>{nomeMes(m)}</th>)}<th style={{ ...th, textAlign: 'right' }}>Média/mês</th></tr></thead>
            <tbody>{produtos.map(([p, v]) => { const tot = meses.reduce((s, m) => s + (v[m] || 0), 0);
              return <tr key={p} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: filtro === p ? 'rgba(99,102,241,.12)' : undefined }} onClick={() => setFiltro(filtro === p ? '' : p)}>
                <td style={{ padding: 6 }}>{p}</td>{meses.map(m => <td key={m} style={{ textAlign: 'right', padding: 6, fontWeight: m === mes ? 800 : 400 }}>{v[m] || '—'}</td>)}
                <td style={{ textAlign: 'right', padding: 6, fontWeight: 700, color: '#22c55e' }}>{fmt(tot / 6)}</td></tr>; })}</tbody>
          </table>
          {!produtos.length && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Nenhuma OS com lente de grau no período.</div>}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Clique numa lente para ver só os graus dela abaixo.</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <b>Graus que mais saíram em {nomeMes(mes)}{filtro ? ` — ${filtro}` : ''}</b>
          {filtro && <button className="btn btn-secondary" style={{ marginLeft: 10, padding: '2px 8px' }} onClick={() => setFiltro('')}>ver todas</button>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
            <thead><tr><th style={th}>#</th><th style={th}>Lente</th><th style={th}>Grau</th><th style={{ ...th, textAlign: 'right' }}>No mês</th><th style={{ ...th, textAlign: 'right' }}>Média/mês (6m)</th></tr></thead>
            <tbody>{top.map((d, i) => <tr key={i} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: 6 }}>{i + 1}</td><td>{d.produto}</td>
              <td style={{ fontFamily: 'monospace' }}>{desc(d)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{d.lentes}</td>
              <td style={{ textAlign: 'right' }}>{fmt((mediaGrau[d.produto + '|' + chave(d.esf, d.cil, d.adicao, d.olho)] || 0) / 6)}</td></tr>)}</tbody>
          </table>
          {!top.length && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Nada neste mês.</div>}
        </div>
      </>}
    </div>
  );
}

function Movimentos({ prods }: { prods: ProdGrade[] }) {
  const { tenantId } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!tenantId) return;
    supabase.from('lentes_grade_mov').select('*').eq('tenant_id', tenantId).neq('obs', 'Estoque inicial (folhas de 25/10/2026)')
      .order('created_at', { ascending: false }).limit(300).then(({ data }) => setRows(data || []));
  }, [tenantId]);
  const nome = (id: string) => prods.find(p => p.product_id === id)?.nome || '?';
  const MOT: Record<string, string> = { os: 'Saída (OS)', ajuste: 'Contagem/ajuste', entrada: 'Entrada', saida: 'Saída manual' };
  return (
    <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}><th style={{ padding: 6 }}>Quando</th><th>Lente</th><th>Grau</th><th>Movimento</th><th style={{ textAlign: 'right' }}>Qtd.</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
          <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('pt-BR')}</td><td>{nome(r.product_id)}</td>
          <td style={{ fontFamily: 'monospace' }}>esf {g(+r.esf)}{+r.adicao ? ` add ${g(+r.adicao, false)} ${r.olho}` : ` cil ${g(+r.cil)}`}</td>
          <td>{MOT[r.motivo] || r.motivo}{r.os_number ? ` #${r.os_number}` : ''}{r.obs ? ` · ${r.obs}` : ''}</td>
          <td style={{ textAlign: 'right', fontWeight: 700, color: r.delta < 0 ? '#ef4444' : '#22c55e' }}>{r.delta > 0 ? '+' : ''}{r.delta}</td></tr>)}</tbody>
      </table>
      {!rows.length && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Ainda não há movimentos (além do estoque inicial).</div>}
    </div>
  );
}

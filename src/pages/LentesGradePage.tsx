// Estoque de lentes por grau + lentes mais vendidas por mês (26/10/2026, pedido do Carlos).
// Tabelas no banco: lentes_grade_produto (quais lentes e o tipo vs/mf), lentes_grade (quantidade de cada grau) e
// lentes_grade_mov (movimentos). A baixa pela OS é automática no banco (trigger sync_lentes_os): 1 lente por olho,
// a partir de lentes_grade_inicio. "Mais vendidas" vem da função lentes_mais_vendidas (todas as OS com lente de grau).
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import toast from 'react-hot-toast';
import { toLocalDateStr } from './crediario/crediarioTypes';

interface ProdGrade { product_id: string; tipo: 'vs' | 'mf'; nome: string; }
interface Cel { id?: string; esf: number; cil: number; adicao: number; olho: string; quantidade: number; conferir: boolean; }
interface Vendida { mes: string; produto: string; tipo: string; esf: number; cil: number; adicao: number; olho: string; lentes: number; }

const CILS = [0, -0.25, -0.5, -0.75, -1, -1.25, -1.5, -1.75, -2];
const ADDS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const faixa = (de: number, ate: number) => { const r: number[] = []; const p = de <= ate ? 0.25 : -0.25; for (let v = de; p > 0 ? v <= ate + 1e-9 : v >= ate - 1e-9; v += p) r.push(Math.round(v * 100) / 100); return r; };
const g = (v: number, sinal = true) => (sinal && v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',');
const chave = (e: number, c: number, a: number, o: string) => `${e.toFixed(2)}|${c.toFixed(2)}|${a.toFixed(2)}|${o}`;
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m: string) => NOMES_MES[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);

export default function LentesGradePage() {
  const { tenantId } = useAuth();
  const [aba, setAba] = useState<'estoque' | 'vendidas' | 'movimentos'>('estoque');
  const [prods, setProds] = useState<ProdGrade[]>([]);
  const [prodId, setProdId] = useState('');
  const [cels, setCels] = useState<Record<string, Cel>>({});
  const [carregando, setCarregando] = useState(true);
  const [soConferir, setSoConferir] = useState(false);
  const [inicio, setInicio] = useState<string | null>(null);

  const prod = prods.find(p => p.product_id === prodId);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase.from('lentes_grade_produto').select('product_id, tipo, products(name)').eq('tenant_id', tenantId);
      const lista = (data || []).map((r: any) => ({ product_id: r.product_id, tipo: r.tipo, nome: r.products?.name || '?' }))
        .sort((a: ProdGrade, b: ProdGrade) => a.nome.localeCompare(b.nome));
      setProds(lista);
      if (lista.length && !prodId) setProdId(lista[0].product_id);
      const { data: ini } = await supabase.from('lentes_grade_inicio').select('inicio').eq('tenant_id', tenantId).maybeSingle();
      setInicio(ini?.inicio || null);
      if (!lista.length) setCarregando(false);
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

  const editar = async (esf: number, cil: number, adicao: number, olho: string) => {
    const atual = cels[chave(esf, cil, adicao, olho)];
    const desc = prod?.tipo === 'mf' ? `esf ${g(esf)} · adição ${g(adicao, false)} · ${olho === 'R' ? 'direito (R)' : 'esquerdo (L)'}` : `esf ${g(esf)} · cil ${g(cil)}`;
    const txt = window.prompt(`${prod?.nome} — ${desc}\nQuantidade contada agora (lentes):${atual?.conferir ? '\n(esta casa estava marcada para conferir)' : ''}`, String(atual?.quantidade ?? 0));
    if (txt === null) return;
    const nova = parseInt(txt, 10);
    if (Number.isNaN(nova) || nova < 0) { toast.error('Digite um número inteiro (0 ou mais).'); return; }
    const delta = nova - (atual?.quantidade ?? 0);
    const { error } = await supabase.from('lentes_grade').upsert({ tenant_id: tenantId, product_id: prodId, esf, cil, adicao, olho, quantidade: nova, conferir: false, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,product_id,esf,cil,adicao,olho' });
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    if (delta) await supabase.from('lentes_grade_mov').insert({ tenant_id: tenantId, product_id: prodId, esf, cil, adicao, olho, delta, motivo: 'ajuste', obs: 'Ajuste manual na tela' });
    toast.success('Salvo ✓'); carregar();
  };

  const ligarBaixa = async () => {
    if (!window.confirm('Ligar a baixa automática? A partir de agora, toda OS (que não seja orçamento) com estas lentes tira 1 lente por olho do grau da receita. Se a OS for cancelada ou excluída, a lente volta.')) return;
    const agora = new Date().toISOString();
    const { error } = await supabase.from('lentes_grade_inicio').upsert({ tenant_id: tenantId, inicio: agora });
    if (error) { toast.error(error.message); return; }
    setInicio(agora); toast.success('Baixa automática ligada ✓');
  };

  const valor = (e: number, c: number, a: number, o: string) => cels[chave(e, c, a, o)];
  const celula = (e: number, c: number, a: number, o: string) => {
    const v = valor(e, c, a, o);
    const q = v?.quantidade ?? null;
    if (soConferir && !v?.conferir) return <td key={o + a + c} style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }} />;
    const cor = q === null ? 'transparent' : q <= 0 ? 'rgba(239,68,68,.25)' : q === 1 ? 'rgba(245,158,11,.22)' : 'transparent';
    return <td key={o + a + c} onClick={() => editar(e, c, a, o)} title="Clique para corrigir a quantidade"
      style={{ border: '1px solid var(--border)', textAlign: 'center', cursor: 'pointer', padding: '4px 2px', minWidth: 34, background: cor, fontWeight: 700,
        outline: v?.conferir ? '2px solid #eab308' : undefined, outlineOffset: -2 }}>{q === null ? <span style={{ opacity: .25 }}>·</span> : q}{v?.conferir ? <sup style={{ color: '#eab308' }}>?</sup> : null}</td>;
  };
  const th = { border: '1px solid var(--border)', padding: '4px 6px', fontSize: 11.5, background: 'var(--bg-input)', whiteSpace: 'nowrap' } as const;

  const tabelaVS = (titulo: string, esfs: number[]) => (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, margin: '6px 0' }}>{titulo}</div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr><th style={th}>ESF \ CIL</th>{CILS.map(c => <th key={c} style={th}>{g(c)}</th>)}<th style={th}>Total</th></tr></thead>
        <tbody>{esfs.map(e => <tr key={e}><th style={th}>{g(e)}</th>{CILS.map(c => celula(e, c, 0, ''))}
          <td style={{ ...th, textAlign: 'right' }}>{CILS.reduce((s, c) => s + Math.max(0, valor(e, c, 0, '')?.quantidade || 0), 0)}</td></tr>)}</tbody>
      </table></div>);
  const tabelaMF = () => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr><th style={th} rowSpan={2}>ESF</th>{ADDS.map(a => <th key={a} style={th} colSpan={2}>Adição {g(a, false)}</th>)}<th style={th} rowSpan={2}>Total</th></tr>
          <tr>{ADDS.map(a => ['R', 'L'].map(o => <th key={a + o} style={th}>{o}</th>))}</tr></thead>
        <tbody>{faixa(0, 3).map(e => <tr key={e}><th style={th}>{g(e)}</th>{ADDS.map(a => ['R', 'L'].map(o => celula(e, 0, a, o)))}
          <td style={{ ...th, textAlign: 'right' }}>{ADDS.reduce((s, a) => s + ['R', 'L'].reduce((t, o) => t + Math.max(0, valor(e, 0, a, o)?.quantidade || 0), 0), 0)}</td></tr>)}</tbody>
      </table></div>);

  const total = Object.values(cels).reduce((s, c) => s + Math.max(0, c.quantidade), 0);
  const zerados = Object.values(cels).filter(c => c.quantidade <= 0).length;
  const conferir = Object.values(cels).filter(c => c.conferir).length;
  const btnAba = (k: typeof aba, t: string) => <button onClick={() => setAba(k)} style={{ padding: '9px 16px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: aba === k ? '#6366f1' : 'transparent', color: aba === k ? 'white' : 'var(--text-muted)', borderRadius: '6px 6px 0 0' }}>{t}</button>;

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>👓 Lentes por grau</h1>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Estoque de cada grau e as lentes que mais saem por mês.{' '}
        {inicio ? <>Baixa automática pelas OS <b style={{ color: '#22c55e' }}>ligada</b> desde {new Date(inicio).toLocaleString('pt-BR')}.</>
          : <><b style={{ color: '#f59e0b' }}>Baixa automática desligada.</b> <button className="btn btn-primary" style={{ marginLeft: 8, padding: '4px 10px' }} onClick={ligarBaixa}>Ligar</button></>}
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '2px solid var(--border)' }}>
        {btnAba('estoque', 'Estoque por grau')}{btnAba('vendidas', 'Mais vendidas por mês')}{btnAba('movimentos', 'Movimentos')}
      </div>
      {aba === 'estoque' && <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {prods.map(p => <button key={p.product_id} className={p.product_id === prodId ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setProdId(p.product_id)}>{p.nome}</button>)}
          <div style={{ flex: 1 }} />
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={soConferir} onChange={e => setSoConferir(e.target.checked)} /> Só as casas para conferir ({conferir})</label>
        </div>
        {!prods.length && !carregando && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma lente com estoque por grau ainda.</div>}
        {prod && <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
            <span><b>{total}</b> lentes em estoque</span><span style={{ color: '#ef4444' }}><b>{zerados}</b> graus zerados</span>
            <span style={{ color: '#eab308' }}><b>{conferir}</b> para conferir</span>
            <span style={{ color: 'var(--text-muted)' }}>{prod.tipo === 'mf' ? 'Contada por lado: R = direito, L = esquerdo.' : 'Contada por peça (cada olho usa 1 lente).'} Clique numa casa para corrigir.</span>
          </div>
          {carregando ? <div style={{ padding: 20 }}>Carregando…</div> : prod.tipo === 'vs'
            ? <>{tabelaVS('Esférico positivo (0,00 a +6,00)', faixa(0, 6))}{tabelaVS('Esférico negativo (−0,25 a −6,00)', faixa(-0.25, -6))}</>
            : tabelaMF()}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            <span style={{ background: 'rgba(239,68,68,.25)', padding: '0 6px' }}>vermelho</span> = acabou ·{' '}
            <span style={{ background: 'rgba(245,158,11,.22)', padding: '0 6px' }}>laranja</span> = só 1 ·{' '}
            <span style={{ outline: '2px solid #eab308', padding: '0 6px' }}>?</span> = número ilegível na folha, conferir na prateleira
          </div>
        </div>}
      </>}
      {aba === 'vendidas' && <MaisVendidas />}
      {aba === 'movimentos' && <Movimentos prods={prods} />}
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
      const de = toLocalDateStr(d).slice(0, 8) + '01';
      const fim = new Date(mes + '-01T12:00:00'); fim.setMonth(fim.getMonth() + 1); fim.setDate(0);
      const { data, error } = await supabase.rpc('lentes_mais_vendidas', { p_de: de, p_ate: toLocalDateStr(fim) });
      if (error) toast.error(error.message);
      setDados((data || []).map((r: any) => ({ ...r, esf: +r.esf, cil: +r.cil, adicao: +r.adicao, lentes: +r.lentes })));
      setCarregando(false);
    })();
  }, [mes]);
  const meses = useMemo(() => Array.from(new Set(dados.map(d => d.mes))).sort(), [dados]);
  const produtos = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    dados.forEach(d => { m[d.produto] = m[d.produto] || {}; m[d.produto][d.mes] = (m[d.produto][d.mes] || 0) + d.lentes; });
    return Object.entries(m).sort((a, b) => (b[1][mes] || 0) - (a[1][mes] || 0));
  }, [dados, mes]);
  const top = dados.filter(d => d.mes === mes && (!filtro || d.produto === filtro)).sort((a, b) => b.lentes - a.lentes).slice(0, 40);
  const desc = (d: Vendida) => d.tipo === 'vs' ? `esf ${g(d.esf)}  cil ${g(d.cil)}` : d.tipo === 'mf' ? `esf ${g(d.esf)}  adição ${g(d.adicao, false)}  ${d.olho}` : `esf ${g(d.esf)}${d.adicao ? '  adição ' + g(d.adicao, false) : ''}  ${d.olho}`;
  const th = { textAlign: 'left' as const, padding: 6, color: 'var(--text-muted)', fontSize: 12 };
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label>Mês <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className="form-input" style={{ width: 170, display: 'inline-block' }} /></label>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Conta 1 lente por olho de cada OS (fora orçamento) com lente de grau.</span>
      </div>
      {carregando ? <div style={{ padding: 20 }}>Carregando…</div> : <>
        <div className="card" style={{ padding: 14, marginBottom: 14, overflowX: 'auto' }}>
          <b>Lentes por produto — últimos 6 meses</b>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
            <thead><tr><th style={th}>Lente</th>{meses.map(m => <th key={m} style={{ ...th, textAlign: 'right' }}>{nomeMes(m)}</th>)}</tr></thead>
            <tbody>{produtos.map(([p, v]) => <tr key={p} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: filtro === p ? 'rgba(99,102,241,.12)' : undefined }} onClick={() => setFiltro(filtro === p ? '' : p)}>
              <td style={{ padding: 6 }}>{p}</td>{meses.map(m => <td key={m} style={{ textAlign: 'right', padding: 6, fontWeight: m === mes ? 800 : 400 }}>{v[m] || '—'}</td>)}</tr>)}</tbody>
          </table>
          {!produtos.length && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Nenhuma OS com lente de grau no período.</div>}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <b>Graus que mais saíram em {nomeMes(mes)}{filtro ? ` — ${filtro}` : ''}</b>
          {filtro && <button className="btn btn-secondary" style={{ marginLeft: 10, padding: '2px 8px' }} onClick={() => setFiltro('')}>ver todas</button>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
            <thead><tr><th style={th}>#</th><th style={th}>Lente</th><th style={th}>Grau</th><th style={{ ...th, textAlign: 'right' }}>Lentes</th></tr></thead>
            <tbody>{top.map((d, i) => <tr key={i} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: 6 }}>{i + 1}</td><td>{d.produto}</td>
              <td style={{ fontFamily: 'monospace' }}>{desc(d)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{d.lentes}</td></tr>)}</tbody>
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
      .order('created_at', { ascending: false }).limit(200).then(({ data }) => setRows(data || []));
  }, [tenantId]);
  const nome = (id: string) => prods.find(p => p.product_id === id)?.nome || '?';
  const MOT: Record<string, string> = { os: 'Saída (OS)', ajuste: 'Ajuste', entrada: 'Entrada' };
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

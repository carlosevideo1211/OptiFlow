// Estoque do LABORATÓRIO por grau (20/11/2026, pedido do Carlos), dentro da conta da loja: botão "Loja | Laboratório"
// da tela Lentes por grau, só para o dono. Separado do estoque da loja (tabelas lab_*; migração 20261120_laboratorio_estoque).
//  - Enviar para loja: clica nas casas (1 peça por clique) e confirma; o valor é peças x preço do par / 2.
//    Castanho: as lentes entram no estoque da loja na hora. Solar: só registra a saída do laboratório.
//  - Relatório do mês: o que o laboratório vendeu para as lojas (pares e R$, por lente e por loja, graus que mais saíram).
//  - Lista de compra: só os graus que giram (saíram 2+ nos últimos 90 dias), para cobrir N meses; parados ficam de fora.
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import toast from 'react-hot-toast';
import { toLocalDateStr } from './crediario/crediarioTypes';
import { abrirDocumentoImprimivel } from '../utils/printDoc';

interface LabProd { product_id: string; tipo: 'vs' | 'mf'; preco_par: number; nome: string; }
interface Cel { esf: number; cil: number; adicao: number; olho: string; quantidade: number; }
interface ItemEnvio { product_id: string; esf: number; cil: number; adicao: number; olho: string; qtd: number; }
type Modo = 'enviar' | 'entrada' | 'saida' | 'contagem';

export const LOJAS = [
  { id: 'castanho', nome: 'Ótica Evangelista (Castanho)', curto: 'Castanho' },
  { id: 'solar', nome: 'Ótica Solar', curto: 'Solar' },
];
const nomeLoja = (id: string) => LOJAS.find(l => l.id === id)?.curto || id;
const CILS = [0, -0.25, -0.5, -0.75, -1, -1.25, -1.5, -1.75, -2];
const ADDS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const faixa = (de: number, ate: number) => { const r: number[] = []; const p = de <= ate ? 0.25 : -0.25; for (let v = de; p > 0 ? v <= ate + 1e-9 : v >= ate - 1e-9; v += p) r.push(Math.round(v * 100) / 100); return r; };
const g = (v: number, sinal = true) => (sinal && v > 0 ? '+' : '') + v.toFixed(2).replace('.', ',');
const chave = (e: number, c: number, a: number, o: string) => `${e.toFixed(2)}|${c.toFixed(2)}|${a.toFixed(2)}|${o}`;
const R$ = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pares = (pecas: number) => (pecas / 2).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const descGrau = (tipo: string, e: number, c: number, a: number, o: string) =>
  tipo === 'mf' ? `esf ${g(e)} · adição ${g(a, false)} · ${o}` : `esf ${g(e)} · cil ${g(c)}`;
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (m: string) => NOMES_MES[+m.slice(5, 7) - 1] + ' de ' + m.slice(0, 4);
const mesAnterior = (m: string) => { const d = new Date(m + '-01T12:00:00'); d.setMonth(d.getMonth() - 1); return toLocalDateStr(d).slice(0, 7); };
// início e fim do mês em UTC (Manaus = UTC-4)
const limitesMes = (m: string) => { const d = new Date(m + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); return { de: `${m}-01T04:00:00Z`, ate: `${toLocalDateStr(d).slice(0, 7)}-01T04:00:00Z` }; };
const CSS_DOC = `body{font-family:Arial,sans-serif;color:#000;font-size:13px} h2{margin:4px 0 2px} h3{margin:14px 0 4px}
  table{border-collapse:collapse;width:100%;margin-bottom:8px} th,td{border:1px solid #000;padding:3px 6px;text-align:left}
  th{background:#eee} td.n,th.n{text-align:right} .muted{color:#555}`;

export default function LaboratorioLentes() {
  const { tenantId } = useAuth();
  const [aba, setAba] = useState<'estoque' | 'relatorio' | 'compra' | 'envios'>('estoque');
  const [prods, setProds] = useState<LabProd[]>([]);
  const [prodId, setProdId] = useState('');
  const [cels, setCels] = useState<Record<string, Cel>>({});
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<Modo>('enviar');
  const [cesta, setCesta] = useState<ItemEnvio[]>([]);
  const [loja, setLoja] = useState('castanho');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const prod = prods.find(p => p.product_id === prodId);
  const prodDe = (id: string) => prods.find(p => p.product_id === id);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data, error } = await supabase.from('lab_produto').select('product_id, tipo, preco_par').eq('tenant_id', tenantId);
      if (error) { toast.error(error.message); setCarregando(false); return; }
      const ids = (data || []).map((r: any) => r.product_id);
      const { data: ps } = ids.length ? await supabase.from('products').select('id, name').in('id', ids) : { data: [] as any[] };
      const nomes: Record<string, string> = {}; (ps || []).forEach((p: any) => { nomes[p.id] = p.name.trim(); });
      const lista = (data || []).map((r: any) => ({ product_id: r.product_id, tipo: r.tipo, preco_par: +r.preco_par, nome: nomes[r.product_id] || '?' }))
        .sort((a: LabProd, b: LabProd) => a.nome.localeCompare(b.nome));
      setProds(lista);
      if (lista.length) setProdId(lista[0].product_id); else setCarregando(false);
    })();
  }, [tenantId]);

  const carregar = async () => {
    if (!tenantId || !prodId) return;
    setCarregando(true);
    const rows = await fetchAllRows<any>((rf, rt) => supabase.from('lab_grade').select('esf, cil, adicao, olho, quantidade')
      .eq('tenant_id', tenantId).eq('product_id', prodId).range(rf, rt));
    const m: Record<string, Cel> = {};
    rows.forEach(r => { const c = { ...r, esf: +r.esf, cil: +r.cil, adicao: +r.adicao }; m[chave(c.esf, c.cil, c.adicao, c.olho)] = c; });
    setCels(m); setCarregando(false);
  };
  useEffect(() => { carregar(); }, [prodId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const naCesta = (pid: string, e: number, c: number, a: number, o: string) =>
    cesta.find(i => i.product_id === pid && chave(i.esf, i.cil, i.adicao, i.olho) === chave(e, c, a, o))?.qtd || 0;
  const porNaCesta = (it: Omit<ItemEnvio, 'qtd'>, d: number) => setCesta(cs => {
    const k = chave(it.esf, it.cil, it.adicao, it.olho);
    const i = cs.findIndex(x => x.product_id === it.product_id && chave(x.esf, x.cil, x.adicao, x.olho) === k);
    if (i < 0) return d > 0 ? [...cs, { ...it, qtd: d }] : cs;
    const q = cs[i].qtd + d;
    return q > 0 ? cs.map((x, j) => j === i ? { ...x, qtd: q } : x) : cs.filter((_, j) => j !== i);
  });

  const clicar = async (esf: number, cil: number, adicao: number, olho: string) => {
    if (!prod) return;
    if (modo === 'enviar') { porNaCesta({ product_id: prod.product_id, esf, cil, adicao, olho }, 1); return; }
    const atual = cels[chave(esf, cil, adicao, olho)];
    const q0 = atual?.quantidade ?? 0;
    const desc = `${prod.nome} — ${descGrau(prod.tipo, esf, cil, adicao, olho === 'R' ? 'direito (R)' : 'esquerdo (L)')}\nTem agora no laboratório: ${q0}`;
    const pergunta = modo === 'entrada' ? 'Quantas lentes ENTRARAM (compra do fornecedor)?' : modo === 'saida' ? 'Quantas lentes SAÍRAM (quebra, defeito, devolução)?' : 'Quantidade CONTADA na prateleira do laboratório agora:';
    const txt = window.prompt(`${desc}\n\n${pergunta}`, modo === 'contagem' ? String(q0) : '1');
    if (txt === null) return;
    const n = parseInt(txt, 10);
    if (Number.isNaN(n) || n < 0) { toast.error('Digite um número inteiro (0 ou mais).'); return; }
    let motivoObs = '';
    if (modo === 'saida') { const m = window.prompt('Motivo (opcional): quebra, defeito, devolução…', 'quebra'); if (m === null) return; motivoObs = m.trim().slice(0, 80); }
    const nova = modo === 'entrada' ? q0 + n : modo === 'saida' ? q0 - n : n;
    const delta = nova - q0;
    if (!delta) return;
    const { error } = await supabase.from('lab_grade').upsert({ tenant_id: tenantId, product_id: prod.product_id, esf, cil, adicao, olho, quantidade: nova,
      updated_at: new Date().toISOString() }, { onConflict: 'tenant_id,product_id,esf,cil,adicao,olho' });
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    await supabase.from('lab_mov').insert({ tenant_id: tenantId, product_id: prod.product_id, esf, cil, adicao, olho, delta,
      motivo: modo === 'contagem' ? 'ajuste' : modo, obs: modo === 'contagem' ? 'Contagem na prateleira' : motivoObs });
    toast.success(modo === 'entrada' ? `+${n} entrada ✓` : modo === 'saida' ? `−${n} saída ✓` : 'Contagem salva ✓');
    carregar();
  };

  // Preenche a cesta com o que a Castanho vendeu nas OS desde o último envio do laboratório para ela.
  const reporCastanho = async () => {
    const { data: ult } = await supabase.from('lab_envios').select('created_at').eq('tenant_id', tenantId).eq('loja', 'castanho')
      .eq('desfeito', false).order('created_at', { ascending: false }).limit(1);
    let desde = ult?.[0]?.created_at as string | undefined;
    if (!desde) {
      const d = window.prompt('Ainda não há envio para a Castanho no sistema.\nRepor o que ela vendeu desde qual data? (dd/mm/aaaa)',
        new Date(Date.now() - 7 * 864e5).toLocaleDateString('pt-BR'));
      if (!d) return;
      const [dd, mm, aa] = d.split('/');
      if (!aa) { toast.error('Data inválida.'); return; }
      desde = `${aa}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T04:00:00Z`;
    }
    const ids = prods.map(p => p.product_id);
    const rows = await fetchAllRows<any>((rf, rt) => supabase.from('lentes_grade_mov').select('product_id, esf, cil, adicao, olho, delta')
      .eq('tenant_id', tenantId).eq('motivo', 'os').in('product_id', ids).gte('created_at', desde!).range(rf, rt));
    if (!rows.length) { toast('A Castanho não vendeu estas lentes desde ' + new Date(desde).toLocaleDateString('pt-BR') + '.'); return; }
    const novos: ItemEnvio[] = [];
    rows.forEach(r => {
      const it = { product_id: r.product_id, esf: +r.esf, cil: +r.cil, adicao: +r.adicao, olho: r.olho };
      const k = chave(it.esf, it.cil, it.adicao, it.olho);
      const ex = novos.find(x => x.product_id === it.product_id && chave(x.esf, x.cil, x.adicao, x.olho) === k);
      if (ex) ex.qtd += -r.delta; else novos.push({ ...it, qtd: -r.delta });
    });
    setLoja('castanho');
    setCesta(novos.filter(x => x.qtd > 0));
    toast.success(`Lista preenchida com o que a Castanho vendeu desde ${new Date(desde).toLocaleDateString('pt-BR')}. Confira e confirme.`);
  };

  // ---- Foto dos envelopes (substitui a "reposição" pelo WhatsApp do MEI, 20/11/2026) ----
  const [lendo, setLendo] = useState('');
  const [naoAchei, setNaoAchei] = useState<string[]>([]);
  const reduzir = (f: File) => new Promise<string>((ok, erro) => {
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => {
      const max = 1800, k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      ok(cv.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => erro(new Error('Não abri a foto ' + f.name)); img.src = url;
  });
  // Lente lida -> lente do laboratório: mesmo tipo (vs/mf), foto e filtro azul; sem foto, decide pelo antirreflexo.
  const acharProduto = (l: any): LabProd | undefined => {
    const cand = prods.filter(p => {
      const t = new Set(p.nome.toLowerCase().split(/[^a-z0-9]+/));
      return p.tipo === l.tipo && t.has('foto') === !!l.foto && (t.has('blu') || t.has('blue')) === !!l.azul;
    });
    if (cand.length <= 1) return cand[0];
    const comAr = cand.filter(p => /\bar\b/i.test(p.nome) === !!l.ar);
    return (comAr.length ? comAr : cand).sort((a, b) => a.nome.length - b.nome.length)[0];
  };
  const lerFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const lista = Array.from(files); const novos: ItemEnvio[] = []; const sem: string[] = []; let total = 0;
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      const n = window.prompt(`Foto ${i + 1} de ${lista.length}: quantos envelopes tem nela?\n(Deixe em branco se não souber: o sistema conta.)`, '');
      if (n === null) continue;
      setLendo(`Lendo a foto ${i + 1} de ${lista.length}…`);
      try {
        const imagem = await reduzir(f);
        const { data, error } = await supabase.functions.invoke('ler-envelopes', { body: { imagem, mime: 'image/jpeg', envelopes: parseInt(n, 10) || 0 } });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        for (const l of (data?.lentes || []) as any[]) {
          total++;
          const p = acharProduto(l);
          const grau = descGrau(l.tipo, +l.esf, +l.cil, +l.adicao, l.olho || '?');
          const nomeL = `${l.tipo === 'mf' ? 'Progressiva' : 'Visão simples'}${l.foto ? ' foto' : ''}${l.azul ? ' blue' : ''}${!l.foto && l.ar ? ' AR' : ''}`;
          if (!p) { sem.push(`${nomeL} — ${grau}: não tem essa lente no estoque do laboratório`); continue; }
          if (p.tipo === 'mf' && !['R', 'L'].includes(l.olho)) { sem.push(`${p.nome} — ${grau}: não li se é R ou L`); continue; }
          const it = { product_id: p.product_id, esf: +l.esf, cil: p.tipo === 'mf' ? 0 : +l.cil, adicao: p.tipo === 'mf' ? +l.adicao : 0, olho: p.tipo === 'mf' ? l.olho : '' };
          const k = chave(it.esf, it.cil, it.adicao, it.olho);
          const ex = novos.find(x => x.product_id === it.product_id && chave(x.esf, x.cil, x.adicao, x.olho) === k);
          if (ex) ex.qtd++; else novos.push({ ...it, qtd: 1 });
        }
      } catch (e: any) { toast.error(`Foto ${i + 1}: ${e.message || e}`); }
    }
    setLendo('');
    novos.forEach(it => porNaCesta(it, it.qtd));
    setNaoAchei(sem); setModo('enviar');
    if (total) toast.success(`Li ${total} envelope(s). Confira a lista, escolha a loja e confirme.`, { duration: 6000 });
    else toast.error('Não achei envelope de lente. Tire a foto de perto, com o grau aparecendo.');
  };
  const trocarProduto = (n: number, pid: string) => setCesta(cs => {
    const it = { ...cs[n], product_id: pid }; const resto = cs.filter((_, j) => j !== n);
    const k = chave(it.esf, it.cil, it.adicao, it.olho);
    const i = resto.findIndex(x => x.product_id === pid && chave(x.esf, x.cil, x.adicao, x.olho) === k);
    return i < 0 ? [...resto, it] : resto.map((x, j) => j === i ? { ...x, qtd: x.qtd + it.qtd } : x);
  });

  const totCesta = cesta.reduce((s, i) => ({ pecas: s.pecas + i.qtd, valor: s.valor + i.qtd * (prodDe(i.product_id)?.preco_par || 0) / 2 }), { pecas: 0, valor: 0 });

  const confirmarEnvio = async () => {
    if (!cesta.length) return;
    const lj = LOJAS.find(l => l.id === loja)!;
    const extra = loja === 'castanho' ? '\nAs lentes já entram no estoque da loja Castanho.' : '\nA Solar não tem estoque por grau: fica registrada só a saída do laboratório.';
    if (!window.confirm(`Enviar para ${lj.nome}:\n${totCesta.pecas} lentes (${pares(totCesta.pecas)} pares) = ${R$(totCesta.valor)}${extra}\n\nConfirmar?`)) return;
    setEnviando(true);
    const { data, error } = await supabase.rpc('lab_enviar', { p_loja: lj.id, p_loja_nome: lj.nome, p_itens: cesta, p_obs: obs.trim() });
    setEnviando(false);
    if (error) { toast.error('Não registrou: ' + error.message); return; }
    toast.success(`Envio nº ${data.numero} registrado ✓`);
    imprimirGuia({ numero: data.numero, loja_nome: lj.nome, created_at: new Date().toISOString(), obs: obs.trim(), valor: data.valor, pecas: data.pecas },
      cesta.map(i => ({ ...i, valor_par: prodDe(i.product_id)?.preco_par || 0 })));
    setCesta([]); setObs(''); carregar();
  };

  // Folha que vai junto com as lentes
  const imprimirGuia = (en: any, itens: (ItemEnvio & { valor_par: number })[]) => {
    const linhas = [...itens].sort((a, b) => (prodDe(a.product_id)?.nome || '').localeCompare(prodDe(b.product_id)?.nome || '') || a.esf - b.esf || a.adicao - b.adicao || a.cil - b.cil);
    const html = `<h2>Laboratório Evangelista — Envio nº ${en.numero}</h2>
      <div>Para: <b>${en.loja_nome}</b> · ${new Date(en.created_at).toLocaleString('pt-BR')}${en.obs ? ' · ' + en.obs : ''}</div>
      <table style="margin-top:8px"><thead><tr><th>Lente</th><th>Grau</th><th class="n">Peças</th><th class="n">Pares</th><th class="n">Preço do par</th><th class="n">Valor</th><th>Conferido</th></tr></thead>
      <tbody>${linhas.map(i => { const p = prodDe(i.product_id); return `<tr><td>${p?.nome || '?'}</td><td>${descGrau(p?.tipo || 'vs', i.esf, i.cil, i.adicao, i.olho)}</td>
        <td class="n">${i.qtd}</td><td class="n">${pares(i.qtd)}</td><td class="n">${R$(i.valor_par)}</td><td class="n">${R$(i.qtd * i.valor_par / 2)}</td><td></td></tr>`; }).join('')}</tbody>
      <tfoot><tr><th colspan="2">TOTAL</th><th class="n">${en.pecas}</th><th class="n">${pares(en.pecas)}</th><th></th><th class="n">${R$(+en.valor)}</th><th></th></tr></tfoot></table>
      <div style="margin-top:30px">Recebido por: ______________________________ Data: ___/___/______</div>`;
    abrirDocumentoImprimivel({ title: `Envio ${en.numero} do laboratório`, filename: `envio_laboratorio_${en.numero}.pdf`, css: CSS_DOC, body: html,
      excel: { filename: `envio_laboratorio_${en.numero}.xlsx` } });
  };

  const total = Object.values(cels).reduce((s, c) => s + Math.max(0, c.quantidade), 0);
  const zerados = Object.values(cels).filter(c => c.quantidade <= 0).length;
  const th = { border: '1px solid var(--border)', padding: '4px 6px', fontSize: 11.5, background: 'var(--bg-input)', whiteSpace: 'nowrap' } as const;
  const celula = (e: number, c: number, a: number, o: string) => {
    const v = cels[chave(e, c, a, o)], q = v?.quantidade ?? null, nc = prod ? naCesta(prod.product_id, e, c, a, o) : 0;
    const cor = q === null ? 'transparent' : q <= 0 ? 'rgba(239,68,68,.25)' : q === 1 ? 'rgba(245,158,11,.22)' : 'transparent';
    return <td key={o + a + c} onClick={() => clicar(e, c, a, o)}
      onContextMenu={ev => { if (nc && prod) { ev.preventDefault(); porNaCesta({ product_id: prod.product_id, esf: e, cil: c, adicao: a, olho: o }, -1); } }}
      title={`${descGrau(prod?.tipo || 'vs', e, c, a, o)}\nNo laboratório: ${q ?? 0}${nc ? `\nNo envio: ${nc} (botão direito tira 1)` : ''}`}
      style={{ border: '1px solid var(--border)', textAlign: 'center', cursor: 'pointer', padding: '4px 2px', minWidth: 34, background: cor, fontWeight: 700,
        outline: nc ? '2px solid #6366f1' : undefined, outlineOffset: -2 }}>
      {q === null ? <span style={{ opacity: .25 }}>·</span> : q}{nc ? <sup style={{ color: '#6366f1' }}>−{nc}</sup> : null}</td>;
  };
  const tabelaVS = (titulo: string, esfs: number[]) => (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, margin: '6px 0' }}>{titulo}</div>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr><th style={th}>ESF \ CIL</th>{CILS.map(c => <th key={c} style={th}>{g(c)}</th>)}</tr></thead>
        <tbody>{esfs.map(e => <tr key={e}><th style={th}>{g(e)}</th>{CILS.map(c => celula(e, c, 0, ''))}</tr>)}</tbody>
      </table></div>);
  const tabelaMF = () => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr><th style={th} rowSpan={2}>ESF</th>{ADDS.map(a => <th key={a} style={th} colSpan={2}>Adição {g(a, false)}</th>)}</tr>
          <tr>{ADDS.map(a => ['R', 'L'].map(o => <th key={a + o} style={th}>{o}</th>))}</tr></thead>
        <tbody>{faixa(0, 3).map(e => <tr key={e}><th style={th}>{g(e)}</th>{ADDS.map(a => ['R', 'L'].map(o => celula(e, 0, a, o)))}</tr>)}</tbody>
      </table></div>);
  const seg = <T extends string>(atual: T, set: (v: T) => void, ops: [T, string][]) => (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flexWrap: 'wrap' }}>
      {ops.map(([k, t]) => <button key={k} onClick={() => set(k)} style={{ padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        background: atual === k ? '#6366f1' : 'transparent', color: atual === k ? '#fff' : 'var(--text-muted)' }}>{t}</button>)}
    </div>);
  const btnAba = (k: typeof aba, t: string) => <button onClick={() => setAba(k)} style={{ padding: '9px 16px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: aba === k ? '#0e7490' : 'transparent', color: aba === k ? 'white' : 'var(--text-muted)', borderRadius: '6px 6px 0 0' }}>{t}</button>;

  if (!carregando && !prods.length) return <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>O estoque do laboratório ainda não foi carregado.</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {btnAba('estoque', '📦 Estoque e envio')}{btnAba('relatorio', '📊 Relatório do mês')}{btnAba('compra', '🛒 Lista de compra')}{btnAba('envios', '🧾 Envios feitos')}
      </div>
      {aba === 'estoque' && <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {prods.map(p => <button key={p.product_id} className={p.product_id === prodId ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setProdId(p.product_id)}>
            {p.nome} <span style={{ opacity: .7, fontWeight: 400 }}>· {R$(p.preco_par)} o par</span></button>)}
        </div>
        <div className="card" style={{ padding: 14, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderLeft: '4px solid #0e7490' }}>
          <label className="btn btn-primary" style={{ cursor: lendo ? 'wait' : 'pointer', margin: 0 }}>
            📷 Ler foto dos envelopes
            <input type="file" accept="image/*" multiple hidden disabled={!!lendo} onChange={e => { lerFotos(e.target.files); e.target.value = ''; }} />
          </label>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {lendo || 'Tire a foto dos envelopes que vão sair (pode ser mais de uma). O sistema lê o grau, monta o envio, você escolhe a loja e confirma.'}
          </span>
        </div>
        {naoAchei.length > 0 && <div className="card" style={{ padding: 12, marginBottom: 12, borderLeft: '4px solid #f59e0b', fontSize: 13 }}>
          <b>⚠️ Ficaram fora do envio ({naoAchei.length}):</b> confira e, se for o caso, clique na casa certa da tabela.
          <button className="btn btn-secondary" style={{ float: 'right', padding: '0 8px' }} onClick={() => setNaoAchei([])}>ok</button>
          {naoAchei.map((t, i) => <div key={i}>• {t}</div>)}
        </div>}
        {cesta.length > 0 && <div className="card" style={{ padding: 14, marginBottom: 12, borderTop: '3px solid #6366f1' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <b>Envio para</b>
            {seg<string>(loja, setLoja, LOJAS.map(l => [l.id, l.curto] as [string, string]))}
            <span><b>{totCesta.pecas}</b> lentes · <b>{pares(totCesta.pecas)}</b> pares · <b style={{ color: '#22c55e' }}>{R$(totCesta.valor)}</b></span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={() => setCesta([])}>Limpar</button>
            <button className="btn btn-primary" disabled={enviando} onClick={confirmarEnvio}>{enviando ? 'Registrando…' : '✅ Confirmar envio e imprimir'}</button>
          </div>
          <input className="form-input" placeholder="Observação (opcional): ex. OS 1234, entregue por João" value={obs} onChange={e => setObs(e.target.value)} style={{ marginBottom: 8 }} />
          <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 13 }}>
            {cesta.map((i, n) => { const p = prodDe(i.product_id); const tem = p?.product_id === prodId ? cels[chave(i.esf, i.cil, i.adicao, i.olho)]?.quantidade : undefined;
              return <div key={n} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ flex: 1 }}>
                  <select value={i.product_id} onChange={e => trocarProduto(n, e.target.value)} className="form-input" title="Lente errada? Troque aqui"
                    style={{ width: 'auto', display: 'inline-block', padding: '2px 6px', fontSize: 13 }}>
                    {prods.filter(x => x.tipo === p?.tipo).map(x => <option key={x.product_id} value={x.product_id}>{x.nome}</option>)}
                  </select> <span style={{ fontFamily: 'monospace' }}>{descGrau(p?.tipo || 'vs', i.esf, i.cil, i.adicao, i.olho)}</span>
                  {tem !== undefined && tem < i.qtd && <span style={{ color: '#ef4444' }}> · só tem {Math.max(0, tem)} no laboratório</span>}</span>
                <button className="btn btn-secondary" style={{ padding: '0 8px' }} onClick={() => porNaCesta(i, -1)}>−</button>
                <b style={{ minWidth: 22, textAlign: 'center' }}>{i.qtd}</b>
                <button className="btn btn-secondary" style={{ padding: '0 8px' }} onClick={() => porNaCesta(i, 1)}>+</button>
                <span style={{ minWidth: 80, textAlign: 'right' }}>{R$(i.qtd * (p?.preco_par || 0) / 2)}</span></div>; })}
          </div>
        </div>}
        {prod && <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Ao clicar numa casa:</span>
            {seg<Modo>(modo, setModo, [['enviar', '📦 Enviar para loja'], ['entrada', '➕ Entrada (compra)'], ['saida', '➖ Saída (quebra)'], ['contagem', '🔢 Corrigir contagem']])}
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={reporCastanho} title="Coloca no envio as lentes que a Castanho vendeu nas OS desde o último envio">🔁 Repor o que a Castanho vendeu</button>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
            <span><b>{total}</b> lentes no laboratório ({pares(total)} pares)</span>
            <span style={{ color: '#ef4444' }}><b>{zerados}</b> graus zerados</span>
            <span style={{ color: 'var(--text-muted)' }}>{modo === 'enviar' ? 'Cada clique põe 1 lente no envio (botão direito tira).' : prod.tipo === 'mf' ? 'Contada por lado: R = direito, L = esquerdo.' : 'Contada por peça (cada olho usa 1 lente).'}</span>
          </div>
          {carregando ? <div style={{ padding: 20 }}>Carregando…</div> : prod.tipo === 'vs'
            ? <>{tabelaVS('Esférico positivo (0,00 a +6,00)', faixa(0, 6))}{tabelaVS('Esférico negativo (−0,25 a −6,00)', faixa(-0.25, -6))}</>
            : tabelaMF()}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            <span style={{ background: 'rgba(239,68,68,.25)', padding: '0 6px' }}>vermelho</span> = acabou · <span style={{ background: 'rgba(245,158,11,.22)', padding: '0 6px' }}>laranja</span> = só 1 · <span style={{ outline: '2px solid #6366f1', padding: '0 6px' }}>−2</span> = já está no envio
          </div>
        </div>}
      </>}
      {aba === 'relatorio' && <Relatorio prods={prods} />}
      {aba === 'compra' && <ListaCompra prods={prods} />}
      {aba === 'envios' && <Envios prods={prods} imprimirGuia={imprimirGuia} aoDesfazer={carregar} />}
    </div>
  );
}

// ------- Relatório do mês: o que o laboratório vendeu para as lojas -------
function Relatorio({ prods }: { prods: LabProd[] }) {
  const { tenantId } = useAuth();
  const [mes, setMes] = useState(toLocalDateStr().slice(0, 7));
  const [movs, setMovs] = useState<any[]>([]);
  const [movsAnt, setMovsAnt] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const buscar = (m: string) => { const l = limitesMes(m);
    return fetchAllRows<any>((rf, rt) => supabase.from('lab_mov').select('product_id, esf, cil, adicao, olho, delta, loja, valor_par')
      .eq('tenant_id', tenantId).eq('motivo', 'envio').gte('created_at', l.de).lt('created_at', l.ate).range(rf, rt)); };
  useEffect(() => { if (!tenantId) return; (async () => {
    setCarregando(true); const [a, b] = await Promise.all([buscar(mes), buscar(mesAnterior(mes))]); setMovs(a); setMovsAnt(b); setCarregando(false);
  })(); }, [mes, tenantId]);  // eslint-disable-line react-hooks/exhaustive-deps
  const nome = (id: string) => prods.find(p => p.product_id === id)?.nome || '?';
  const soma = (ms: any[]) => ms.reduce((s, m) => ({ pecas: s.pecas - m.delta, valor: s.valor + (-m.delta) * (+m.valor_par || 0) / 2 }), { pecas: 0, valor: 0 });
  const tot = soma(movs), totAnt = soma(movsAnt);
  const porProd = useMemo(() => {
    const m: Record<string, any[]> = {}; movs.forEach(x => { (m[x.product_id] = m[x.product_id] || []).push(x); });
    return Object.entries(m).map(([id, ms]) => ({ id, nome: nome(id), ...soma(ms), lojas: Object.fromEntries(LOJAS.map(l => [l.id, soma(ms.filter(x => x.loja === l.id))])) }))
      .sort((a, b) => b.pecas - a.pecas);
  }, [movs, prods]);  // eslint-disable-line react-hooks/exhaustive-deps
  const porLoja = LOJAS.map(l => ({ ...l, ...soma(movs.filter(x => x.loja === l.id)), ant: soma(movsAnt.filter(x => x.loja === l.id)) }));
  const topGraus = useMemo(() => {
    const m: Record<string, { id: string; esf: number; cil: number; adicao: number; olho: string; pecas: number }> = {};
    movs.forEach(x => { const k = x.product_id + chave(+x.esf, +x.cil, +x.adicao, x.olho);
      m[k] = m[k] || { id: x.product_id, esf: +x.esf, cil: +x.cil, adicao: +x.adicao, olho: x.olho, pecas: 0 }; m[k].pecas -= x.delta; });
    return Object.values(m).sort((a, b) => b.pecas - a.pecas).slice(0, 20);
  }, [movs]);
  const dif = (a: number, b: number) => !b ? '' : ` (${a >= b ? '+' : ''}${Math.round((a - b) / b * 100)}% vs mês anterior)`;
  const tipo = (id: string) => prods.find(p => p.product_id === id)?.tipo || 'vs';

  const imprimir = () => {
    const html = `<h2>Laboratório Evangelista — vendas para as lojas</h2><div class="muted">${nomeMes(mes)}</div>
      <h3>Total: ${pares(tot.pecas)} pares (${tot.pecas} lentes) = ${R$(tot.valor)}</h3><div class="muted">Mês anterior: ${pares(totAnt.pecas)} pares = ${R$(totAnt.valor)}</div>
      <h3>Por loja</h3><table><thead><tr><th>Loja</th><th class="n">Pares</th><th class="n">Valor</th><th class="n">Mês anterior</th></tr></thead><tbody>
      ${porLoja.map(l => `<tr><td>${l.nome}</td><td class="n">${pares(l.pecas)}</td><td class="n">${R$(l.valor)}</td><td class="n">${R$(l.ant.valor)}</td></tr>`).join('')}</tbody></table>
      <h3>Por lente (da que mais saiu para a que menos saiu)</h3><table><thead><tr><th>Lente</th>${LOJAS.map(l => `<th class="n">${l.curto} (pares)</th>`).join('')}<th class="n">Total pares</th><th class="n">Valor</th></tr></thead><tbody>
      ${porProd.map(p => `<tr><td>${p.nome}</td>${LOJAS.map(l => `<td class="n">${pares(p.lojas[l.id].pecas)}</td>`).join('')}<td class="n">${pares(p.pecas)}</td><td class="n">${R$(p.valor)}</td></tr>`).join('')}</tbody></table>
      <h3>Graus que mais saíram</h3><table><thead><tr><th>#</th><th>Lente</th><th>Grau</th><th class="n">Lentes</th></tr></thead><tbody>
      ${topGraus.map((x, i) => `<tr><td>${i + 1}</td><td>${nome(x.id)}</td><td>${descGrau(tipo(x.id), x.esf, x.cil, x.adicao, x.olho)}</td><td class="n">${x.pecas}</td></tr>`).join('')}</tbody></table>`;
    abrirDocumentoImprimivel({ title: `Laboratório — ${nomeMes(mes)}`, filename: `laboratorio_vendas_${mes}.pdf`, css: CSS_DOC, body: html, excel: { filename: `laboratorio_vendas_${mes}.xlsx` } });
  };
  const thS = { textAlign: 'left' as const, padding: 6, color: 'var(--text-muted)', fontSize: 12 };
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label>Mês <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className="form-input" style={{ width: 170, display: 'inline-block' }} /></label>
        <div style={{ flex: 1 }} /><button className="btn btn-secondary" onClick={imprimir}>🖨️ Imprimir / Excel</button>
      </div>
      {carregando ? <div style={{ padding: 20 }}>Carregando…</div> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 12 }}>
          <div className="card" style={{ padding: 14 }}><div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>O laboratório vendeu em {nomeMes(mes)}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{R$(tot.valor)}</div><div>{pares(tot.pecas)} pares{dif(tot.valor, totAnt.valor)}</div></div>
          {porLoja.map(l => <div key={l.id} className="card" style={{ padding: 14 }}><div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{l.nome}</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{R$(l.valor)}</div><div>{pares(l.pecas)} pares{dif(l.valor, l.ant.valor)}</div></div>)}
        </div>
        <div className="card" style={{ padding: 14, marginBottom: 12, overflowX: 'auto' }}>
          <b>Lentes que mais saíram</b>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
            <thead><tr><th style={thS}>Lente</th>{LOJAS.map(l => <th key={l.id} style={{ ...thS, textAlign: 'right' }}>{l.curto} (pares)</th>)}<th style={{ ...thS, textAlign: 'right' }}>Total pares</th><th style={{ ...thS, textAlign: 'right' }}>Valor</th></tr></thead>
            <tbody>{porProd.map(p => <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: 6 }}>{p.nome}</td>
              {LOJAS.map(l => <td key={l.id} style={{ textAlign: 'right', padding: 6 }}>{pares(p.lojas[l.id].pecas)}</td>)}
              <td style={{ textAlign: 'right', padding: 6, fontWeight: 700 }}>{pares(p.pecas)}</td><td style={{ textAlign: 'right', padding: 6, fontWeight: 700 }}>{R$(p.valor)}</td></tr>)}</tbody>
          </table>
          {!porProd.length && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Nenhum envio registrado neste mês.</div>}
        </div>
        {topGraus.length > 0 && <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
          <b>Graus que mais saíram em {nomeMes(mes)}</b>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
            <thead><tr><th style={thS}>#</th><th style={thS}>Lente</th><th style={thS}>Grau</th><th style={{ ...thS, textAlign: 'right' }}>Lentes</th></tr></thead>
            <tbody>{topGraus.map((x, i) => <tr key={i} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: 6 }}>{i + 1}</td><td>{nome(x.id)}</td>
              <td style={{ fontFamily: 'monospace' }}>{descGrau(tipo(x.id), x.esf, x.cil, x.adicao, x.olho)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{x.pecas}</td></tr>)}</tbody>
          </table></div>}
      </>}
    </div>
  );
}

// ------- Lista de compra: repor só o que gira -------
const DIAS_HIST = 90;
function ListaCompra({ prods }: { prods: LabProd[] }) {
  const { tenantId } = useAuth();
  const [meses, setMeses] = useState(2);
  const [estoque, setEstoque] = useState<any[]>([]);
  const [saidas, setSaidas] = useState<Record<string, number>>({});
  const [dias, setDias] = useState(DIAS_HIST);
  const [carregando, setCarregando] = useState(true);
  const [verParadas, setVerParadas] = useState(false);
  useEffect(() => { if (!tenantId || !prods.length) return; (async () => {
    setCarregando(true);
    const desde = new Date(Date.now() - DIAS_HIST * 864e5).toISOString();
    const ids = prods.map(p => p.product_id);
    const [est, env, os, ini] = await Promise.all([
      fetchAllRows<any>((rf, rt) => supabase.from('lab_grade').select('product_id, esf, cil, adicao, olho, quantidade').eq('tenant_id', tenantId).range(rf, rt)),
      fetchAllRows<any>((rf, rt) => supabase.from('lab_mov').select('product_id, esf, cil, adicao, olho, delta').eq('tenant_id', tenantId).eq('motivo', 'envio').gte('created_at', desde).range(rf, rt)),
      fetchAllRows<any>((rf, rt) => supabase.from('lentes_grade_mov').select('product_id, esf, cil, adicao, olho, delta').eq('tenant_id', tenantId).eq('motivo', 'os').in('product_id', ids).gte('created_at', desde).range(rf, rt)),
      supabase.from('lentes_grade_inicio').select('inicio').eq('tenant_id', tenantId).maybeSingle(),
    ]);
    // Saída de cada grau = o maior entre o que o laboratório mandou para as lojas e o que a Castanho vendeu nas OS
    // (enquanto o laboratório ainda não tem histórico de envios, as vendas da Castanho mostram o que gira).
    const somar = (ms: any[]) => { const m: Record<string, number> = {}; ms.forEach(x => { const k = x.product_id + chave(+x.esf, +x.cil, +x.adicao, x.olho); m[k] = (m[k] || 0) - x.delta; }); return m; };
    const a = somar(env), b = somar(os), s: Record<string, number> = {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => { s[k] = Math.max(a[k] || 0, b[k] || 0); });
    const inicio = ini.data?.inicio ? new Date(ini.data.inicio).getTime() : 0;
    setDias(Math.max(14, Math.min(DIAS_HIST, Math.round((Date.now() - inicio) / 864e5))));
    setEstoque(est); setSaidas(s); setCarregando(false);
  })(); }, [tenantId, prods]);

  const linhas = useMemo(() => {
    const est: Record<string, any> = {};
    estoque.forEach(x => { est[x.product_id + chave(+x.esf, +x.cil, +x.adicao, x.olho)] = x; });
    const todas = new Set([...Object.keys(est), ...Object.keys(saidas)]);
    const out: { id: string; esf: number; cil: number; adicao: number; olho: string; tem: number; saiu: number; media: number; comprar: number }[] = [];
    todas.forEach(k => {
      const id = k.slice(0, 36); const [e, c, a, o] = k.slice(36).split('|');
      if (!prods.some(p => p.product_id === id)) return;
      const tem = Math.max(0, est[k]?.quantidade ?? 0), saiu = saidas[k] || 0, media = saiu * 30 / dias;
      const comprar = saiu >= 2 ? Math.max(0, Math.ceil(media * meses) - tem) : 0;
      out.push({ id, esf: +e, cil: +c, adicao: +a, olho: o, tem, saiu, media, comprar });
    });
    return out;
  }, [estoque, saidas, meses, dias, prods]);
  const compra = linhas.filter(l => l.comprar > 0);
  const paradas = linhas.filter(l => l.tem > 0 && l.saiu === 0);
  const ordenar = (ls: typeof linhas) => [...ls].sort((x, y) => (prods.find(p => p.product_id === x.id)?.nome || '').localeCompare(prods.find(p => p.product_id === y.id)?.nome || '') || x.esf - y.esf || x.adicao - y.adicao || x.cil - y.cil || x.olho.localeCompare(y.olho));
  const tipo = (id: string) => prods.find(p => p.product_id === id)?.tipo || 'vs';
  const nome = (id: string) => prods.find(p => p.product_id === id)?.nome || '?';
  const resumo = prods.map(p => ({ ...p, pecas: compra.filter(l => l.id === p.product_id).reduce((s, l) => s + l.comprar, 0),
    paradas: paradas.filter(l => l.id === p.product_id).reduce((s, l) => s + l.tem, 0) }));
  const fmt = (n: number) => n.toFixed(1).replace('.', ',');

  const imprimir = () => {
    const html = `<h2>Laboratório Evangelista — lista de compra para reposição</h2>
      <div class="muted">${new Date().toLocaleDateString('pt-BR')} · só os graus que saíram 2 ou mais nos últimos ${dias} dias, para cobrir ${meses} ${meses > 1 ? 'meses' : 'mês'}. Os graus parados ficaram de fora.</div>
      ${prods.map(p => { const ls = ordenar(compra.filter(l => l.id === p.product_id)); if (!ls.length) return '';
        return `<h3>${p.nome} — comprar ${ls.reduce((s, l) => s + l.comprar, 0)} lentes</h3><table><thead><tr><th>Grau</th><th class="n">Tem</th><th class="n">Saiu (${dias} dias)</th><th class="n">Comprar</th></tr></thead><tbody>
        ${ls.map(l => `<tr><td>${descGrau(p.tipo, l.esf, l.cil, l.adicao, l.olho)}</td><td class="n">${l.tem}</td><td class="n">${l.saiu}</td><td class="n"><b>${l.comprar}</b></td></tr>`).join('')}</tbody></table>`; }).join('')}`;
    abrirDocumentoImprimivel({ title: 'Lista de compra do laboratório', filename: `lista_compra_laboratorio_${toLocalDateStr()}.pdf`, css: CSS_DOC, body: html,
      excel: { filename: `lista_compra_laboratorio_${toLocalDateStr()}.xlsx` } });
  };
  const thS = { textAlign: 'left' as const, padding: 6, color: 'var(--text-muted)', fontSize: 12 };
  if (carregando) return <div style={{ padding: 20 }}>Carregando…</div>;
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label>Comprar para cobrir <select className="form-input" style={{ width: 120, display: 'inline-block' }} value={meses} onChange={e => setMeses(+e.target.value)}>
          <option value={1}>1 mês</option><option value={2}>2 meses</option><option value={3}>3 meses</option></select></label>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Conta o que saiu nos últimos {dias} dias (envios do laboratório e vendas da Castanho). Só entram os graus que saíram 2 ou mais.</span>
        <div style={{ flex: 1 }} /><button className="btn btn-secondary" onClick={imprimir} disabled={!compra.length}>🖨️ Imprimir / Excel</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 12 }}>
        {resumo.map(r => <div key={r.product_id} className="card" style={{ padding: 12 }}><b>{r.nome}</b>
          <div style={{ fontSize: 20, fontWeight: 800, color: r.pecas ? '#ef4444' : 'var(--text-muted)' }}>{r.pecas} <span style={{ fontSize: 12, fontWeight: 400 }}>lentes a comprar</span></div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.paradas} lentes paradas (não comprar)</div></div>)}
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 12, overflowX: 'auto' }}>
        <b>🛒 Comprar ({compra.length} graus)</b>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 6 }}>
          <thead><tr><th style={thS}>Lente</th><th style={thS}>Grau</th><th style={{ ...thS, textAlign: 'right' }}>Tem</th><th style={{ ...thS, textAlign: 'right' }}>Saiu ({dias} dias)</th><th style={{ ...thS, textAlign: 'right' }}>Média/mês</th><th style={{ ...thS, textAlign: 'right' }}>Comprar</th></tr></thead>
          <tbody>{ordenar(compra).map((l, i) => <tr key={i} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: 6 }}>{nome(l.id)}</td>
            <td style={{ fontFamily: 'monospace' }}>{descGrau(tipo(l.id), l.esf, l.cil, l.adicao, l.olho)}</td><td style={{ textAlign: 'right' }}>{l.tem}</td>
            <td style={{ textAlign: 'right' }}>{l.saiu}</td><td style={{ textAlign: 'right' }}>{fmt(l.media)}</td><td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{l.comprar}</td></tr>)}</tbody>
        </table>
        {!compra.length && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Nada para comprar: o estoque cobre o que está saindo.</div>}
      </div>
      <div className="card" style={{ padding: 14 }}>
        <b>🧊 Paradas: têm estoque e não saíram nos últimos {dias} dias ({paradas.length} graus)</b>{' '}
        <button className="btn btn-secondary" style={{ padding: '2px 8px', marginLeft: 8 }} onClick={() => setVerParadas(!verParadas)}>{verParadas ? 'esconder' : 'ver'}</button>
        {verParadas && <div style={{ maxHeight: 400, overflowY: 'auto', marginTop: 6 }}>{ordenar(paradas).map((l, i) =>
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
            <span>{nome(l.id)} — <span style={{ fontFamily: 'monospace' }}>{descGrau(tipo(l.id), l.esf, l.cil, l.adicao, l.olho)}</span></span><span>tem {l.tem}</span></div>)}</div>}
      </div>
    </div>
  );
}

// ------- Envios feitos -------
function Envios({ prods, imprimirGuia, aoDesfazer }: { prods: LabProd[]; imprimirGuia: (en: any, itens: any[]) => void; aoDesfazer: () => void }) {
  const { tenantId } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const carregar = () => supabase.from('lab_envios').select('*').eq('tenant_id', tenantId).order('numero', { ascending: false }).limit(200)
    .then(({ data }) => setRows(data || []));
  useEffect(() => { if (tenantId) carregar(); }, [tenantId]);  // eslint-disable-line react-hooks/exhaustive-deps
  const reimprimir = async (en: any) => {
    const { data } = await supabase.from('lab_mov').select('product_id, esf, cil, adicao, olho, delta, valor_par').eq('envio_id', en.id);
    imprimirGuia(en, (data || []).map((m: any) => ({ product_id: m.product_id, esf: +m.esf, cil: +m.cil, adicao: +m.adicao, olho: m.olho, qtd: -m.delta, valor_par: +m.valor_par })));
  };
  const desfazer = async (en: any) => {
    if (!window.confirm(`Desfazer o envio nº ${en.numero} para ${en.loja_nome}?\nAs lentes voltam para o laboratório${en.loja === 'castanho' ? ' e saem do estoque da Castanho' : ''}.`)) return;
    const { error } = await supabase.rpc('lab_desfazer_envio', { p_envio: en.id });
    if (error) { toast.error(error.message); return; }
    toast.success('Envio desfeito ✓'); carregar(); aoDesfazer();
  };
  return (
    <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}><th style={{ padding: 6 }}>Nº</th><th>Quando</th><th>Loja</th><th style={{ textAlign: 'right' }}>Pares</th><th style={{ textAlign: 'right' }}>Valor</th><th>Obs.</th><th></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id} style={{ borderTop: '1px solid var(--border)', opacity: r.desfeito ? .5 : 1 }}>
          <td style={{ padding: 6, fontWeight: 700 }}>{r.numero}</td><td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
          <td>{nomeLoja(r.loja)}</td><td style={{ textAlign: 'right' }}>{pares(r.pecas)}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{R$(+r.valor)}</td>
          <td>{r.desfeito ? <i>desfeito</i> : r.obs}</td>
          <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{!r.desfeito && <>
            <button className="btn btn-secondary" style={{ padding: '2px 8px' }} onClick={() => reimprimir(r)}>🖨️ Folha</button>{' '}
            <button className="btn btn-secondary" style={{ padding: '2px 8px', color: '#ef4444' }} onClick={() => desfazer(r)}>Desfazer</button></>}</td></tr>)}</tbody>
      </table>
      {!rows.length && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Nenhum envio ainda.</div>}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{prods.length} lentes no estoque do laboratório.</div>
    </div>
  );
}

import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Check, Search, EyeOff, Sun, MonitorSmartphone, ShieldCheck, CloudFog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { norm } from '../utils/normalize';

const TRATAMENTOS = [
  { id: 'antirreflexo', name: 'Antirreflexo', Icon: EyeOff, desc: 'Reduz reflexos, melhora a nitidez à noite e no computador.' },
  { id: 'fotossensivel', name: 'Fotossensível', Icon: Sun, desc: 'Escurece no sol e volta ao normal em ambiente fechado.' },
  { id: 'blue', name: 'Filtro Luz Azul', Icon: MonitorSmartphone, desc: 'Filtra luz azul de telas, reduz o cansaço visual.' },
  { id: 'antirrisco', name: 'Antirrisco', Icon: ShieldCheck, desc: 'Camada protetora que reduz riscos no dia a dia.' },
  { id: 'antiembacante', name: 'Antiembaçante', Icon: CloudFog, desc: 'Evita embaçamento da lente em dias frios, chuva ou troca de ambiente.' },
];

const MATERIAIS = [
  { id: 'resina', name: 'Resina (CR-39) — 1.50', n: 1.50 },
  { id: 'trivex', name: 'Trivex — 1.53', n: 1.53 },
  { id: 'poli', name: 'Policarbonato — 1.59', n: 1.59 },
  { id: 'alto161', name: 'Alto índice 1.61', n: 1.61 },
  { id: 'alto167', name: 'Alto índice 1.67', n: 1.67 },
  { id: 'alto174', name: 'Alto índice 1.74', n: 1.74 },
];

// Espessura minima de seguranca por tipo de lente (confirmado com Carlos 22/07/2026):
// lente negativa (miopia) -> minimo no CENTRO e 1.5mm (a borda fica mais grossa)
// lente positiva (hipermetropia) -> minimo na BORDA e 1.0mm (o centro fica mais grosso)
const MIN_CENTRO_NEGATIVA = 1.5;
const MIN_BORDA_POSITIVA = 1.0;

const CATEGORIAS_LENTE = ['Lente de Grau', 'Lente Solar'];

// Silhueta estilizada de lente (recorte usado nas cenas comparativas)
const LENS_PATH = 'M20,110 Q22,42 100,28 Q220,10 298,55 Q316,110 298,165 Q220,210 100,192 Q22,178 20,110 Z';

interface ProdutoLente {
  id: string;
  name: string;
  brand?: string;
  category: string;
  sale_price: number;
  refractive_index?: number;
}

function fmtMm(v: number) { return v.toFixed(2).replace('.', ',') + ' mm'; }
function fmtD(v: number) { return (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ','); }
function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

// ── Cenas com foto real + filtro sobreposto (mesma foto nos dois lados) ────
// As fotos ficam em public/vitrine/*.jpg (livres para uso comercial, baixadas
// pelo lojista de Pexels/Unsplash/Pixabay). O efeito do tratamento e um filtro
// desenhado por cima da MESMA foto — nao sao fotos diferentes lado a lado.

const FOTOS: Record<string, string> = {
  antirreflexo: '/vitrine/antirreflexo.jpg',
  fotossensivel: '/vitrine/fotossensivel.jpg',
  blue: '/vitrine/blue.jpg',
  antirrisco: '/vitrine/antirrisco.jpg',
  antiembacante: '/vitrine/antiembacante.jpg',
};

function FotoBase({ id }: { id: string }) {
  return <image href={FOTOS[id]} x={0} y={0} width={320} height={220} preserveAspectRatio="xMidYMid slice" />;
}

function CenaAntirreflexo({ resolvido }: { resolvido: boolean }) {
  return (
    <g>
      <FotoBase id="antirreflexo" />
      {!resolvido && <rect x={0} y={0} width={320} height={220} fill="url(#glareGrad)" />}
    </g>
  );
}

function CenaFotossensivel({ resolvido }: { resolvido: boolean }) {
  return (
    <g>
      <FotoBase id="fotossensivel" />
      {resolvido && <rect x={0} y={0} width={320} height={220} fill="#3b2f22" opacity={0.68} />}
    </g>
  );
}

function CenaLuzAzul({ resolvido }: { resolvido: boolean }) {
  return (
    <g>
      <FotoBase id="blue" />
      <rect x={0} y={0} width={320} height={220} fill="#2a5bd6" opacity={resolvido ? 0.08 : 0.32} />
    </g>
  );
}

// Riscos na superficie da lente (posicoes fixas, nao aleatorias -- consistentes entre renders)
const RISCOS = [
  [15, 40, 90, 95], [140, 30, 200, 75], [40, 120, 110, 165],
  [180, 100, 250, 145], [230, 165, 290, 145], [70, 170, 130, 150],
];

function CenaAntirrisco({ resolvido }: { resolvido: boolean }) {
  return (
    <g>
      <FotoBase id="antirrisco" />
      {!resolvido && RISCOS.map((r, i) => (
        <line key={i} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} stroke="#ffffff" strokeWidth={1.3} opacity={0.55} />
      ))}
    </g>
  );
}

// Gotas de chuva / embacado na lente (posicoes fixas)
const GOTAS = [
  [30, 40, 6], [70, 90, 8], [110, 35, 5], [150, 110, 9], [190, 55, 6],
  [225, 130, 7], [260, 70, 5], [45, 150, 7], [280, 40, 6], [130, 170, 8],
  [200, 175, 6], [20, 100, 5],
];

function CenaAntiembacante({ resolvido }: { resolvido: boolean }) {
  return (
    <g>
      <FotoBase id="antiembacante" />
      {!resolvido && (
        <>
          <rect x={0} y={0} width={320} height={220} fill="#ffffff" opacity={0.12} />
          {GOTAS.map(([cx, cy, r], i) => (
            <g key={i}>
              <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.25} fill="#bcd7ee" opacity={0.35} />
              <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.25} fill="none" stroke="#eaf4ff" strokeWidth={0.7} opacity={0.5} />
              <ellipse cx={cx - r * 0.3} cy={cy - r * 0.4} rx={r * 0.3} ry={r * 0.4} fill="#ffffff" opacity={0.6} />
            </g>
          ))}
        </>
      )}
    </g>
  );
}

const CENAS: Record<string, React.ComponentType<{ resolvido: boolean }>> = {
  antirreflexo: CenaAntirreflexo,
  fotossensivel: CenaFotossensivel,
  blue: CenaLuzAzul,
  antirrisco: CenaAntirrisco,
  antiembacante: CenaAntiembacante,
};

function LensCompare({ tratamentoId, big }: { tratamentoId: string; big?: boolean }) {
  const Cena = CENAS[tratamentoId];
  const svgRef = useRef<SVGSVGElement>(null);
  const [divisor, setDivisor] = useState(160);
  const draggingRef = useRef(false);

  const moverPara = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * 320;
    setDivisor(Math.max(20, Math.min(300, relX)));
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => { if (draggingRef.current) moverPara(e.clientX); };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, []);

  if (!Cena) return null;
  const clipId = `lensclip-${tratamentoId}`;
  const revealId = `revealclip-${tratamentoId}`;
  return (
    <div style={{ background: '#0b1120', borderRadius: 12, overflow: 'hidden', touchAction: 'none' }}>
      <svg ref={svgRef} viewBox="0 0 320 220" style={{ width: '100%', height: big ? 440 : 340, display: 'block', cursor: 'ew-resize' }}
        onPointerDown={e => { draggingRef.current = true; moverPara(e.clientX); }}>
        <defs>
          <clipPath id={clipId}><path d={LENS_PATH} /></clipPath>
          <clipPath id={revealId}><rect x={0} y={0} width={divisor} height={220} /></clipPath>
          <radialGradient id="glareGrad" cx="50%" cy="55%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </radialGradient>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <Cena resolvido={true} />
          <g clipPath={`url(#${revealId})`}><Cena resolvido={false} /></g>
        </g>
        <path d={LENS_PATH} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={2} />
        <line x1={divisor} y1={14} x2={divisor} y2={206} stroke="#ffffff" strokeWidth={2} />
        <circle cx={divisor} cy={110} r={13} fill="#ffffff" />
        <path d={`M${divisor - 5},105 L${divisor - 10},110 L${divisor - 5},115 M${divisor + 5},105 L${divisor + 10},110 L${divisor + 5},115`}
          stroke="#0b1120" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x={Math.max(35, divisor - 40)} y={200} fontSize={12} fill="#ffffffcc" textAnchor="middle" style={{ paintOrder: 'stroke', stroke: '#0b1120', strokeWidth: 3 }}>Sem</text>
        <text x={Math.min(285, divisor + 40)} y={200} fontSize={12} fill="#ffffffcc" textAnchor="middle" style={{ paintOrder: 'stroke', stroke: '#0b1120', strokeWidth: 3 }}>Com</text>
      </svg>
    </div>
  );
}

// Diagrama do perfil da lente (corte transversal estilizado) para a calculadora de espessura.
// Proporcoes sao exageradas para leitura visual -- os valores reais (mm) vao no texto ao lado.
function PerfilLente({ centro, borda, positiva }: { centro: number; borda: number; positiva: boolean }) {
  // Meia-espessura em px (proporcao ilustrativa, nao em escala real) em torno da linha central y=45.
  // Positiva (convexa): centro bem mais grosso que a borda. Negativa (concava): borda bem mais grossa que o centro.
  const centerHalf = positiva ? 20 : 4;
  const edgeHalf = positiva ? 6 : 16;
  const yTopEdge = 45 - edgeHalf, yBotEdge = 45 + edgeHalf;
  const yTopCenter = 45 - centerHalf, yBotCenter = 45 + centerHalf;
  const d = `M20,${yTopEdge} Q130,${yTopCenter} 240,${yTopEdge} L240,${yBotEdge} Q130,${yBotCenter} 20,${yBotEdge} Z`;
  return (
    <svg viewBox="0 0 260 90" style={{ width: '100%', height: 90 }}>
      <path d={d} fill="rgba(99,102,241,.18)" stroke="#6366f1" strokeWidth={1.5} />
      <line x1={130} y1={4} x2={130} y2={yTopCenter} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2,2" />
      <text x={130} y={12} fontSize={9} fill="var(--text-muted)" textAnchor="middle">{fmtMm(centro)} centro</text>
      <line x1={20} y1={yTopEdge - 12} x2={20} y2={yTopEdge} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2,2" />
      <text x={20} y={yTopEdge - 15} fontSize={9} fill="var(--text-muted)" textAnchor="middle">{fmtMm(borda)} borda</text>
    </svg>
  );
}

interface Props {
  onClose: () => void;
  onConfirm: (data: { descricao: string; obsLab: string }) => void;
}

export default function VitrineLentes({ onClose, onConfirm }: Props) {
  const { tenantId } = useAuth();
  const [produtos, setProdutos] = useState<ProdutoLente[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [busca, setBusca] = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('Lente de Grau');
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoLente | null>(null);

  const [tratamentos, setTratamentos] = useState<Set<string>>(new Set());
  const [tratamentoFoco, setTratamentoFoco] = useState<string | null>(null);
  const [apresentacao, setApresentacao] = useState(false);
  const [materialId, setMaterialId] = useState('resina');
  const [diametro, setDiametro] = useState(52);
  const [dioptria, setDioptria] = useState(-2);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoadingProdutos(true);
      const { data } = await supabase.from('products')
        .select('id,name,brand,category,sale_price,refractive_index')
        .eq('tenant_id', tenantId).eq('active', true)
        .in('category', CATEGORIAS_LENTE)
        .order('name');
      setProdutos((data as ProdutoLente[]) || []);
      setLoadingProdutos(false);
    })();
  }, [tenantId]);

  const produtosFiltrados = useMemo(() => {
    let list = produtos.filter(p => p.category === categoriaAtiva);
    if (busca.trim()) {
      const b = norm(busca);
      list = list.filter(p => norm(p.name).includes(b) || norm(p.brand || '').includes(b));
    }
    return list;
  }, [produtos, categoriaAtiva, busca]);

  const toggleTratamento = (id: string) => {
    setTratamentos(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); if (tratamentoFoco === id) setTratamentoFoco([...next][0] || null); }
      else if (next.size < 5) { next.add(id); setTratamentoFoco(id); }
      return next;
    });
  };

  // Índice de refração: usa o do produto selecionado se existir; senão cai no material manual.
  const materialManual = MATERIAIS.find(m => m.id === materialId) || MATERIAIS[0];
  const indiceEfetivo = produtoSelecionado?.refractive_index || materialManual.n;
  const usandoIndiceDoProduto = !!produtoSelecionado?.refractive_index;

  const { centro, borda } = useMemo(() => {
    const r = diametro / 2;
    const delta = (Math.abs(dioptria) * r * r) / (2000 * (indiceEfetivo - 1));
    if (dioptria <= 0) return { centro: MIN_CENTRO_NEGATIVA, borda: MIN_CENTRO_NEGATIVA + delta };
    return { centro: MIN_BORDA_POSITIVA + delta, borda: MIN_BORDA_POSITIVA };
  }, [diametro, dioptria, indiceEfetivo]);

  const tratamentosSelecionados = TRATAMENTOS.filter(t => tratamentos.has(t.id));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 900, width: '95%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Vitrine de Lentes e Tratamentos</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Escolher lente</div>
            <button type="button" className="btn btn-secondary" onClick={() => setApresentacao(v => !v)} style={{ fontSize: 12 }}>
              {apresentacao ? 'Sair do modo apresentação' : 'Modo apresentação'}
            </button>
          </div>

          {!apresentacao && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {CATEGORIAS_LENTE.map(c => (
                <button key={c} type="button" onClick={() => { setCategoriaAtiva(c); setProdutoSelecionado(null); }}
                  className={categoriaAtiva === c ? 'btn btn-primary' : 'btn btn-secondary'} style={{ fontSize: 12 }}>
                  {c}
                </button>
              ))}
            </div>
            <div className="search-bar" style={{ marginBottom: 10 }}>
              <Search size={15} />
              <input className="form-input" placeholder="Buscar por nome ou marca..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {loadingProdutos ? (
                <div style={{ padding: 14, fontSize: 13, color: 'var(--text-muted)' }}>Carregando produtos...</div>
              ) : produtosFiltrados.length === 0 ? (
                <div style={{ padding: 14, fontSize: 13, color: 'var(--text-muted)' }}>
                  Nenhum produto cadastrado em "{categoriaAtiva}" ainda. Cadastre em Produtos para aparecer aqui.
                </div>
              ) : produtosFiltrados.map(p => (
                <div key={p.id} onClick={() => setProdutoSelecionado(p)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: produtoSelecionado?.id === p.id ? 'rgba(99,102,241,.12)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                  }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {p.brand || 'Sem marca'}{p.refractive_index ? ` · índice ${p.refractive_index.toFixed(2)}` : ''}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#6366f1' }}>{fmtBRL(p.sale_price)}</div>
                </div>
              ))}
            </div>
          </div>
          )}

          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Tratamentos</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
              {TRATAMENTOS.map(t => {
                const ativo = tratamentos.has(t.id);
                const Icon = t.Icon;
                return (
                  <div key={t.id} onClick={() => toggleTratamento(t.id)}
                    style={{
                      cursor: 'pointer', textAlign: 'center', borderRadius: 12, padding: apresentacao ? '1.5rem 1rem' : '1rem',
                      background: ativo ? 'rgba(99,102,241,.1)' : 'rgba(255,255,255,.03)',
                      border: ativo ? '2px solid #6366f1' : '1px solid var(--border)',
                    }}>
                    <Icon size={apresentacao ? 32 : 24} color="#6366f1" style={{ margin: '0 auto' }} />
                    <div style={{ fontWeight: 600, fontSize: apresentacao ? 15 : 13, margin: '8px 0 4px' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {tratamentoFoco && CENAS[tratamentoFoco] && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Simulação — {TRATAMENTOS.find(t => t.id === tratamentoFoco)?.name}
              </div>
              <LensCompare tratamentoId={tratamentoFoco} big={apresentacao} />
              {tratamentosSelecionados.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {tratamentosSelecionados.map(t => (
                    <button key={t.id} type="button" onClick={() => setTratamentoFoco(t.id)}
                      className={tratamentoFoco === t.id ? 'btn btn-primary' : 'btn btn-secondary'} style={{ fontSize: 11 }}>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {produtoSelecionado && (
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{produtoSelecionado.name} {produtoSelecionado.brand ? `— ${produtoSelecionado.brand}` : ''}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtBRL(produtoSelecionado.sale_price)}</div>
            </div>
          )}

          {!apresentacao && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Calculadora de Espessura</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="form-label">Índice de refração</label>
                {usandoIndiceDoProduto ? (
                  <div className="form-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                    {indiceEfetivo.toFixed(2)} (do produto selecionado)
                  </div>
                ) : (
                  <select className="form-input" value={materialId} onChange={e => setMaterialId(e.target.value)}>
                    {MATERIAIS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="form-label">Diâmetro da lente (mm)</label>
                <input className="form-input" type="number" step="1" value={diametro} onChange={e => setDiametro(parseFloat(e.target.value) || 52)} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <label className="form-label" style={{ margin: 0 }}>Dioptria esférica</label>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{fmtD(dioptria)}</span>
              </div>
              <input type="range" min="-12" max="12" step="0.25" value={dioptria} onChange={e => setDioptria(parseFloat(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'center' }}>
              <PerfilLente centro={centro} borda={borda} positiva={dioptria > 0} />
              <div style={{ background: 'rgba(99,102,241,.08)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ESPESSURA NO CENTRO</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>{fmtMm(centro)}</div>
              </div>
              <div style={{ background: 'rgba(99,102,241,.08)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ESPESSURA NA BORDA</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>{fmtMm(borda)}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>Estimativa aproximada, para orientar a conversa com o cliente. Não substitui o cálculo do laboratório. Perfil ilustrativo, proporções exageradas para leitura.</div>
          </div>
          )}

        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => {
            const partes = [
              produtoSelecionado ? `${produtoSelecionado.name}${produtoSelecionado.brand ? ' — ' + produtoSelecionado.brand : ''}` : null,
              ...tratamentosSelecionados.map(t => t.name),
            ].filter(Boolean);
            const descricao = partes.join(' + ');
            const refProduto = produtoSelecionado ? `Produto: ${produtoSelecionado.name} (${fmtBRL(produtoSelecionado.sale_price)}). ` : '';
            const obsLab = refProduto + 'Espessura estimada (índice ' + indiceEfetivo.toFixed(2) + ', ' + fmtD(dioptria) + ', diâmetro ' + diametro + 'mm): centro ' + fmtMm(centro) + ' / borda ' + fmtMm(borda) + '.';
            onConfirm({ descricao, obsLab });
          }}>
            <Check size={15} /> Usar esta seleção
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { X, Check, Search, EyeOff, Sun, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { norm } from '../utils/normalize';

const TRATAMENTOS = [
  { id: 'antirreflexo', name: 'Antirreflexo', Icon: EyeOff, desc: 'Reduz reflexos, melhora a nitidez à noite e no computador.' },
  { id: 'fotossensivel', name: 'Fotossensível', Icon: Sun, desc: 'Escurece no sol e volta ao normal em ambiente fechado.' },
  { id: 'blue', name: 'Filtro Luz Azul', Icon: MonitorSmartphone, desc: 'Filtra luz azul de telas, reduz o cansaço visual.' },
  { id: 'antirrisco', name: 'Antirrisco', Icon: ShieldCheck, desc: 'Camada protetora que reduz riscos no dia a dia.' },
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
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
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
      <div className="modal" style={{ maxWidth: 860, width: '95%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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

          {(produtoSelecionado || tratamentosSelecionados.length >= 2) && (
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Resumo da seleção</div>
              {produtoSelecionado && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{produtoSelecionado.name} {produtoSelecionado.brand ? `— ${produtoSelecionado.brand}` : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtBRL(produtoSelecionado.sale_price)}</div>
                </div>
              )}
              {tratamentosSelecionados.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tratamentosSelecionados.length},1fr)`, gap: 10 }}>
                  {tratamentosSelecionados.map(t => (
                    <div key={t.id}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: 'rgba(99,102,241,.08)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ESPESSURA NO CENTRO</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>{fmtMm(centro)}</div>
              </div>
              <div style={{ background: 'rgba(99,102,241,.08)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ESPESSURA NA BORDA</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>{fmtMm(borda)}</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>Estimativa aproximada, para orientar a conversa com o cliente. Não substitui o cálculo do laboratório.</div>
          </div>

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

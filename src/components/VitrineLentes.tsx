import { useState, useMemo } from 'react';
import { X, Check } from 'lucide-react';

const TIPOS = [
  { id: 'simples', name: 'Visão Simples', icon: '○', desc: 'Uma única correção para longe ou perto.' },
  { id: 'multifocal', name: 'Multifocal', icon: '◐', desc: 'Longe, meio e perto na mesma lente, sem linha visível.' },
  { id: 'bifocal', name: 'Bifocal', icon: '◑', desc: 'Duas zonas de foco com linha visível, mais econômica.' },
];

const TRATAMENTOS = [
  { id: 'antirreflexo', name: 'Antirreflexo', icon: '✦', desc: 'Reduz reflexos, melhora a nitidez à noite e no computador.' },
  { id: 'fotossensivel', name: 'Fotossensível', icon: '☀', desc: 'Escurece no sol e volta ao normal em ambiente fechado.' },
  { id: 'blue', name: 'Filtro Luz Azul', icon: '⬒', desc: 'Filtra luz azul de telas, reduz o cansaço visual.' },
  { id: 'antirrisco', name: 'Antirrisco', icon: '⛨', desc: 'Camada protetora que reduz riscos no dia a dia.' },
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

function fmtMm(v: number) { return v.toFixed(2).replace('.', ',') + ' mm'; }
function fmtD(v: number) { return (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ','); }

interface Props {
  onClose: () => void;
  onConfirm: (data: { descricao: string; obsLab: string }) => void;
}

export default function VitrineLentes({ onClose, onConfirm }: Props) {
  const [tipo, setTipo] = useState('simples');
  const [tratamentos, setTratamentos] = useState<Set<string>>(new Set());
  const [apresentacao, setApresentacao] = useState(false);
  const [materialId, setMaterialId] = useState('resina');
  const [diametro, setDiametro] = useState(52);
  const [dioptria, setDioptria] = useState(-2);

  const toggleTratamento = (id: string) => {
    setTratamentos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  const material = MATERIAIS.find(m => m.id === materialId) || MATERIAIS[0];

  const { centro, borda } = useMemo(() => {
    const r = diametro / 2;
    const delta = (Math.abs(dioptria) * r * r) / (2000 * (material.n - 1));
    if (dioptria <= 0) return { centro: MIN_CENTRO_NEGATIVA, borda: MIN_CENTRO_NEGATIVA + delta };
    return { centro: MIN_BORDA_POSITIVA + delta, borda: MIN_BORDA_POSITIVA };
  }, [diametro, dioptria, material]);

  const selecionados = [
    TIPOS.find(t => t.id === tipo),
    ...TRATAMENTOS.filter(t => tratamentos.has(t.id)),
  ].filter(Boolean) as { id: string; name: string; desc: string }[];

  const card = (item: { id: string; name: string; icon: string; desc: string }, ativo: boolean, onClick: () => void) => (
    <div key={item.id} onClick={onClick}
      style={{
        cursor: 'pointer', textAlign: 'center', borderRadius: 12, padding: apresentacao ? '1.5rem 1rem' : '1rem',
        background: ativo ? 'rgba(99,102,241,.1)' : 'rgba(255,255,255,.03)',
        border: ativo ? '2px solid #6366f1' : '1px solid var(--border)',
      }}>
      <div style={{ fontSize: apresentacao ? 32 : 24, color: '#6366f1' }}>{item.icon}</div>
      <div style={{ fontWeight: 600, fontSize: apresentacao ? 15 : 13, margin: '8px 0 4px' }}>{item.name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.desc}</div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 820, width: '95%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Vitrine de Lentes e Tratamentos</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo de Lente</div>
            <button type="button" className="btn btn-secondary" onClick={() => setApresentacao(v => !v)} style={{ fontSize: 12 }}>
              {apresentacao ? 'Sair do modo apresentação' : 'Modo apresentação'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            {TIPOS.map(t => card(t, tipo === t.id, () => setTipo(t.id)))}
          </div>

          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Tratamentos</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
              {TRATAMENTOS.map(t => card(t, tratamentos.has(t.id), () => toggleTratamento(t.id)))}
            </div>
          </div>

          {selecionados.length >= 2 && (
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Comparando</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${selecionados.length},1fr)`, gap: 10 }}>
                {selecionados.map(s => (
                  <div key={s.id}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Calculadora de Espessura</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="form-label">Material</label>
                <select className="form-input" value={materialId} onChange={e => setMaterialId(e.target.value)}>
                  {MATERIAIS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
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
            const descricao = selecionados.map(s => s.name).join(' + ');
            const obsLab = 'Espessura estimada (' + material.name + ', ' + fmtD(dioptria) + ', diâmetro ' + diametro + 'mm): centro ' + fmtMm(centro) + ' / borda ' + fmtMm(borda) + '.';
            onConfirm({ descricao, obsLab });
          }}>
            <Check size={15} /> Usar esta seleção
          </button>
        </div>
      </div>
    </div>
  );
}

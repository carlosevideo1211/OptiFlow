import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Upload, RotateCcw, Camera } from 'lucide-react';

// Medidas Digitais via Foto — DNP e ACO calculados a partir de 3 medidas
// conhecidas da armação (Ponte, Aro horizontal, Aro vertical) informadas
// pelo vendedor, e 12 marcadores arrastáveis posicionados sobre a foto.
//
// Lógica validada com o Carlos em 06/08/2026 (protótipo isolado testado
// antes de integrar aqui):
// - DNP usa escala LOCAL da ponte (mais próxima do ponto de interesse,
//   sofre menos com rotação de cabeça do que usar a largura da armação
//   inteira) — distância direta do centro da ponte até a pupila, sem soma.
// - ACO usa escala vertical de CADA OLHO separadamente — soma ou subtrai
//   o offset do centro até a pupila, dependendo se a pupila está acima
//   (soma) ou abaixo (subtrai) do centro vertical daquele aro.
// - Calibração é feita por olho (horizontal e vertical), não pela
//   armação inteira, também para reduzir erro de rotação da cabeça.

type Kind = 'esqH' | 'dirH' | 'supV' | 'infV' | 'pupila' | 'ponteEsq' | 'ponteDir';
type Eye = 'OD' | 'OE' | 'ponte';
interface Handle { eye: Eye; kind: Kind; color: string; orient: 'v' | 'h'; x: number; y: number; }

const HANDLE_DEFS: Omit<Handle, 'x' | 'y'>[] = [
  { eye: 'OD', kind: 'esqH', color: '#378ADD', orient: 'v' },
  { eye: 'OD', kind: 'dirH', color: '#378ADD', orient: 'v' },
  { eye: 'OD', kind: 'supV', color: '#1D9E75', orient: 'h' },
  { eye: 'OD', kind: 'infV', color: '#1D9E75', orient: 'h' },
  { eye: 'OD', kind: 'pupila', color: '#C2478D', orient: 'v' },
  { eye: 'ponte', kind: 'ponteEsq', color: '#8B5CF6', orient: 'v' },
  { eye: 'ponte', kind: 'ponteDir', color: '#8B5CF6', orient: 'v' },
  { eye: 'OE', kind: 'esqH', color: '#378ADD', orient: 'v' },
  { eye: 'OE', kind: 'dirH', color: '#378ADD', orient: 'v' },
  { eye: 'OE', kind: 'supV', color: '#1D9E75', orient: 'h' },
  { eye: 'OE', kind: 'infV', color: '#1D9E75', orient: 'h' },
  { eye: 'OE', kind: 'pupila', color: '#C2478D', orient: 'v' },
];
const DEFAULT_FRAC: Record<string, [number, number]> = {
  'OD-esqH': [0.14, 0.32], 'OD-dirH': [0.34, 0.32],
  'OD-supV': [0.24, 0.25], 'OD-infV': [0.24, 0.40],
  'OD-pupila': [0.24, 0.32],
  'ponte-ponteEsq': [0.42, 0.32], 'ponte-ponteDir': [0.58, 0.32],
  'OE-esqH': [0.66, 0.32], 'OE-dirH': [0.86, 0.32],
  'OE-supV': [0.76, 0.25], 'OE-infV': [0.76, 0.40],
  'OE-pupila': [0.76, 0.32],
};

interface Resultado { odDnp: number; oeDnp: number; odAco: number; oeAco: number; }

export default function MedidasDigitaisModal({
  onClose, onConfirm, ponteInicial,
}: {
  onClose: () => void;
  onConfirm: (r: Resultado) => void;
  ponteInicial?: string | number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const handlesRef = useRef<Handle[]>([]);
  const draggingRef = useRef<Handle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ponte, setPonte] = useState(ponteInicial ? String(ponteInicial) : '18');
  const [aroH, setAroH] = useState('52');
  const [aroV, setAroV] = useState('38');
  const [hasImg, setHasImg] = useState(false);
  const [resultado, setResultado] = useState<{ od: { dnp: number; aco: number }; oe: { dnp: number; aco: number } } | null>(null);
  const [loupeStyle, setLoupeStyle] = useState<{ left: number; top: number; display: string }>({ left: 0, top: 0, display: 'none' });

  const find = useCallback((eye: Eye, kind: Kind) => handlesRef.current.find(h => h.eye === eye && h.kind === kind)!, []);

  const compute = useCallback(() => {
    if (!handlesRef.current.length) return;
    const aroHmm = parseFloat(aroH) || 0;
    const aroVmm = parseFloat(aroV) || 0;
    const ponteMm = parseFloat(ponte) || 0;
    const pE = find('ponte', 'ponteEsq'), pD = find('ponte', 'ponteDir');
    const distPonte = Math.hypot(pD.x - pE.x, pD.y - pE.y);
    const scalePonte = distPonte > 0 ? ponteMm / distPonte : 0;
    const cxPonte = (pE.x + pD.x) / 2, cyPonte = (pE.y + pD.y) / 2;

    function calcEye(eye: 'OD' | 'OE') {
      const sup = find(eye, 'supV'), inf = find(eye, 'infV');
      const pup = find(eye, 'pupila');
      const distV = Math.hypot(inf.x - sup.x, inf.y - sup.y);
      const scaleV = distV > 0 ? aroVmm / distV : 0;
      const dnp = Math.hypot(pup.x - cxPonte, pup.y - cyPonte) * scalePonte;
      const cyV = (sup.y + inf.y) / 2;
      const offsetPx = cyV - pup.y;
      const aco = aroVmm / 2 + offsetPx * scaleV;
      return { dnp, aco };
    }
    setResultado({ od: calcEye('OD'), oe: calcEye('OE') });
  }, [aroH, aroV, ponte, find]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current, img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1;

    for (const eye of ['OD', 'OE'] as const) {
      const esq = find(eye, 'esqH'), dir = find(eye, 'dirH');
      const sup = find(eye, 'supV'), inf = find(eye, 'infV');
      const pup = find(eye, 'pupila');
      ctx.strokeStyle = '#378ADD';
      ctx.beginPath(); ctx.moveTo(esq.x, esq.y); ctx.lineTo(dir.x, dir.y); ctx.stroke();
      ctx.strokeStyle = '#1D9E75';
      ctx.beginPath(); ctx.moveTo(sup.x, sup.y); ctx.lineTo(inf.x, inf.y); ctx.stroke();
      const cy = (sup.y + inf.y) / 2, cx0 = (esq.x + dir.x) / 2;
      ctx.strokeStyle = '#C2478D';
      ctx.beginPath(); ctx.moveTo(cx0, cy); ctx.lineTo(pup.x, pup.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx0, cy); ctx.lineTo(cx0, inf.y); ctx.stroke();
    }
    const pE = find('ponte', 'ponteEsq'), pD = find('ponte', 'ponteDir');
    ctx.strokeStyle = '#8B5CF6';
    ctx.beginPath(); ctx.moveTo(pE.x, pE.y); ctx.lineTo(pD.x, pD.y); ctx.stroke();
    const cx = (pE.x + pD.x) / 2, cy = (pE.y + pD.y) / 2;
    for (const eye of ['OD', 'OE'] as const) {
      const pup = find(eye, 'pupila');
      ctx.strokeStyle = '#D85A30';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(pup.x, pup.y); ctx.stroke();
    }
    for (const h of handlesRef.current) {
      const active = draggingRef.current === h;
      const len = 20;
      ctx.strokeStyle = h.color;
      ctx.lineWidth = active ? 1.25 : 1;
      ctx.beginPath();
      if (h.orient === 'v') { ctx.moveTo(h.x, h.y - len); ctx.lineTo(h.x, h.y + len); }
      else { ctx.moveTo(h.x - len, h.y); ctx.lineTo(h.x + len, h.y); }
      ctx.stroke();
    }
  }, [find]);

  const resetHandles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    handlesRef.current = HANDLE_DEFS.map(h => {
      const [fx, fy] = DEFAULT_FRAC[`${h.eye}-${h.kind}`];
      return { ...h, x: fx * canvas.width, y: fy * canvas.height };
    });
  }, []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        const canvas = canvasRef.current!;
        const maxW = canvas.parentElement!.clientWidth;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        resetHandles();
        setHasImg(true);
        draw();
        compute();
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(f);
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const nearestHandle = (p: { x: number; y: number }) => {
    let best: Handle | null = null, bestD = 20;
    for (const h of handlesRef.current) {
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  };

  const showLoupe = (e: React.PointerEvent<HTMLCanvasElement>, p: { x: number; y: number }) => {
    const canvas = canvasRef.current!, loupe = loupeRef.current;
    if (!loupe) return;
    const rect = canvas.getBoundingClientRect();
    setLoupeStyle({ left: e.clientX - rect.left - 65, top: e.clientY - rect.top - 150, display: 'block' });
    const lctx = loupe.getContext('2d')!;
    lctx.clearRect(0, 0, 130, 130);
    lctx.save();
    lctx.beginPath(); lctx.arc(65, 65, 63, 0, 7); lctx.clip();
    const z = 5, s = 130 / z;
    lctx.drawImage(canvas, p.x - s / 2, p.y - s / 2, s, s, 0, 0, 130, 130);
    lctx.restore();
    const dragging = draggingRef.current;
    lctx.strokeStyle = dragging ? dragging.color : '#D85A30';
    lctx.lineWidth = 1;
    if (!dragging || dragging.orient === 'v') { lctx.beginPath(); lctx.moveTo(65, 30); lctx.lineTo(65, 100); lctx.stroke(); }
    else { lctx.beginPath(); lctx.moveTo(30, 65); lctx.lineTo(100, 65); lctx.stroke(); }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!hasImg) return;
    const p = getPos(e);
    const h = nearestHandle(p);
    if (h) {
      draggingRef.current = h;
      canvasRef.current!.setPointerCapture(e.pointerId);
      showLoupe(e, p);
      draw();
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!hasImg) return;
    const p = getPos(e);
    if (draggingRef.current) {
      const canvas = canvasRef.current!;
      draggingRef.current.x = Math.max(0, Math.min(canvas.width, p.x));
      draggingRef.current.y = Math.max(0, Math.min(canvas.height, p.y));
      draw();
      compute();
      showLoupe(e, p);
    }
  };
  const onPointerUp = () => {
    draggingRef.current = null;
    setLoupeStyle(s => ({ ...s, display: 'none' }));
    draw();
  };

  useEffect(() => { if (hasImg) { draw(); compute(); } }, [ponte, aroH, aroV]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReposicionar = () => { resetHandles(); draw(); compute(); };

  const handleUsar = () => {
    if (!resultado) return;
    onConfirm({
      odDnp: Math.round(resultado.od.dnp * 10) / 10,
      oeDnp: Math.round(resultado.oe.dnp * 10) / 10,
      odAco: Math.round(resultado.od.aco * 10) / 10,
      oeAco: Math.round(resultado.oe.aco * 10) / 10,
    });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}>
      <div className="card" style={{ padding: 24, width: 720, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Camera size={17} style={{ color: '#6366f1' }} /> Medidas Digitais via Foto
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Informe as medidas conhecidas da armação e arraste os marcadores até os pontos certos na foto.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="form-label">Ponte (mm)</label>
            <input className="form-input" type="number" value={ponte} onChange={e => setPonte(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Aro horizontal (mm)</label>
            <input className="form-input" type="number" value={aroH} onChange={e => setAroH(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Aro vertical (mm)</label>
            <input className="form-input" type="number" value={aroV} onChange={e => setAroV(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Upload size={14} /> Carregar foto
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
          {hasImg && (
            <button type="button" className="btn btn-secondary" onClick={handleReposicionar}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RotateCcw size={14} /> Reposicionar marcadores
            </button>
          )}
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginLeft: 4, flexWrap: 'wrap' }}>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#378ADD', borderRadius: 2, marginRight: 3 }} />Horizontal</span>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#1D9E75', borderRadius: 2, marginRight: 3 }} />Vertical</span>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#8B5CF6', borderRadius: 2, marginRight: 3 }} />Ponte</span>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#D85A30', borderRadius: 2, marginRight: 3 }} />DNP</span>
            <span><span style={{ display: 'inline-block', width: 9, height: 9, background: '#C2478D', borderRadius: 2, marginRight: 3 }} />ACO</span>
          </div>
        </div>

        <div style={{ position: 'relative', maxWidth: '100%', background: 'var(--surface-1, #111)', borderRadius: 8, overflow: 'hidden', minHeight: hasImg ? undefined : 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!hasImg && <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>Carregue uma foto de frente do cliente com a armação para começar</p>}
          <canvas ref={canvasRef} style={{ width: hasImg ? '100%' : 0, display: 'block', touchAction: 'none' }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => { if (!draggingRef.current) setLoupeStyle(s => ({ ...s, display: 'none' })); }} />
          <canvas ref={loupeRef} width={130} height={130}
            style={{ position: 'absolute', pointerEvents: 'none', border: '2px solid rgba(255,255,255,.3)', borderRadius: '50%', background: 'var(--surface-2, #1a1a1a)', ...loupeStyle }} />
        </div>

        {resultado && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            {[['Olho direito', resultado.od], ['Olho esquerdo', resultado.oe]].map(([label, r]: any) => (
              <div key={label} style={{ background: 'rgba(255,255,255,.04)', borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>{label}</p>
                <p style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{r.dnp.toFixed(1)} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>mm DNP</span></p>
                <p style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 0' }}>{r.aco.toFixed(1)} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>mm ACO</span></p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!resultado} onClick={handleUsar}>
            Usar estas medidas
          </button>
        </div>
      </div>
    </div>
  );
}

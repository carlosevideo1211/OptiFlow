import { ChevronDown, ChevronUp } from 'lucide-react';

// Componentes de UI e helpers reutilizáveis da ficha de Atendimento (campos de
// RX com validação, acordeões, grids OD/OE). Extraído do AtendimentoPage.tsx
// original só para organização — são todos componentes "puros" (só dependem
// das props recebidas, não de nada do componente principal), então mover pra
// cá não muda nenhum comportamento.
//
// Nota: as funções de impressão (imprimirDocumento, handlePrint,
// gerarReceituario) NÃO foram movidas daqui — elas dependem de dezenas de
// variáveis de estado do formulário (anamnese, acuidade visual, RX, etc.), e
// mover isso exigiria passar todos esses campos manualmente pra outro
// arquivo. Como é a tela que gera atestado/receita para o paciente, o risco
// de esquecer um campo nessa transcrição não compensa o ganho de organização
// — por isso essa parte fica como está.

// ─── tipos ────────────────────────────────────────────────────────────────────
export type Section =
  | 'prescricao_oculos' | 'prescricao_lc' | 'anamnese'
  | 'atestados' | 'anexos' | 'ajustes';

export type Accordion =
  | 'anamnese' | 'ult_prescricao' | 'acuidade' | 'biomicroscopia'
  | 'ceratometria' | 'tonometria' | 'forometria' | 'oftalmoscopia'
  | 'retin_din' | 'retin_est' | 'aval_motora' | 'rx_final'
  | 'amplitude' | 'afinamento' | 'dx' | 'flexibilidade'
  | 'adicao' | 'ppc' | 'reflexos' | 'reservas' | 'subjetivo' | 'ambulatorial';

// ─── helpers ──────────────────────────────────────────────────────────────────
export const inp = (v: any) => (v == null ? '' : String(v));
export const num = (v: string) => {
  if (v === '' || v == null) return null;
  const cleaned = String(v).replace(',', '.').replace(/^\+/, '');
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
};

export function fmtRx(v: any): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(2).replace('.', ',');
}

const RX_ESF_REGEX = /^([+-]?\d+,\d{2}|0,00)$/;
const RX_CIL_REGEX = /^-\d+,\d{2}$/;
const ADICAO_VALIDAS = ['0,75','1,00','1,25','1,50','1,75','2,00','2,25','2,50','2,75','3,00','3,25','3,50'];

export function validateRxField(value: string, type: 'esf' | 'cil' | 'eixo' | 'adicao'): string | null {
  if (value === '') return null;
  if (type === 'esf' && !RX_ESF_REGEX.test(value)) return 'Use: +0,50 / -0,50 / 0,00 (sinal + opcional)';
  if (type === 'cil' && !RX_CIL_REGEX.test(value)) return 'CIL negativo: -1,00';
  if (type === 'eixo') {
    const n = Number(value);
    if (isNaN(n) || n < 1 || n > 180) return 'Eixo: 1 a 180';
  }
  if (type === 'adicao' && !ADICAO_VALIDAS.includes(value)) return 'Adição: 0,75 a 3,50 (ex: 2,75)';
  return null;
}

export function validateRxRow(esf: string, cil: string, eixo: string): string | null {
  if (esf === '' && cil === '' && eixo === '') return null;
  if (esf !== '' && !RX_ESF_REGEX.test(esf)) return 'ESF inválido (ex: +0,50 ou 0,00)';
  if (cil !== '' && !RX_CIL_REGEX.test(cil)) return 'CIL inválido (ex: -1,00)';
  if (cil !== '' && eixo === '') return 'EIXO obrigatório quando CIL preenchido';
  if (eixo !== '' && cil === '') return 'CIL obrigatório quando EIXO preenchido';
  if (eixo !== '') {
    const n = Number(eixo);
    if (isNaN(n) || n < 1 || n > 180) return 'EIXO deve ser entre 1 e 180';
  }
  return null;
}

export function RxInput({ value, onChange, type, placeholder }: {
  value: string; onChange: (v: string) => void;
  type: 'esf' | 'cil' | 'eixo' | 'adicao'; placeholder?: string;
}) {
  const error = value !== '' ? validateRxField(value, type) : null;
  const ph = placeholder || (type === 'esf' ? '+0,00' : type === 'cil' ? '-0,00' : type === 'eixo' ? '1-180' : '0,00');
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="form-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={ph}
        style={{
          textAlign: 'center', padding: '5px 6px', fontSize: 12,
          borderColor: error ? '#ef4444' : undefined,
          outline: error ? '1px solid #ef4444' : undefined,
        }}
      />
      {error && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 20,
          background: '#1a1a2e', border: '1px solid #ef4444',
          color: '#ef4444', fontSize: 10, padding: '3px 6px',
          borderRadius: 4, whiteSpace: 'nowrap', marginTop: 2
        }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

export function FInput({ value, onChange, type = 'text', placeholder = '' }: any) {
  return (
    <input
      className="form-input"
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ padding: '6px 10px', fontSize: 13 }}
    />
  );
}

export function FTextarea({ value, onChange, rows = 3, placeholder = '' }: any) {
  return (
    <textarea
      className="form-input"
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ padding: '6px 10px', fontSize: 13, resize: 'vertical' }}
    />
  );
}

export function AccordionSection({ id, label, open, toggle, children, order, hidden }: {
  id: Accordion; label: string; open: boolean;
  toggle: (id: Accordion) => void; children: React.ReactNode;
  order?: number; hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div style={{ borderBottom: '1px solid var(--border)', order }}>
      <button
        onClick={() => toggle(id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '12px 16px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text)', fontSize: 13, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', transition: 'background .15s'
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        {label}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div style={{ padding: '12px 16px 20px' }}>{children}</div>}
    </div>
  );
}

export function OdOeGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 8, alignItems: 'center' }}>
      {children}
    </div>
  );
}

export function ColHeader({ labels }: { labels: string[] }) {
  return (
    <>
      <div />
      {labels.map(l => (
        <div key={l} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>{l}</div>
      ))}
    </>
  );
}

export function RxTable({ cols, od, oe, onChange }: {
  cols: string[];
  od: Record<string, string>;
  oe: Record<string, string>;
  onChange: (eye: 'od' | 'oe', col: string, v: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th style={{ width: 60, padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left' }}></th>
          {cols.map(c => (
            <th key={c} style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', fontSize: 11 }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(['od', 'oe'] as const).map(eye => (
          <tr key={eye}>
            <td style={{ padding: '4px 8px', fontWeight: 700, fontSize: 12 }}>{eye.toUpperCase()}</td>
            {cols.map(c => {
              const rxType = c === 'ESF' ? 'esf' : c === 'CIL' ? 'cil' : c === 'EIXO' ? 'eixo' : null;
              const val = (eye === 'od' ? od : oe)[c] ?? '';
              if (rxType) {
                return (
                  <td key={c} style={{ padding: '4px 4px' }}>
                    <RxInput value={val} onChange={v => onChange(eye, c, v)} type={rxType} />
                  </td>
                );
              }
              return (
                <td key={c} style={{ padding: '4px 4px' }}>
                  <input
                    className="form-input"
                    value={val}
                    onChange={e => onChange(eye, c, e.target.value)}
                    style={{ textAlign: 'center', padding: '5px 6px', fontSize: 12 }}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

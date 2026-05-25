import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  Eye, ClipboardList, FileText, ChevronDown, ChevronUp,
  Save, Printer, ArrowLeft, CheckCircle, User, History
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── tipos ────────────────────────────────────────────────────────────────────
type Section =
  | 'prescricao_oculos' | 'prescricao_lc' | 'anamnese'
  | 'atestados' | 'ajustes';

type Accordion =
  | 'anamnese' | 'ult_prescricao' | 'acuidade' | 'biomicroscopia'
  | 'ceratometria' | 'tonometria' | 'forometria' | 'oftalmoscopia'
  | 'retin_din' | 'retin_est' | 'aval_motora' | 'rx_final'
  | 'amplitude' | 'afinamento' | 'dx' | 'flexibilidade'
  | 'adicao' | 'ppc' | 'reflexos' | 'reservas' | 'subjetivo' | 'ambulatorial';

// ─── helpers ──────────────────────────────────────────────────────────────────
const inp = (v: any) => (v == null ? '' : String(v));
const num = (v: string) => {
  if (v === '' || v == null) return null;
  const cleaned = String(v).replace(',', '.').replace(/^\+/, '');
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
};

function fmtRx(v: any): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(2).replace('.', ',');
}

const RX_ESF_REGEX = /^([+-]\d+,\d{2}|0,00)$/;
const RX_CIL_REGEX = /^-\d+,\d{2}$/;
const ADICAO_VALIDAS = ['0,75','1,00','1,25','1,50','1,75','2,00','2,25','2,50','2,75','3,00','3,25','3,50'];

function validateRxField(value: string, type: 'esf' | 'cil' | 'eixo' | 'adicao'): string | null {
  if (value === '') return null;
  if (type === 'esf' && !RX_ESF_REGEX.test(value)) return 'Use: +0,50 / -0,50 / 0,00';
  if (type === 'cil' && !RX_CIL_REGEX.test(value)) return 'CIL negativo: -1,00';
  if (type === 'eixo') {
    const n = Number(value);
    if (isNaN(n) || n < 1 || n > 180) return 'Eixo: 1 a 180';
  }
  if (type === 'adicao' && !ADICAO_VALIDAS.includes(value)) return 'Adição: 0,75 a 3,50 (ex: 2,75)';
  return null;
}

function validateRxRow(esf: string, cil: string, eixo: string): string | null {
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

function RxInput({ value, onChange, type, placeholder }: {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function FInput({ value, onChange, type = 'text', placeholder = '' }: any) {
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

function FTextarea({ value, onChange, rows = 3, placeholder = '' }: any) {
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

function AccordionSection({ id, label, open, toggle, children }: {
  id: Accordion; label: string; open: boolean;
  toggle: (id: Accordion) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
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

function OdOeGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 8, alignItems: 'center' }}>
      {children}
    </div>
  );
}

function ColHeader({ labels }: { labels: string[] }) {
  return (
    <>
      <div />
      {labels.map(l => (
        <div key={l} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>{l}</div>
      ))}
    </>
  );
}

function RxTable({ cols, od, oe, onChange }: {
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

// ─── página principal ─────────────────────────────────────────────────────────
export default function AtendimentoPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const isNew = id === 'novo' || !id;
  const newData = location.state as any;
  const { tenantId, user } = useAuth();
  const navigate = useNavigate();

  const [consultation, setConsultation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<Section>('prescricao_oculos');
  const [open, setOpen] = useState<Record<Accordion, boolean>>({
    anamnese: false, ult_prescricao: false, acuidade: false, biomicroscopia: false,
    ceratometria: false, tonometria: false, forometria: false, oftalmoscopia: false,
    retin_din: false, retin_est: false, aval_motora: false, rx_final: true,
    amplitude: false, afinamento: false, dx: false, flexibilidade: false,
    adicao: false, ppc: false, reflexos: false, reservas: false,
    subjetivo: false, ambulatorial: false
  });

  const [queixa, setQueixa] = useState('');
  const [ultExameData, setUltExameData] = useState('');
  const [anamneseObs, setAnamneseObs] = useState('');
  const [sintomas, setSintomas] = useState<string[]>([]);
  const [doencasOculares, setDoencasOculares] = useState<string[]>([]);
  const [doencasSistemicas, setDoencasSistemicas] = useState<string[]>([]);
  const [medicamentos, setMedicamentos] = useState<string[]>([]);
  const [usaOculos, setUsaOculos] = useState(false);
  const [usaLC, setUsaLC] = useState(false);
  const [antFamiliares, setAntFamiliares] = useState<string[]>([]);
  const [antObs, setAntObs] = useState('');

  const [ultRx, setUltRx] = useState({
    re_esf: '', re_cil: '', re_eixo: '', re_adicao: '', re_dnp: '',
    le_esf: '', le_cil: '', le_eixo: '', le_adicao: '', le_dnp: '', lente: ''
  });

  const [av, setAv] = useState({
    sc_od_vl: '', sc_oe_vl: '', sc_ao_vl: '', cc_od_vl: '', cc_oe_vl: '', cc_ao_vl: '',
    sc_od_vp: '', sc_oe_vp: '', cc_od_vp: '', cc_oe_vp: '', ph_od: '', ph_oe: ''
  });

  const [bio, setBio] = useState<Record<string, string>>({});
  const setBioField = (f: string, v: string) => setBio(p => ({ ...p, [f]: v }));
  const [cerat, setCerat] = useState({ od: '', oe: '', miras: '' });
  const [tono, setTono] = useState({ od: '', oe: '', hora: '' });
  const [foro, setForo] = useState({ tecnica: '', longe_sc: '', longe_cc: '', cm40_sc: '', cm40_cc: '', cm20_sc: '', cm20_cc: '' });
  const [oftal, setOftal] = useState<Record<string, string>>({});
  const setOftalField = (f: string, v: string) => setOftal(p => ({ ...p, [f]: v }));
  const [retinDin, setRetinDin] = useState({ od: '', oe: '', av_od: '', av_oe: '' });
  const [retinEst, setRetinEst] = useState({ od: '', oe: '', av_od: '', av_oe: '' });

  const [rxOd, setRxOd] = useState<Record<string, string>>({ ESF: '', CIL: '', EIXO: '', AV: '', PRISMA: '', DNP: '' });
  const [rxOe, setRxOe] = useState<Record<string, string>>({ ESF: '', CIL: '', EIXO: '', AV: '', PRISMA: '', DNP: '' });
  const [rxAdicao, setRxAdicao] = useState('');
  const [rxAvPerto, setRxAvPerto] = useState('');
  const [rxTipoLente, setRxTipoLente] = useState('');
  const [rxTratamento, setRxTratamento] = useState('');
  const [rxRetorno, setRxRetorno] = useState('');

  const [dxRefrativo, setDxRefrativo] = useState('');
  const [dxMotor, setDxMotor] = useState('');
  const [dxOcular, setDxOcular] = useState('');
  const [dxConduta, setDxConduta] = useState<string[]>([]);
  const [dxControle, setDxControle] = useState('');
  const [dxObs, setDxObs] = useState('');

  const [lcOd, setLcOd] = useState<Record<string, string>>({ ESF: '', CIL: '', EIXO: '', AV: '' });
  const [lcOe, setLcOe] = useState<Record<string, string>>({ ESF: '', CIL: '', EIXO: '', AV: '' });
  const [lcLente, setLcLente] = useState('');
  const [lcObs, setLcObs] = useState('');
  const [status, setStatus] = useState('realizada');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // ── estado extra para documentos ────────────────────────────────────────────
  const [docValorExame, setDocValorExame] = useState('');
  const [docCpf, setDocCpf] = useState('');
  const [docRg, setDocRg] = useState('');
  const [docIdade, setDocIdade] = useState('');
  const [docCidade, setDocCidade] = useState('Rio de Janeiro');
  const [docProfissional, setDocProfissional] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    if (isNew) {
      if (newData) {
        setConsultation({ customer_name: newData.customerName, professional_name: newData.professionalName, date: newData.date, status: newData.status });
        setDate(newData.date || new Date().toISOString().split('T')[0]);
        setStatus(newData.status || 'realizada');
      }
      setLoading(false);
      return;
    }
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('consultations').select('*').eq('id', id).eq('tenant_id', tenantId).single();
      if (error || !data) { toast.error('Consulta não encontrada'); navigate('/consulta'); return; }
      setConsultation(data);
      populate(data);
      setLoading(false);
    };
    load();
  }, [id, tenantId]);

  function populate(d: any) {
    setQueixa(inp(d.queixa_principal));
    setUltExameData(inp(d.ultimo_exame_data));
    setAnamneseObs(inp(d.anamnese_obs));
    setSintomas(d.sintomas ?? []);
    setDoencasOculares(d.doencas_oculares ?? []);
    setDoencasSistemicas(d.doencas_sistemicas ?? []);
    setMedicamentos(d.medicamentos ?? []);
    setUsaOculos(d.usa_oculos ?? false);
    setUsaLC(d.usa_lente_contato ?? false);
    setAntFamiliares(d.antecedentes_familiares ?? []);
    setAntObs(inp(d.antecedentes_obs));
    setUltRx({
      re_esf: fmtRx(d.ult_re_esf), re_cil: fmtRx(d.ult_re_cil), re_eixo: inp(d.ult_re_eixo),
      re_adicao: inp(d.ult_re_adicao), re_dnp: inp(d.ult_re_dnp),
      le_esf: fmtRx(d.ult_le_esf), le_cil: fmtRx(d.ult_le_cil), le_eixo: inp(d.ult_le_eixo),
      le_adicao: inp(d.ult_le_adicao), le_dnp: inp(d.ult_le_dnp), lente: inp(d.ult_lente)
    });
    setAv({
      sc_od_vl: inp(d.av_sc_od_vl), sc_oe_vl: inp(d.av_sc_oe_vl), sc_ao_vl: inp(d.av_sc_ao_vl),
      cc_od_vl: inp(d.av_cc_od_vl), cc_oe_vl: inp(d.av_cc_oe_vl), cc_ao_vl: inp(d.av_cc_ao_vl),
      sc_od_vp: inp(d.av_sc_od_vp), sc_oe_vp: inp(d.av_sc_oe_vp),
      cc_od_vp: inp(d.av_cc_od_vp), cc_oe_vp: inp(d.av_cc_oe_vp),
      ph_od: inp(d.av_ph_od), ph_oe: inp(d.av_ph_oe)
    });
    setBio({
      cilios_od: inp(d.bio_cilios_od), cilios_oe: inp(d.bio_cilios_oe),
      sobrancelhas_od: inp(d.bio_sobrancelhas_od), sobrancelhas_oe: inp(d.bio_sobrancelhas_oe),
      palpebras_od: inp(d.bio_palpebras_od), palpebras_oe: inp(d.bio_palpebras_oe),
      conjuntiva_od: inp(d.bio_conjuntiva_od), conjuntiva_oe: inp(d.bio_conjuntiva_oe),
      esclerotica_od: inp(d.bio_esclerotica_od), esclerotica_oe: inp(d.bio_esclerotica_oe),
      cornea_od: inp(d.bio_cornea_od), cornea_oe: inp(d.bio_cornea_oe),
      iris_od: inp(d.bio_iris_od), iris_oe: inp(d.bio_iris_oe),
      pupila_od: inp(d.bio_pupila_od), pupila_oe: inp(d.bio_pupila_oe),
      cristalino_od: inp(d.bio_cristalino_od), cristalino_oe: inp(d.bio_cristalino_oe),
      camara_od: inp(d.bio_camara_od), camara_oe: inp(d.bio_camara_oe),
      obs_od: inp(d.bio_obs_od), obs_oe: inp(d.bio_obs_oe),
    });
    setCerat({ od: inp(d.cerat_od), oe: inp(d.cerat_oe), miras: inp(d.cerat_miras) });
    setTono({ od: inp(d.tono_od), oe: inp(d.tono_oe), hora: inp(d.tono_hora) });
    setForo({ tecnica: inp(d.foro_tecnica), longe_sc: inp(d.foro_longe_sc), longe_cc: inp(d.foro_longe_cc), cm40_sc: inp(d.foro_40cm_sc), cm40_cc: inp(d.foro_40cm_cc), cm20_sc: inp(d.foro_20cm_sc), cm20_cc: inp(d.foro_20cm_cc) });
    setOftal({ bruckner: inp(d.oftal_bruckner), papila_od: inp(d.oftal_papila_od), papila_oe: inp(d.oftal_papila_oe), escavacao_od: inp(d.oftal_escavacao_od), escavacao_oe: inp(d.oftal_escavacao_oe), macula_od: inp(d.oftal_macula_od), macula_oe: inp(d.oftal_macula_oe), fixacao_od: inp(d.oftal_fixacao_od), fixacao_oe: inp(d.oftal_fixacao_oe), cor_od: inp(d.oftal_cor_od), cor_oe: inp(d.oftal_cor_oe), relacao_od: inp(d.oftal_relacao_od), relacao_oe: inp(d.oftal_relacao_oe), obs_od: inp(d.oftal_obs_od), obs_oe: inp(d.oftal_obs_oe) });
    setRetinDin({ od: inp(d.retin_din_od), oe: inp(d.retin_din_oe), av_od: inp(d.retin_din_av_od), av_oe: inp(d.retin_din_av_oe) });
    setRetinEst({ od: inp(d.retin_est_od), oe: inp(d.retin_est_oe), av_od: inp(d.retin_est_av_od), av_oe: inp(d.retin_est_av_oe) });
    setRxOd({ ESF: fmtRx(d.rx_re_esf), CIL: fmtRx(d.rx_re_cil), EIXO: inp(d.rx_re_eixo), AV: inp(d.rx_re_av), PRISMA: inp(d.rx_re_prisma), DNP: inp(d.rx_re_dnp) });
    setRxOe({ ESF: fmtRx(d.rx_le_esf), CIL: fmtRx(d.rx_le_cil), EIXO: inp(d.rx_le_eixo), AV: inp(d.rx_le_av), PRISMA: inp(d.rx_le_prisma), DNP: inp(d.rx_le_dnp) });
    setRxAdicao(d.rx_adicao != null ? String(Number(d.rx_adicao).toFixed(2)).replace('.', ',') : '');
    setRxAvPerto(inp(d.rx_av_perto));
    setRxTipoLente(inp(d.rx_tipo_lente));
    setRxTratamento(inp(d.rx_tratamento));
    setRxRetorno(inp(d.rx_retorno));
    setDxRefrativo(inp(d.dx_refrativo));
    setDxMotor(inp(d.dx_motor));
    setDxOcular(inp(d.dx_ocular));
    setDxConduta(d.dx_conduta ?? []);
    setDxControle(inp(d.dx_controle));
    setDxObs(inp(d.dx_obs));
    setLcOd({ ESF: fmtRx(d.lc_re_esf), CIL: fmtRx(d.lc_re_cil), EIXO: inp(d.lc_re_eixo), AV: inp(d.lc_re_av) });
    setLcOe({ ESF: fmtRx(d.lc_le_esf), CIL: fmtRx(d.lc_le_cil), EIXO: inp(d.lc_le_eixo), AV: inp(d.lc_le_av) });
    setLcLente(inp(d.lc_lente));
    setLcObs(inp(d.lc_obs));
    setStatus(inp(d.status) || 'realizada');
    setDate(inp(d.date) || new Date().toISOString().split('T')[0]);
    // dados extras para documentos vindos do banco se existirem
    if (d.customer_cpf) setDocCpf(inp(d.customer_cpf));
    if (d.customer_rg) setDocRg(inp(d.customer_rg));
    if (d.customer_age) setDocIdade(inp(d.customer_age));
    if (d.professional_name) setDocProfissional(inp(d.professional_name));
  }

  const toggle = (id: Accordion) => setOpen(p => {
    const allClosed = Object.fromEntries(Object.keys(p).map(k => [k, false])) as Record<Accordion, boolean>;
    return { ...allClosed, [id]: !p[id] };
  });

  const toggleCheck = (list: string[], setList: (v: string[]) => void, val: string) => {
    setList(list.includes(val) ? list.filter(x => x !== val) : [...list, val]);
  };

  function validateAllRx(): string[] {
    const errors: string[] = [];
    const odErr = validateRxRow(rxOd.ESF, rxOd.CIL, rxOd.EIXO);
    const oeErr = validateRxRow(rxOe.ESF, rxOe.CIL, rxOe.EIXO);
    if (odErr) errors.push('RX OD: ' + odErr);
    if (oeErr) errors.push('RX OE: ' + oeErr);
    if (rxAdicao !== '') {
      const adicaoErr = validateRxField(rxAdicao, 'adicao');
      if (adicaoErr) errors.push('Adição: ' + adicaoErr);
    }
    return errors;
  }

  // ── helpers para documentos ─────────────────────────────────────────────────
  const cabecalhoDoc = () => `
    <div style="text-align:center; border-bottom: 2px solid #1a3a6b; padding-bottom: 16px; margin-bottom: 24px;">
      <div style="font-size:32px; color:#1a3a6b; margin-bottom:4px;">⚕</div>
      <div style="font-size:18px; font-weight:900; color:#1a3a6b; letter-spacing:0.12em;">OPTOMETRIA</div>
    </div>`;

  const rodapeDoc = (cidade: string, dt: string) => `
    <div style="position:fixed; bottom:40px; left:40px; right:40px; border-top:1px solid #ccc; padding-top:8px; font-size:9px; color:#888; text-align:center; line-height:1.5;">
      O presente exame realizado pelo optometrista tem por finalidade a correção dos defeitos refrativos, a avaliação sensorial e motora, através da indicação de lentes corretivas e/ou exercícios ortópticos. O diagnóstico de doenças oculares e seu tratamento são de competência do profissional médico.
      <br/><div style="margin-top:4px; border-top:1px solid #ddd; padding-top:4px;">${docCidade || cidade}</div>
    </div>`;

  const assinaturaDoc = (prof: string, dt: string) => `
    <div style="margin-top:60px; text-align:center;">
      <div style="border-top:1px solid #000; width:220px; margin:0 auto 6px;"></div>
      <div style="font-size:13px; font-weight:600;">${prof || 'Optometrista'}</div>
      <div style="font-size:11px; color:#555; margin-top:2px;">${dt}</div>
    </div>`;

  const styleDoc = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; padding: 40px 40px 120px; color: #111; font-size: 13px; line-height: 1.6; }
      h2 { text-align: center; font-size: 15px; font-weight: 800; margin-bottom: 24px; letter-spacing: 0.08em; color: #111; }
      p { margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      th, td { border: 1px solid #bbb; padding: 7px 10px; text-align: center; font-size: 12px; }
      th { background: #e8eaf0; font-weight: 700; color: #1a3a6b; }
      td.label-cell { font-weight: 700; text-align: left; background: #f5f5f5; }
      @media print { body { padding: 30px 30px 110px; } }
    </style>`;

  // ── imprimir documentos ─────────────────────────────────────────────────────
  const imprimirDocumento = (tipo: string) => {
    const win = window.open('', '_blank');
    if (!win) { toast.error('Permita pop-ups para imprimir'); return; }

    const nome = consultation?.customer_name ?? '';
    const prof = docProfissional || consultation?.professional_name || user?.full_name || '';
    const cpf = docCpf || consultation?.customer_cpf || '';
    const rg = docRg || consultation?.customer_rg || '';
    const idade = docIdade || consultation?.customer_age || '';
    const cidade = docCidade || 'Rio de Janeiro';
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // formata data extenso: "19 de maio de 2026"
    const dtISO = date || new Date().toISOString().split('T')[0];
    const dtObj = new Date(dtISO + 'T12:00:00');
    const dtCurta = dtObj.toLocaleDateString('pt-BR'); // DD/MM/AAAA
    const dtExtenso = dtObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    // ex: "Rio de Janeiro, 19 de maio de 2026"
    const cidadeData = `${cidade}, ${dtExtenso}`;

    let body = '';

    // ── 1. ATESTADO ────────────────────────────────────────────────────────────
    if (tipo === 'atestado') {
      const cpfTxt = cpf ? `, inscrito(a) no CPF: <strong>${cpf}</strong>,` : ',';
      body = `
        ${cabecalhoDoc()}
        <h2>ATESTADO</h2>
        <p>
          Atesto para os devidos fins, que o(a) Sr(a) <strong>${nome}</strong>${cpfTxt}
          paciente sob meus cuidados, foi atendido(a) no dia <strong>${dtCurta}</strong>
          às <strong>${hora}</strong>, onde realizou exames para diagnosticar e tratar
          alterações do sistema visual e motor.
        </p>
        ${assinaturaDoc(prof, cidadeData)}
        ${rodapeDoc(cidade, dtCurta)}`;
    }

    // ── 2. LAUDO OPTOMÉTRICO ───────────────────────────────────────────────────
    if (tipo === 'laudo') {
      const idadeTxt = idade ? `<span style="float:right">Idade: <strong>${idade} anos</strong></span>` : '';
      body = `
        ${cabecalhoDoc()}
        <h2>LAUDO OPTOMÉTRICO</h2>
        <p style="margin-bottom:16px;">
          Paciente: <strong>${nome}</strong>${idadeTxt}
        </p>
        <table>
          <thead>
            <tr>
              <th style="width:80px;"></th>
              <th colspan="2">LONGE</th>
              <th colspan="2">PERTO</th>
            </tr>
            <tr>
              <th></th>
              <th>S/C</th>
              <th>C/C</th>
              <th>S/C</th>
              <th>C/C</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="label-cell">OD</td>
              <td>${av.sc_od_vl || ''}</td>
              <td>${av.cc_od_vl || ''}</td>
              <td>${av.sc_od_vp || ''}</td>
              <td>${av.cc_od_vp || ''}</td>
            </tr>
            <tr>
              <td class="label-cell">OE</td>
              <td>${av.sc_oe_vl || ''}</td>
              <td>${av.cc_oe_vl || ''}</td>
              <td>${av.sc_oe_vp || ''}</td>
              <td>${av.cc_oe_vp || ''}</td>
            </tr>
          </tbody>
        </table>
        ${assinaturaDoc(prof, dtExtenso)}
        ${rodapeDoc(cidade, dtCurta)}`;
    }

    // ── 3. DECLARAÇÃO ──────────────────────────────────────────────────────────
    if (tipo === 'declaracao') {
      const rgTxt = rg ? `portador(a) do RG: <strong>${rg}</strong>, ` : '';
      const cpfTxt = cpf ? `CPF: <strong>${cpf}</strong>` : '';
      const idDoc = [rgTxt, cpfTxt].filter(Boolean).join(' ');
      const valorTxt = docValorExame
        ? `R$ <strong>${docValorExame}</strong>`
        : 'o valor acordado';
      body = `
        ${cabecalhoDoc()}
        <h2>DECLARAÇÃO</h2>
        <p>
          Eu, <strong>${nome}</strong>, brasileiro(a)${idDoc ? ', ' + idDoc : ''},
          declaro para devidos fins que recebi as informações devidas referente à
          realização do serviço optométrico prestado a mim (exame de vista), onde o
          mesmo custa o valor de ${valorTxt}, e que a prescrição óptica estará à minha
          disposição mediante o pagamento da mesma. Sendo assim, fica esclarecido que
          a eventual compra de algum produto na ÓTICA foi de inteira escolha minha,
          isentando a empresa de qualquer intenção de ferir o código de defesa do
          consumidor.
        </p>
        <p>Assino abaixo e subscrevo.</p>
        <div style="margin-top:60px; text-align:center;">
          <div style="font-size:12px; color:#555; margin-bottom:40px;">${cidadeData}</div>
          <div style="border-top:1px solid #000; width:220px; margin:0 auto 6px;"></div>
          <div style="font-size:13px; font-weight:600;">${nome}</div>
        </div>
        ${rodapeDoc(cidade, dtCurta)}`;
    }

    // ── 4. TERMO DE AUTORIZAÇÃO ────────────────────────────────────────────────
    if (tipo === 'termo') {
      body = `
        ${cabecalhoDoc()}
        <h2>TERMO DE AUTORIZAÇÃO</h2>
        <p>
          Recebi instruções sobre cuidado visual e me foi explicado os resultados do
          exame. Sou ciente de que o exame é praticado por um profissional da área da
          saúde não médico: Optometrista, o qual é o fisiologista visual, encarregado
          de prevenir, diagnosticar e tratar alterações do sistema visual e motor.
        </p>
        <p style="margin-top:32px;">Data: <strong>${dtCurta}</strong></p>
        <p>Assinatura: <span style="display:inline-block;width:200px;border-bottom:1px solid #000;">&nbsp;</span></p>
        ${rodapeDoc(cidade, dtCurta)}`;
    }

    // ── 5. ENCAMINHAMENTO ──────────────────────────────────────────────────────
    if (tipo === 'encaminhamento') {
      body = `
        ${cabecalhoDoc()}
        <h2>ENCAMINHAMENTO</h2>
        <p>
          Declaro ter sido orientado(a) a procurar um profissional médico por suspeita
          de alteração patológica, detectada no exame do
          Optometrista/Ortoptista/NeuroOptometrista e que a responsabilidade pela
          conduta clínica ficará a cargo do profissional médico escolhido por mim.
        </p>
        <p style="margin-top:32px;">Data: <strong>${dtCurta}</strong></p>
        <p>Assinatura: <span style="display:inline-block;width:200px;border-bottom:1px solid #000;">&nbsp;</span></p>
        ${rodapeDoc(cidade, dtCurta)}`;
    }

    win.document.write(`<html><head><title>${tipo} — ${nome}</title>${styleDoc}</head><body>${body}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  // ── salvar ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const rxErrors = validateAllRx();
    if (rxErrors.length > 0) {
      rxErrors.forEach(e => toast.error(e, { duration: 5000 }));
      setOpen(p => ({ ...p, rx_final: true }));
      return;
    }
    setSaving(true);
    try {
      if (isNew && newData) {
        const { data: created, error: createErr } = await supabase.from('consultations').insert([{
          tenant_id: tenantId, customer_id: newData.customerId, customer_name: newData.customerName,
          professional_id: newData.professionalId, professional_name: newData.professionalName,
          date: date || newData.date, status: status || newData.status,
          queixa_principal: queixa||null, rx_re_esf: num(rxOd.ESF), rx_re_cil: num(rxOd.CIL),
          rx_re_eixo: num(rxOd.EIXO), rx_re_av: rxOd.AV||null, rx_re_prisma: rxOd.PRISMA||null,
          rx_re_dnp: rxOd.DNP||null, rx_le_esf: num(rxOe.ESF), rx_le_cil: num(rxOe.CIL),
          rx_le_eixo: num(rxOe.EIXO), rx_le_av: rxOe.AV||null, rx_le_prisma: rxOe.PRISMA||null,
          rx_le_dnp: rxOe.DNP||null, rx_adicao: num(rxAdicao), rx_av_perto: rxAvPerto||null,
          rx_tipo_lente: rxTipoLente||null, rx_tratamento: rxTratamento||null, rx_retorno: rxRetorno||null,
          sintomas, doencas_oculares: doencasOculares, doencas_sistemicas: doencasSistemicas,
          medicamentos, usa_oculos: usaOculos, usa_lente_contato: usaLC,
          antecedentes_familiares: antFamiliares, antecedentes_obs: antObs||null,
        }]).select().single();
        if (createErr) throw createErr;
        toast.success('Consulta salva!');
        setSaving(false);
        navigate('/consulta/atendimento/' + created.id, { replace: true });
        return;
      }
      if (!id || id === 'novo') { setSaving(false); return; }
      const payload: any = {
        queixa_principal: queixa || null, ultimo_exame_data: ultExameData || null, anamnese_obs: anamneseObs || null,
        sintomas, doencas_oculares: doencasOculares, doencas_sistemicas: doencasSistemicas, medicamentos,
        usa_oculos: usaOculos, usa_lente_contato: usaLC, antecedentes_familiares: antFamiliares, antecedentes_obs: antObs || null,
        ult_re_esf: num(ultRx.re_esf), ult_re_cil: num(ultRx.re_cil), ult_re_eixo: num(ultRx.re_eixo),
        ult_re_adicao: num(ultRx.re_adicao), ult_re_dnp: num(ultRx.re_dnp),
        ult_le_esf: num(ultRx.le_esf), ult_le_cil: num(ultRx.le_cil), ult_le_eixo: num(ultRx.le_eixo),
        ult_le_adicao: num(ultRx.le_adicao), ult_le_dnp: num(ultRx.le_dnp), ult_lente: ultRx.lente || null,
        av_sc_od_vl: av.sc_od_vl||null, av_sc_oe_vl: av.sc_oe_vl||null, av_sc_ao_vl: av.sc_ao_vl||null,
        av_cc_od_vl: av.cc_od_vl||null, av_cc_oe_vl: av.cc_oe_vl||null, av_cc_ao_vl: av.cc_ao_vl||null,
        av_sc_od_vp: av.sc_od_vp||null, av_sc_oe_vp: av.sc_oe_vp||null,
        av_cc_od_vp: av.cc_od_vp||null, av_cc_oe_vp: av.cc_oe_vp||null,
        av_ph_od: av.ph_od||null, av_ph_oe: av.ph_oe||null,
        bio_cilios_od: bio.cilios_od||null, bio_cilios_oe: bio.cilios_oe||null,
        bio_sobrancelhas_od: bio.sobrancelhas_od||null, bio_sobrancelhas_oe: bio.sobrancelhas_oe||null,
        bio_palpebras_od: bio.palpebras_od||null, bio_palpebras_oe: bio.palpebras_oe||null,
        bio_conjuntiva_od: bio.conjuntiva_od||null, bio_conjuntiva_oe: bio.conjuntiva_oe||null,
        bio_esclerotica_od: bio.esclerotica_od||null, bio_esclerotica_oe: bio.esclerotica_oe||null,
        bio_cornea_od: bio.cornea_od||null, bio_cornea_oe: bio.cornea_oe||null,
        bio_iris_od: bio.iris_od||null, bio_iris_oe: bio.iris_oe||null,
        bio_pupila_od: bio.pupila_od||null, bio_pupila_oe: bio.pupila_oe||null,
        bio_cristalino_od: bio.cristalino_od||null, bio_cristalino_oe: bio.cristalino_oe||null,
        bio_camara_od: bio.camara_od||null, bio_camara_oe: bio.camara_oe||null,
        bio_obs_od: bio.obs_od||null, bio_obs_oe: bio.obs_oe||null,
        cerat_od: cerat.od||null, cerat_oe: cerat.oe||null, cerat_miras: cerat.miras||null,
        tono_od: tono.od||null, tono_oe: tono.oe||null, tono_hora: tono.hora||null,
        foro_tecnica: foro.tecnica||null, foro_longe_sc: foro.longe_sc||null, foro_longe_cc: foro.longe_cc||null,
        foro_40cm_sc: foro.cm40_sc||null, foro_40cm_cc: foro.cm40_cc||null,
        foro_20cm_sc: foro.cm20_sc||null, foro_20cm_cc: foro.cm20_cc||null,
        oftal_bruckner: oftal.bruckner||null, oftal_papila_od: oftal.papila_od||null, oftal_papila_oe: oftal.papila_oe||null,
        oftal_escavacao_od: oftal.escavacao_od||null, oftal_escavacao_oe: oftal.escavacao_oe||null,
        oftal_macula_od: oftal.macula_od||null, oftal_macula_oe: oftal.macula_oe||null,
        oftal_fixacao_od: oftal.fixacao_od||null, oftal_fixacao_oe: oftal.fixacao_oe||null,
        oftal_cor_od: oftal.cor_od||null, oftal_cor_oe: oftal.cor_oe||null,
        oftal_relacao_od: oftal.relacao_od||null, oftal_relacao_oe: oftal.relacao_oe||null,
        oftal_obs_od: oftal.obs_od||null, oftal_obs_oe: oftal.obs_oe||null,
        retin_din_od: retinDin.od||null, retin_din_oe: retinDin.oe||null,
        retin_din_av_od: retinDin.av_od||null, retin_din_av_oe: retinDin.av_oe||null,
        retin_est_od: retinEst.od||null, retin_est_oe: retinEst.oe||null,
        retin_est_av_od: retinEst.av_od||null, retin_est_av_oe: retinEst.av_oe||null,
        rx_re_esf: num(rxOd.ESF), rx_re_cil: num(rxOd.CIL), rx_re_eixo: num(rxOd.EIXO),
        rx_re_av: rxOd.AV||null, rx_re_prisma: rxOd.PRISMA||null, rx_re_dnp: rxOd.DNP||null,
        rx_le_esf: num(rxOe.ESF), rx_le_cil: num(rxOe.CIL), rx_le_eixo: num(rxOe.EIXO),
        rx_le_av: rxOe.AV||null, rx_le_prisma: rxOe.PRISMA||null, rx_le_dnp: rxOe.DNP||null,
        rx_adicao: num(rxAdicao), rx_av_perto: rxAvPerto||null,
        rx_tipo_lente: rxTipoLente||null, rx_tratamento: rxTratamento||null, rx_retorno: rxRetorno||null,
        dx_refrativo: dxRefrativo||null, dx_motor: dxMotor||null, dx_ocular: dxOcular||null,
        dx_conduta: dxConduta, dx_controle: dxControle||null, dx_obs: dxObs||null,
        lc_re_esf: num(lcOd.ESF), lc_re_cil: num(lcOd.CIL), lc_re_eixo: num(lcOd.EIXO), lc_re_av: lcOd.AV||null,
        lc_le_esf: num(lcOe.ESF), lc_le_cil: num(lcOe.CIL), lc_le_eixo: num(lcOe.EIXO), lc_le_av: lcOe.AV||null,
        lc_lente: lcLente||null, lc_obs: lcObs||null, status, date: date||null,
      };
      const { error } = await supabase.from('consultations').update(payload).eq('id', id);
      if (error) throw error;
      toast.success('Salvo com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGerarOS = async () => {
    if (!consultation) return;
    const { data, error } = await supabase.from('service_orders').insert([{
      tenant_id: tenantId,
      customer_id: consultation.customer_id || (isNew ? newData?.customerId : null),
      customer_name: consultation.customer_name, consultation_id: isNew ? null : id,
      lens_type: rxTipoLente||null, lens_brand: null, lens_material: null,
      frame_brand: null, frame_model: null, frame_color: null,
      frame_price: 0, lens_price: 0, discount: 0, total: 0,
      status: 'orcamento', notes: rxTratamento||null,
    }]).select().single();
    if (error) { toast.error('Erro ao gerar OS: ' + error.message); return; }
    toast.success('OS gerada com sucesso!');
    navigate('/os');
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const nome = consultation?.customer_name ?? '';
    const prof = docProfissional || consultation?.professional_name || '';
    const dt = date ? new Date(date + 'T12:00:00').toLocaleDateString('pt-BR') : '';
    const validade = date ? new Date(new Date(date+'T12:00:00').setFullYear(new Date(date+'T12:00:00').getFullYear()+1)).toLocaleDateString('pt-BR') : '—';

    const secao = (titulo: string) => `<div class="secao">${titulo}</div>`;
    const linha = (label: string, valor: string) => valor ? `<tr><td class="lbl">${label}</td><td>${valor}</td></tr>` : '';
    const checks = (arr: string[]) => arr?.length ? arr.join(', ') : '—';

    win.document.write(`
      <html><head><title>Ficha Clínica — ${nome}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; padding: 28px; color: #111; font-size: 12px; }
        h1 { text-align: center; font-size: 16px; margin-bottom: 2px; }
        .cabecalho { text-align: center; font-size: 12px; color: #444; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 10px; }
        .secao { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; background: #f0f0f0; padding: 5px 10px; margin: 14px 0 6px; border-left: 4px solid #333; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px; }
        th, td { border: 1px solid #ccc; padding: 5px 8px; }
        th { background: #f5f5f5; font-size: 11px; text-align: center; font-weight: 600; }
        td.lbl { font-weight: 600; width: 160px; background: #fafafa; }
        .rx-table td { text-align: center; }
        .rx-label { text-align: left !important; font-weight: 700; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
        .box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; }
        .box-label { font-size: 10px; font-weight: 700; color: #666; text-transform: uppercase; margin-bottom: 3px; }
        .footer { margin-top: 40px; text-align: center; border-top: 1px solid #ccc; padding-top: 16px; }
        .assinatura { border-top: 1px solid #000; width: 220px; margin: 0 auto 4px; }
        @media print { body { padding: 14px; } }
      </style></head><body>

      <h1>FICHA CLÍNICA — OPTOMETRIA</h1>
      <div class="cabecalho">
        Paciente: <strong>${nome}</strong> &nbsp;|&nbsp;
        Profissional: <strong>${prof}</strong> &nbsp;|&nbsp;
        Data: <strong>${dt}</strong> &nbsp;|&nbsp;
        Receita válida até: <strong>${validade}</strong>
      </div>

      ${secao('Anamnese')}
      <table>
        ${queixa ? linha('Queixa Principal', queixa) : ''}
        ${ultExameData ? linha('Último Exame', new Date(ultExameData+'T12:00:00').toLocaleDateString('pt-BR')) : ''}
        ${sintomas?.length ? linha('Sintomas', checks(sintomas)) : ''}
        ${doencasOculares?.length ? linha('Doenças Oculares', checks(doencasOculares)) : ''}
        ${doencasSistemicas?.length ? linha('Doenças Sistêmicas', checks(doencasSistemicas)) : ''}
        ${medicamentos?.length ? linha('Medicamentos', checks(medicamentos)) : ''}
        ${antFamiliares?.length ? linha('Antec. Familiares', checks(antFamiliares)) : ''}
        ${linha('Usa Óculos', usaOculos ? 'Sim' : 'Não')}
        ${linha('Usa Lente de Contato', usaLC ? 'Sim' : 'Não')}
        ${anamneseObs ? linha('Observações', anamneseObs) : ''}
      </table>

      ${secao('Acuidade Visual')}
      <table>
        <tr><th></th><th colspan="3">VL</th><th colspan="2">VP</th><th colspan="2">PH</th></tr>
        <tr><th></th><th>OD</th><th>OE</th><th>AO</th><th>OD</th><th>OE</th><th>OD</th><th>OE</th></tr>
        <tr>
          <td class="lbl">S/C</td>
          <td>${av.sc_od_vl||'—'}</td><td>${av.sc_oe_vl||'—'}</td><td>${av.sc_ao_vl||'—'}</td>
          <td>${av.sc_od_vp||'—'}</td><td>${av.sc_oe_vp||'—'}</td>
          <td>${av.ph_od||'—'}</td><td>${av.ph_oe||'—'}</td>
        </tr>
        <tr>
          <td class="lbl">C/C</td>
          <td>${av.cc_od_vl||'—'}</td><td>${av.cc_oe_vl||'—'}</td><td>${av.cc_ao_vl||'—'}</td>
          <td>${av.cc_od_vp||'—'}</td><td>${av.cc_oe_vp||'—'}</td>
          <td>—</td><td>—</td>
        </tr>
      </table>

      ${secao('Tonometria & Ceratometria')}
      <div class="grid2">
        <div class="box">
          <div class="box-label">Tonometria (Transpalpebral)</div>
          OD: ${tono.od||'—'} &nbsp;|&nbsp; OE: ${tono.oe||'—'} &nbsp;|&nbsp; Hora: ${tono.hora||'—'}
        </div>
        <div class="box">
          <div class="box-label">Ceratometria (AutoRefratômetro)</div>
          OD: ${cerat.od||'—'} &nbsp;|&nbsp; OE: ${cerat.oe||'—'} &nbsp;|&nbsp; Miras: ${cerat.miras||'—'}
        </div>
      </div>

      ${secao('RX Final — Prescrição para Óculos')}
      <table class="rx-table">
        <tr><th></th><th>Esférico</th><th>Cilíndrico</th><th>Eixo</th><th>AV</th><th>Prisma</th><th>DNP</th></tr>
        <tr>
          <td class="rx-label">OD</td>
          <td>${rxOd.ESF||'—'}</td><td>${rxOd.CIL||'—'}</td><td>${rxOd.EIXO ? rxOd.EIXO+'°' : '—'}</td>
          <td>${rxOd.AV||'—'}</td><td>${rxOd.PRISMA||'—'}</td><td>${rxOd.DNP||'—'}</td>
        </tr>
        <tr>
          <td class="rx-label">OE</td>
          <td>${rxOe.ESF||'—'}</td><td>${rxOe.CIL||'—'}</td><td>${rxOe.EIXO ? rxOe.EIXO+'°' : '—'}</td>
          <td>${rxOe.AV||'—'}</td><td>${rxOe.PRISMA||'—'}</td><td>${rxOe.DNP||'—'}</td>
        </tr>
        ${rxAdicao ? `<tr><td class="rx-label">Adição</td><td colspan="6">${rxAdicao}</td></tr>` : ''}
      </table>

      <div class="footer">
        <div class="assinatura"></div>
        <div style="font-weight:700">${prof}</div>
        <div style="font-size:11px;color:#555;margin-top:2px">Optometrista</div>
      </div>

      </body></html>
    `);
    win.document.close();
    win.print();
  };

  function CheckGroup({ items, selected, onToggle }: { items: string[]; selected: string[]; onToggle: (v: string) => void }) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {items.map(item => (
          <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.includes(item)} onChange={() => onToggle(item)} />
            {item}
          </label>
        ))}
      </div>
    );
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ color: 'var(--text-muted)' }}>Carregando atendimento...</div>
    </div>
  );
  if (!consultation) return null;

  const sideItems: { id: Section; label: string }[] = [
    { id: 'prescricao_oculos', label: 'Prescrição para Óculos' },
    { id: 'prescricao_lc', label: 'Prescrição Lentes de Contato' },
    { id: 'anamnese', label: 'Anamnese e Ficha Clínica' },
    { id: 'atestados', label: 'Atestados e Documentos' },
    { id: 'ajustes', label: 'Ajustes' },
  ];

  const rxErrors = validateAllRx();
  const hasRxErrors = rxErrors.length > 0 && (rxOd.ESF !== '' || rxOe.ESF !== '');

  // ── cores por tipo de documento ─────────────────────────────────────────────
  const docList = [
    { tipo: 'atestado',       label: 'Atestado',            desc: 'Atestado de comparecimento à consulta',       color: '#6366f1', icon: '📋' },
    { tipo: 'laudo',          label: 'Laudo Optométrico',   desc: 'Laudo com acuidade visual S/C e C/C',          color: '#06b6d4', icon: '👁' },
    { tipo: 'declaracao',     label: 'Declaração',          desc: 'Declaração de recebimento de informações',     color: '#22c55e', icon: '📄' },
    { tipo: 'termo',          label: 'Termo de Autorização',desc: 'Termo de ciência do paciente',                 color: '#f59e0b', icon: '✍️' },
    { tipo: 'encaminhamento', label: 'Encaminhamento',      desc: 'Encaminhamento para profissional médico',      color: '#f87171', icon: '🏥' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* ── topo ── */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '16px 28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button onClick={() => navigate('/consulta')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, marginBottom: 8 }}>
            <ArrowLeft size={14} /> Voltar às consultas
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{consultation.customer_name}</h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>Atendido por: <strong>{consultation.professional_name || user?.full_name}</strong></span>
            <span>Procedimento: <strong style={{ color: '#06b6d4' }}>CONSULTA</strong></span>
            <span>Data: <strong>{date ? new Date(date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</strong></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/consulta')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><User size={14} /> Cadastro</button>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><History size={14} /> Histórico</button>
          <button className="btn btn-secondary" onClick={() => { const cid = consultation?.customer_id || newData?.customerId; if (cid) navigate('/consulta/prontuario/' + cid); else toast.error('Paciente não identificado'); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> Prontuário</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={14} /> {saving ? 'Salvando...' : 'Finalizar atendimento'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 120px)', overflowY: 'auto' }}>
        {/* ── sidebar ── */}
        <aside style={{ width: 220, flexShrink: 0, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '12px 0' }}>
          {sideItems.map(item => (
            <button key={item.id} onClick={() => setSection(item.id)} style={{ width: '100%', textAlign: 'left', padding: '11px 20px', background: section === item.id ? 'rgba(99,102,241,.15)' : 'none', border: 'none', borderLeft: section === item.id ? '3px solid #6366f1' : '3px solid transparent', cursor: 'pointer', fontSize: 13, fontWeight: section === item.id ? 600 : 400, color: section === item.id ? '#a5b4fc' : 'var(--text-muted)', transition: 'all .15s' }}>
              {item.label}
            </button>
          ))}
        </aside>

        <main style={{ flex: 1, overflowY: 'auto', padding: '0 0 40px' }}>

          {/* ══ PRESCRIÇÃO ÓCULOS ══ */}
          {section === 'prescricao_oculos' && (
            <div>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><Eye size={16} /> Prescrição para Óculos</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}><Printer size={13} /> Imprimir</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}><Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}</button>
                </div>
              </div>

              <div style={{ margin: '12px 16px', padding: '10px 14px', background: 'rgba(99,102,241,.08)', borderLeft: '3px solid #6366f1', borderRadius: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                <strong style={{ color: '#a5b4fc' }}>Formato obrigatório:</strong> ESF com sinal (+0,50 / -0,50) · CIL sempre negativo (-1,00) · EIXO entre 1–180 · Adição sem sinal (2,75)
              </div>

              <AccordionSection id="anamnese" label="Anamnese" open={open.anamnese} toggle={toggle}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <Field label="Motivo principal da consulta"><FTextarea value={queixa} onChange={setQueixa} rows={2} /></Field>
                  <Field label="Data do último exame"><FInput type="date" value={ultExameData} onChange={setUltExameData} /></Field>
                </div>
                <Field label="Observações Gerais"><FTextarea value={anamneseObs} onChange={setAnamneseObs} rows={3} /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Sintomas</div>
                    <CheckGroup items={['Prurido','Fotofobia','Hiperemia','Ptérigo','Epífora','Trauma','Vermelhidão','Ardência','Dor Ocular','Lacrimejamento','Força a Visão','Cansaço Visual','Sensibilidade a Luz']} selected={sintomas} onToggle={v => toggleCheck(sintomas, setSintomas, v)} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Doença Ocular</div>
                    <CheckGroup items={['Glaucoma','Catarata','Ptérigo','Ceratocone','Estrabismo','Conjuntivite']} selected={doencasOculares} onToggle={v => toggleCheck(doencasOculares, setDoencasOculares, v)} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Doença Sistêmica</div>
                    <CheckGroup items={['Hipertensão','Diabetes','Colesterol','Asma','Depressão','Rinite','Sinusite','Alergias','Reumatismo']} selected={doencasSistemicas} onToggle={v => toggleCheck(doencasSistemicas, setDoencasSistemicas, v)} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Medicamento</div>
                    <CheckGroup items={['Losartana','Metformina','Glibenclamida','Atenolol','Nifedipino','Propranolol','Potassmine','Hidroclorotiazida','Omeprazol','Sinvastatina','AAS']} selected={medicamentos} onToggle={v => toggleCheck(medicamentos, setMedicamentos, v)} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={usaOculos} onChange={e => setUsaOculos(e.target.checked)} /> Usa Óculos</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={usaLC} onChange={e => setUsaLC(e.target.checked)} /> Usa Lente de Contato</label>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Antecedentes Familiares</div>
                  <CheckGroup items={['Diabetes','Estrabismo','Glaucoma','Pressão Alta','Catarata','Alguém usa óculos?']} selected={antFamiliares} onToggle={v => toggleCheck(antFamiliares, setAntFamiliares, v)} />
                </div>
              </AccordionSection>

              <AccordionSection id="ult_prescricao" label="Prescrição do Último Exame" open={open.ult_prescricao} toggle={toggle}>
                <RxTable
                  cols={['ESF', 'CIL', 'EIXO', 'ADIÇÃO', 'DNP']}
                  od={{ ESF: ultRx.re_esf, CIL: ultRx.re_cil, EIXO: ultRx.re_eixo, ADIÇÃO: ultRx.re_adicao, DNP: ultRx.re_dnp }}
                  oe={{ ESF: ultRx.le_esf, CIL: ultRx.le_cil, EIXO: ultRx.le_eixo, ADIÇÃO: ultRx.le_adicao, DNP: ultRx.le_dnp }}
                  onChange={(eye, col, v) => {
                    const map: Record<string, string> = { ESF: eye==='od'?'re_esf':'le_esf', CIL: eye==='od'?'re_cil':'le_cil', EIXO: eye==='od'?'re_eixo':'le_eixo', ADIÇÃO: eye==='od'?'re_adicao':'le_adicao', DNP: eye==='od'?'re_dnp':'le_dnp' };
                    setUltRx(p => ({ ...p, [map[col]]: v }));
                  }}
                />
                <Field label="Lentes"><FInput value={ultRx.lente} onChange={(v: string) => setUltRx(p => ({ ...p, lente: v }))} /></Field>
              </AccordionSection>

              <AccordionSection id="acuidade" label="Acuidade Visual" open={open.acuidade} toggle={toggle}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '6px 8px' }}></th>
                        <th style={{ padding: '6px 8px', color: 'var(--text-muted)' }} colSpan={3}>VL</th>
                        <th style={{ padding: '6px 8px', color: 'var(--text-muted)' }} colSpan={2}>VP</th>
                        <th style={{ padding: '6px 8px', color: 'var(--text-muted)' }} colSpan={2}>PH</th>
                      </tr>
                      <tr>
                        <th style={{ padding: '4px 8px' }}></th>
                        {['OD','OE','AO','OD','OE','OD','OE'].map((l,i) => <th key={i} style={{ padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>{l}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4px 8px', fontWeight: 700, fontSize: 11 }}>S/C</td>
                        {[['sc_od_vl'],['sc_oe_vl'],['sc_ao_vl'],['sc_od_vp'],['sc_oe_vp'],['ph_od'],['ph_oe']].map(([k]) => (
                          <td key={k} style={{ padding: '3px 4px' }}><input className="form-input" value={(av as any)[k]} onChange={e => setAv(p => ({ ...p, [k]: e.target.value }))} style={{ textAlign: 'center', padding: '4px 5px', fontSize: 12, width: 70 }} /></td>
                        ))}
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 8px', fontWeight: 700, fontSize: 11 }}>C/C</td>
                        {[['cc_od_vl'],['cc_oe_vl'],['cc_ao_vl'],['cc_od_vp'],['cc_oe_vp'],['ph_od',''],['ph_oe','']].map(([k, skip], i) => (
                          skip !== undefined ? <td key={i} /> :
                          <td key={k} style={{ padding: '3px 4px' }}><input className="form-input" value={(av as any)[k]} onChange={e => setAv(p => ({ ...p, [k]: e.target.value }))} style={{ textAlign: 'center', padding: '4px 5px', fontSize: 12, width: 70 }} /></td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </AccordionSection>

              <AccordionSection id="biomicroscopia" label="Biomicroscopia" open={open.biomicroscopia} toggle={toggle}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 130, padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Estrutura</th>
                        <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>OD</th>
                        <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>OE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['cilios','sobrancelhas','palpebras','conjuntiva','esclerotica','cornea','iris','pupila','cristalino','camara'].map(struct => (
                        <tr key={struct}>
                          <td style={{ padding: '4px 8px', fontSize: 12, textTransform: 'capitalize' }}>{struct.replace('_',' ')}</td>
                          <td style={{ padding: '3px 4px' }}><input className="form-input" value={bio[`${struct}_od`]??''} onChange={e => setBioField(`${struct}_od`, e.target.value)} style={{ padding: '5px 8px', fontSize: 12 }} /></td>
                          <td style={{ padding: '3px 4px' }}><input className="form-input" value={bio[`${struct}_oe`]??''} onChange={e => setBioField(`${struct}_oe`, e.target.value)} style={{ padding: '5px 8px', fontSize: 12 }} /></td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ padding: '4px 8px', fontSize: 12 }}>Obs.</td>
                        <td style={{ padding: '3px 4px' }}><textarea className="form-input" rows={2} value={bio.obs_od??''} onChange={e => setBioField('obs_od', e.target.value)} style={{ padding: '5px 8px', fontSize: 12, resize: 'vertical' }} /></td>
                        <td style={{ padding: '3px 4px' }}><textarea className="form-input" rows={2} value={bio.obs_oe??''} onChange={e => setBioField('obs_oe', e.target.value)} style={{ padding: '5px 8px', fontSize: 12, resize: 'vertical' }} /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </AccordionSection>

              <AccordionSection id="ceratometria" label="Ceratometria" open={open.ceratometria} toggle={toggle}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Técnica: AutoRefratômetro</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field label="OD"><FInput value={cerat.od} onChange={(v:string)=>setCerat(p=>({...p,od:v}))} /></Field>
                  <Field label="OE"><FInput value={cerat.oe} onChange={(v:string)=>setCerat(p=>({...p,oe:v}))} /></Field>
                  <Field label="Miras"><FInput value={cerat.miras} onChange={(v:string)=>setCerat(p=>({...p,miras:v}))} /></Field>
                </div>
              </AccordionSection>

              <AccordionSection id="tonometria" label="Tonometria" open={open.tonometria} toggle={toggle}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Técnica: Transpalpebral</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field label="OD"><FInput value={tono.od} onChange={(v:string)=>setTono(p=>({...p,od:v}))} /></Field>
                  <Field label="OE"><FInput value={tono.oe} onChange={(v:string)=>setTono(p=>({...p,oe:v}))} /></Field>
                  <Field label="Hora"><FInput value={tono.hora} onChange={(v:string)=>setTono(p=>({...p,hora:v}))} /></Field>
                </div>
              </AccordionSection>

              <AccordionSection id="forometria" label="Forometria" open={open.forometria} toggle={toggle}>
                <Field label="Técnica"><FInput value={foro.tecnica} onChange={(v:string)=>setForo(p=>({...p,tecnica:v}))} /></Field>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 12 }}>
                  <thead><tr><th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)' }}></th><th style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>S/C</th><th style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>C/C</th></tr></thead>
                  <tbody>
                    {[['Longe','longe_sc','longe_cc'],['40 cm','cm40_sc','cm40_cc'],['20 cm','cm20_sc','cm20_cc']].map(([label,sc,cc]) => (
                      <tr key={label}>
                        <td style={{ padding: '4px 8px', fontWeight: 600 }}>{label}</td>
                        <td style={{ padding: '3px 6px' }}><input className="form-input" value={(foro as any)[sc]} onChange={e=>setForo(p=>({...p,[sc]:e.target.value}))} style={{ textAlign: 'center', padding: '5px 8px', fontSize: 12 }} /></td>
                        <td style={{ padding: '3px 6px' }}><input className="form-input" value={(foro as any)[cc]} onChange={e=>setForo(p=>({...p,[cc]:e.target.value}))} style={{ textAlign: 'center', padding: '5px 8px', fontSize: 12 }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AccordionSection>

              <AccordionSection id="oftalmoscopia" label="Oftalmoscopia" open={open.oftalmoscopia} toggle={toggle}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Técnica: Direta</div>
                <Field label="Reflexo de Bruckner"><FTextarea value={oftal.bruckner??''} onChange={(v:string)=>setOftalField('bruckner',v)} rows={2} /></Field>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
                  <thead><tr><th style={{ width: 120, padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)' }}></th><th style={{ padding: '6px', color: 'var(--text-muted)' }}>OD</th><th style={{ padding: '6px', color: 'var(--text-muted)' }}>OE</th></tr></thead>
                  <tbody>
                    {['papila','escavacao','macula','fixacao','cor','relacao'].map(f => (
                      <tr key={f}>
                        <td style={{ padding: '4px 8px', fontSize: 12, textTransform: 'capitalize' }}>{f.replace('_',' ')}</td>
                        <td style={{ padding: '3px 4px' }}><input className="form-input" value={oftal[`${f}_od`]??''} onChange={e=>setOftalField(`${f}_od`,e.target.value)} style={{ padding: '5px 8px', fontSize: 12 }} /></td>
                        <td style={{ padding: '3px 4px' }}><input className="form-input" value={oftal[`${f}_oe`]??''} onChange={e=>setOftalField(`${f}_oe`,e.target.value)} style={{ padding: '5px 8px', fontSize: 12 }} /></td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: '4px 8px', fontSize: 12 }}>Obs.</td>
                      <td style={{ padding: '3px 4px' }}><textarea className="form-input" rows={2} value={oftal.obs_od??''} onChange={e=>setOftalField('obs_od',e.target.value)} style={{ padding: '5px 8px', fontSize: 12 }} /></td>
                      <td style={{ padding: '3px 4px' }}><textarea className="form-input" rows={2} value={oftal.obs_oe??''} onChange={e=>setOftalField('obs_oe',e.target.value)} style={{ padding: '5px 8px', fontSize: 12 }} /></td>
                    </tr>
                  </tbody>
                </table>
              </AccordionSection>

              <AccordionSection id="retin_din" label="Retinoscopia Dinâmica" open={open.retin_din} toggle={toggle}>
                <OdOeGrid>
                  <ColHeader labels={['Rx','AV']} />
                  <div style={{ fontWeight: 700, fontSize: 12 }}>OD</div>
                  <input className="form-input" value={retinDin.od} onChange={e=>setRetinDin(p=>({...p,od:e.target.value}))} style={{ padding: '5px 8px', fontSize: 12 }} />
                  <input className="form-input" value={retinDin.av_od} onChange={e=>setRetinDin(p=>({...p,av_od:e.target.value}))} style={{ padding: '5px 8px', fontSize: 12 }} />
                  <div style={{ fontWeight: 700, fontSize: 12 }}>OE</div>
                  <input className="form-input" value={retinDin.oe} onChange={e=>setRetinDin(p=>({...p,oe:e.target.value}))} style={{ padding: '5px 8px', fontSize: 12 }} />
                  <input className="form-input" value={retinDin.av_oe} onChange={e=>setRetinDin(p=>({...p,av_oe:e.target.value}))} style={{ padding: '5px 8px', fontSize: 12 }} />
                </OdOeGrid>
              </AccordionSection>

              <AccordionSection id="retin_est" label="Retinoscopia Estática" open={open.retin_est} toggle={toggle}>
                <OdOeGrid>
                  <ColHeader labels={['Rx','AV']} />
                  <div style={{ fontWeight: 700, fontSize: 12 }}>OD</div>
                  <input className="form-input" value={retinEst.od} onChange={e=>setRetinEst(p=>({...p,od:e.target.value}))} style={{ padding: '5px 8px', fontSize: 12 }} />
                  <input className="form-input" value={retinEst.av_od} onChange={e=>setRetinEst(p=>({...p,av_od:e.target.value}))} style={{ padding: '5px 8px', fontSize: 12 }} />
                  <div style={{ fontWeight: 700, fontSize: 12 }}>OE</div>
                  <input className="form-input" value={retinEst.oe} onChange={e=>setRetinEst(p=>({...p,oe:e.target.value}))} style={{ padding: '5px 8px', fontSize: 12 }} />
                  <input className="form-input" value={retinEst.av_oe} onChange={e=>setRetinEst(p=>({...p,av_oe:e.target.value}))} style={{ padding: '5px 8px', fontSize: 12 }} />
                </OdOeGrid>
              </AccordionSection>

              <AccordionSection id="rx_final" label="RX Final" open={open.rx_final} toggle={toggle}>
                {hasRxErrors && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,.1)', border: '1px solid #ef4444', borderRadius: 6 }}>
                    {rxErrors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#ef4444' }}>⚠ {e}</div>)}
                  </div>
                )}
                <RxTable
                  cols={['ESF','CIL','EIXO','AV','PRISMA','DNP']}
                  od={rxOd} oe={rxOe}
                  onChange={(eye,col,v) => eye==='od' ? setRxOd(p=>({...p,[col]:v})) : setRxOe(p=>({...p,[col]:v}))}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <Field label="Adição — sem sinal (ex: 2,75)">
                    <RxInput value={rxAdicao} onChange={setRxAdicao} type="adicao" placeholder="2,75" />
                  </Field>
                  <Field label="AV Perto"><FInput value={rxAvPerto} onChange={setRxAvPerto} /></Field>
                  <Field label="Tipo de Lente"><FInput value={rxTipoLente} onChange={setRxTipoLente} /></Field>
                  <Field label="Tratamento"><FInput value={rxTratamento} onChange={setRxTratamento} /></Field>
                  <Field label="Retorno em"><FInput type="date" value={rxRetorno} onChange={setRxRetorno} /></Field>
                </div>
              </AccordionSection>

              <AccordionSection id="dx" label="DX" open={open.dx} toggle={toggle}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <Field label="Refrativo"><FInput value={dxRefrativo} onChange={setDxRefrativo} /></Field>
                  <Field label="Motor"><FInput value={dxMotor} onChange={setDxMotor} /></Field>
                  <Field label="Ocular"><FInput value={dxOcular} onChange={setDxOcular} /></Field>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Conduta</div>
                  <CheckGroup items={['LC','RX','Encaminhamento','Pleóptica','Ortóptica']} selected={dxConduta} onToggle={v=>toggleCheck(dxConduta,setDxConduta,v)} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Controle</div>
                  <CheckGroup items={['1 Semana','1 Mês','6 Meses','1 Ano']} selected={dxControle?[dxControle]:[]} onToggle={v=>setDxControle(dxControle===v?'':v)} />
                </div>
                <Field label="Obs."><FTextarea value={dxObs} onChange={setDxObs} rows={3} /></Field>
              </AccordionSection>

              <div style={{ padding: '20px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={14} /> Imprimir Receita</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          )}

          {/* ══ PRESCRIÇÃO LC ══ */}
          {section === 'prescricao_lc' && (
            <div style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 15 }}>Prescrição Lentes de Contato</h3>
              <RxTable cols={['ESF','CIL','EIXO','AV']} od={lcOd} oe={lcOe} onChange={(eye,col,v)=>eye==='od'?setLcOd(p=>({...p,[col]:v})):setLcOe(p=>({...p,[col]:v}))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                <Field label="Lente"><FInput value={lcLente} onChange={setLcLente} /></Field>
              </div>
              <Field label="Observações"><FTextarea value={lcObs} onChange={setLcObs} rows={4} /></Field>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          )}

          {/* ══ ANAMNESE ══ */}
          {section === 'anamnese' && (
            <div style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 15 }}>Anamnese e Ficha Clínica</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Use a seção "Prescrição para Óculos" e expanda o accordion "Anamnese" para preencher todos os dados clínicos.</p>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setSection('prescricao_oculos'); setOpen(p => ({ ...p, anamnese: true })); }}>Ir para Anamnese</button>
            </div>
          )}

          {/* ══ ATESTADOS E DOCUMENTOS ══ */}
          {section === 'atestados' && (
            <div style={{ padding: '24px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} /> Atestados e Documentos
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
                Preencha os dados complementares abaixo antes de imprimir, se necessário.
              </p>

              {/* ── campos complementares ── */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Dados para os documentos
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  <Field label="CPF do paciente">
                    <FInput value={docCpf} onChange={setDocCpf} placeholder="000.000.000-00" />
                  </Field>
                  <Field label="RG do paciente">
                    <FInput value={docRg} onChange={setDocRg} placeholder="0000000-0" />
                  </Field>
                  <Field label="Idade">
                    <FInput value={docIdade} onChange={setDocIdade} placeholder="Ex: 35" />
                  </Field>
                  <Field label="Valor do exame (R$)">
                    <FInput value={docValorExame} onChange={setDocValorExame} placeholder="Ex: 80,00" />
                  </Field>
                  <Field label="Cidade">
                    <FInput value={docCidade} onChange={setDocCidade} placeholder="Ex: Rio de Janeiro" />
                  </Field>
                  <Field label="Nome do profissional">
                    <FInput value={docProfissional} onChange={setDocProfissional} placeholder="Nome do optometrista" />
                  </Field>
                </div>
              </div>

              {/* ── cards dos documentos ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
                {docList.map(doc => (
                  <button
                    key={doc.tipo}
                    onClick={() => imprimirDocumento(doc.tipo)}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderTop: `3px solid ${doc.color}`,
                      borderRadius: 10,
                      padding: '18px 16px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 8 }}>{doc.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: doc.color, marginBottom: 4 }}>{doc.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{doc.desc}</div>
                    <div style={{ marginTop: 14, fontSize: 11, color: doc.color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Printer size={11} /> Imprimir
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ══ AJUSTES ══ */}
          {section === 'ajustes' && (
            <div style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Configurações da Consulta</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 500 }}>
                <Field label="Data da consulta"><FInput type="date" value={date} onChange={setDate} /></Field>
                <Field label="Status">
                  <select className="form-input" value={status} onChange={e=>setStatus(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
                    <option value="realizada">Realizada</option>
                    <option value="agendada">Agendada</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

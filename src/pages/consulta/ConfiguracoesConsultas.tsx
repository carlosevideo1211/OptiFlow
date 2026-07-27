import { useState, lazy, Suspense } from 'react';
import {
  SlidersHorizontal, Building2, Handshake, FileText, Stethoscope,
  ShieldCheck, ClipboardList
} from 'lucide-react';
import AjustesConsultas from './AjustesConsultas';
import DadosClinica from './DadosClinica';
import ParceriasConsultas from './ParceriasConsultas';
import ProcedimentosConsultas from './ProcedimentosConsultas';
import PermissoesConsultas from './PermissoesConsultas';

// Lazy: TipTap/ProseMirror é pesado (~400kB) e só deve ser baixado
// quando o usuário realmente abrir a aba Modelos, não no carregamento
// inicial de todo o sistema.
const ModelosConsultas = lazy(() => import('./ModelosConsultas'));
const FichaClinicaConsultas = lazy(() => import('./FichaClinicaConsultas'));

type Secao = {
  k: string;
  l: string;
  icon: React.ComponentType<any>;
  pronto: boolean;
  badge?: string;
};

const SECOES: Secao[] = [
  { k: 'ajustes',        l: 'Ajustes',           icon: SlidersHorizontal, pronto: true },
  { k: 'clinica',        l: 'Dados da Clínica',  icon: Building2,         pronto: true },
  { k: 'parcerias',      l: 'Parcerias',         icon: Handshake,         pronto: true },
  { k: 'modelos',        l: 'Modelos',           icon: FileText,          pronto: true },
  { k: 'procedimentos',  l: 'Procedimentos',     icon: Stethoscope,       pronto: true },
  { k: 'permissoes',     l: 'Permissões',        icon: ShieldCheck,       pronto: true },
  { k: 'ficha',          l: 'Ficha Clínica',     icon: ClipboardList,     pronto: true },
];

export default function ConfiguracoesConsultas() {
  const [secao, setSecao] = useState<string>('ajustes');

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Menu lateral das 8 sub-áreas */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {SECOES.map(s => (
          <button key={s.k} onClick={() => setSecao(s.k)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8,
            border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: 500,
            background: secao === s.k ? 'rgba(99,102,241,.14)' : 'transparent',
            color: secao === s.k ? '#6366f1' : 'var(--text-muted)',
          }}>
            <s.icon size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{s.l}</span>
            {(s.badge || !s.pronto) && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                background: s.badge ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.06)',
                color: s.badge ? '#6366f1' : 'var(--text-muted)',
              }}>{s.badge || 'EM BREVE'}</span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo da sub-área selecionada */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Suspense fallback={<div className="empty-state"><p>Carregando...</p></div>}>
          {secao === 'ajustes' && <AjustesConsultas />}
          {secao === 'clinica' && <DadosClinica />}
          {secao === 'parcerias' && <ParceriasConsultas />}
          {secao === 'modelos' && <ModelosConsultas />}
          {secao === 'procedimentos' && <ProcedimentosConsultas />}
          {secao === 'permissoes' && <PermissoesConsultas />}
          {secao === 'ficha' && <FichaClinicaConsultas />}
          {!['ajustes', 'clinica', 'parcerias', 'modelos', 'procedimentos', 'permissoes', 'ficha'].includes(secao) && (
            <div className="empty-state">
              <h3>Em breve</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Esta sub-área ainda não foi construída — próxima na fila do cronograma.
              </p>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}

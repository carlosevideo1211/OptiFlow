import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import { formatDateTime } from '../../types/index';

const TABELAS = [
  { key: 'consultations', label: 'Atendimentos / Fichas' },
  { key: 'clinic_financial_entries', label: 'Financeiro (Clínica)' },
  { key: 'clinic_permission_profiles', label: 'Perfis de Permissão' },
  { key: 'clinic_settings', label: 'Configurações da Clínica' },
  { key: 'document_templates', label: 'Modelos de Documento' },
  { key: 'procedures', label: 'Procedimentos' },
  { key: 'professionals', label: 'Profissionais' },
  { key: 'partnerships', label: 'Parcerias / Convênios' },
];

const ACAO_MAP: Record<string, { label: string; color: string; bg: string }> = {
  INSERT: { label: 'Criação', color: '#22c55e', bg: 'rgba(34,197,94,.15)' },
  UPDATE: { label: 'Alteração', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  DELETE: { label: 'Exclusão', color: '#f87171', bg: 'rgba(248,113,113,.15)' },
};

function labelTabela(key: string) {
  return TABELAS.find(t => t.key === key)?.label ?? key;
}

// Compara old_data x new_data e retorna só os campos que mudaram
function diffCampos(oldData: any, newData: any): { campo: string; de: any; para: any }[] {
  const campos = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  const out: { campo: string; de: any; para: any }[] = [];
  campos.forEach(c => {
    const de = oldData ? oldData[c] : undefined;
    const para = newData ? newData[c] : undefined;
    if (JSON.stringify(de) !== JSON.stringify(para)) out.push({ campo: c, de, para });
  });
  return out.sort((a, b) => a.campo.localeCompare(b.campo));
}

function valorFmt(v: any) {
  if (v === null || v === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  if (typeof v === 'object') return <code style={{ fontSize: 11 }}>{JSON.stringify(v)}</code>;
  return String(v);
}

function DetalheModal({ registro, onClose }: { registro: any; onClose: () => void }) {
  const campos = registro.action === 'UPDATE'
    ? diffCampos(registro.old_data, registro.new_data)
    : Object.entries(registro.action === 'DELETE' ? (registro.old_data || {}) : (registro.new_data || {}))
        .map(([campo, valor]) => ({ campo, de: undefined, para: valor }))
        .sort((a, b) => a.campo.localeCompare(b.campo));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}>
      <div className="card" style={{ padding: 24, width: 600, maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={17} style={{ color: '#6366f1' }} /> Detalhe do registro
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          {labelTabela(registro.table_name)} · {formatDateTime(registro.created_at)} · {registro.performed_by || 'sistema'}
        </p>

        {campos.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhum campo com valor registrado.</p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px' }}>Campo</th>
                {registro.action === 'UPDATE' && <th style={{ padding: '6px 8px' }}>De</th>}
                <th style={{ padding: '6px 8px' }}>{registro.action === 'UPDATE' ? 'Para' : 'Valor'}</th>
              </tr>
            </thead>
            <tbody>
              {campos.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.campo}</td>
                  {registro.action === 'UPDATE' && <td style={{ padding: '6px 8px', color: '#f87171' }}>{valorFmt(c.de)}</td>}
                  <td style={{ padding: '6px 8px', color: '#22c55e' }}>{valorFmt(c.para)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function AuditoriaConsultas() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 30;

  const [filtroTabela, setFiltroTabela] = useState('');
  const [filtroAcao, setFiltroAcao] = useState('');
  const [filtroDe, setFiltroDe] = useState('');
  const [filtroAte, setFiltroAte] = useState('');
  const [detalhe, setDetalhe] = useState<any | null>(null);

  useEffect(() => { if (tenantId) load(); }, [tenantId, pagina, filtroTabela, filtroAcao, filtroDe, filtroAte]);

  const load = async () => {
    setLoading(true);
    // Escopo travado nas tabelas do módulo clínico — audit_log é uma tabela
    // compartilhada e pode ter registros históricos de outras operações
    // (ex: limpeza de crediário) que não têm nada a ver com o Consultas/Rx.
    let q = supabase.from('audit_log').select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .in('table_name', TABELAS.map(t => t.key));
    if (filtroTabela) q = q.eq('table_name', filtroTabela);
    if (filtroAcao) q = q.eq('action', filtroAcao);
    if (filtroDe) q = q.gte('created_at', filtroDe + 'T00:00:00');
    if (filtroAte) q = q.lte('created_at', filtroAte + 'T23:59:59');
    const from = (pagina - 1) * POR_PAGINA;
    const to = from + POR_PAGINA - 1;
    const { data, count } = await q.order('created_at', { ascending: false }).range(from, to);
    setRegistros(data ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  };

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={22} /> Auditoria
          </h1>
          <p className="page-sub">{total} registro{total === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="form-label">Tabela</label>
          <select className="form-input" value={filtroTabela} onChange={e => { setFiltroTabela(e.target.value); setPagina(1); }}>
            <option value="">Todas</option>
            {TABELAS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Ação</label>
          <select className="form-input" value={filtroAcao} onChange={e => { setFiltroAcao(e.target.value); setPagina(1); }}>
            <option value="">Todas</option>
            <option value="INSERT">Criação</option>
            <option value="UPDATE">Alteração</option>
            <option value="DELETE">Exclusão</option>
          </select>
        </div>
        <div>
          <label className="form-label">De</label>
          <input type="date" className="form-input" value={filtroDe} onChange={e => { setFiltroDe(e.target.value); setPagina(1); }} />
        </div>
        <div>
          <label className="form-label">Até</label>
          <input type="date" className="form-input" value={filtroAte} onChange={e => { setFiltroAte(e.target.value); setPagina(1); }} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>
        ) : registros.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum registro encontrado.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,.03)' }}>
                <th style={{ padding: '10px 14px' }}>Data/Hora</th>
                <th style={{ padding: '10px 14px' }}>Tabela</th>
                <th style={{ padding: '10px 14px' }}>Ação</th>
                <th style={{ padding: '10px 14px' }}>Quem</th>
                <th style={{ padding: '10px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {registros.map(r => {
                const a = ACAO_MAP[r.action] || { label: r.action, color: '#94a3b8', bg: 'rgba(148,163,184,.15)' };
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                    <td style={{ padding: '10px 14px' }}>{formatDateTime(r.created_at)}</td>
                    <td style={{ padding: '10px 14px' }}>{labelTabela(r.table_name)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: a.color, background: a.bg }}>
                        {a.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{r.performed_by || 'sistema'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button onClick={() => setDetalhe(r)}
                        style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center' }}>
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPaginas > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 14, borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
              style={{ background: 'none', border: 'none', color: pagina === 1 ? 'var(--text-muted)' : '#6366f1', cursor: pagina === 1 ? 'default' : 'pointer' }}>
              <ChevronLeft size={18} />
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Página {pagina} de {totalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
              style={{ background: 'none', border: 'none', color: pagina === totalPaginas ? 'var(--text-muted)' : '#6366f1', cursor: pagina === totalPaginas ? 'default' : 'pointer' }}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {detalhe && <DetalheModal registro={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}

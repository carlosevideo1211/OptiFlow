import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Printer, User, Eye, FileText, Activity } from 'lucide-react';

function fmtRx(v: any): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(2).replace('.', ',');
}
function fmtDate(d: string): string {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}
function idade(birth: string): string {
  if (!birth) return '—';
  const diff = Date.now() - new Date(birth + 'T00:00:00').getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)) + ' anos';
}
function isValida(dateStr: string): boolean {
  if (!dateStr) return false;
  const v = new Date(dateStr + 'T12:00:00');
  v.setFullYear(v.getFullYear() + 1);
  return v >= new Date();
}

const checks = (arr: string[]) => arr?.length ? arr.join(', ') : '—';

// ── Bloco de seção ─────────────────────────────────────────────────────────
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 12
      }}>{titulo}</div>
      {children}
    </div>
  );
}

// ── Par label/valor ────────────────────────────────────────────────────────
function Par({ label, valor }: { label: string; valor: string }) {
  if (!valor || valor === '—') return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 140 }}>{label}:</span>
      <span style={{ fontWeight: 500 }}>{valor}</span>
    </div>
  );
}

export default function ProntuarioPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { tenantId } = useAuth();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<any>(null);
  const [consultas, setConsultas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabAtiva, setTabAtiva] = useState<'cadastro' | 'ultima_rx' | 'historico'>('cadastro');

  useEffect(() => {
    if (!tenantId || !customerId) return;
    const load = async () => {
      setLoading(true);
      const [{ data: cust }, { data: cons }] = await Promise.all([
        supabase.from('customers').select('*').eq('id', customerId).eq('tenant_id', tenantId).single(),
        supabase.from('consultations').select('*').eq('customer_id', customerId).eq('tenant_id', tenantId).order('date', { ascending: false }),
      ]);
      if (cust) setCustomer(cust);
      if (cons) setConsultas(cons);
      setLoading(false);
    };
    load();
  }, [tenantId, customerId]);

  const ultimaRx = consultas.find(c => c.rx_re_esf != null || c.rx_le_esf != null);

  const handlePrint = () => {
    if (!customer) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const c = customer;
    const rx = ultimaRx;

    win.document.write(`
      <html><head><title>Prontuário — ${c.name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; padding: 36px; color: #111; font-size: 12px; }
        h1 { font-size: 16px; text-align: center; margin-bottom: 4px; }
        .sub { text-align: center; color: #555; font-size: 11px; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .secao { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; background: #f0f0f0; padding: 4px 8px; margin: 14px 0 6px; border-left: 3px solid #333; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
        th, td { border: 1px solid #ccc; padding: 5px 8px; }
        th { background: #f5f5f5; font-weight: 600; text-align: center; }
        .lbl { font-weight: 600; width: 140px; background: #fafafa; }
        .par { display: flex; gap: 8px; margin-bottom: 4px; font-size: 12px; }
        .par-lbl { color: #555; min-width: 130px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <h1>PRONTUÁRIO DO PACIENTE</h1>
      <div class="sub">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>

      <div class="secao">Dados Cadastrais</div>
      <div class="par"><span class="par-lbl">Nome:</span><strong>${c.name}</strong></div>
      ${c.cpf ? `<div class="par"><span class="par-lbl">CPF:</span>${c.cpf}</div>` : ''}
      ${c.birth_date ? `<div class="par"><span class="par-lbl">Data de Nascimento:</span>${fmtDate(c.birth_date)} (${idade(c.birth_date)})</div>` : ''}
      ${c.phone ? `<div class="par"><span class="par-lbl">Telefone:</span>${c.phone}</div>` : ''}
      ${c.email ? `<div class="par"><span class="par-lbl">E-mail:</span>${c.email}</div>` : ''}
      ${c.address ? `<div class="par"><span class="par-lbl">Endereço:</span>${c.address}${c.city ? ', ' + c.city : ''}${c.state ? '/' + c.state : ''}</div>` : ''}
      ${c.notes ? `<div class="par"><span class="par-lbl">Observações:</span>${c.notes}</div>` : ''}

      ${rx ? `
      <div class="secao">Última Receita — ${fmtDate(rx.date)}</div>
      <table>
        <tr><th></th><th>Esférico</th><th>Cilíndrico</th><th>Eixo</th><th>AV</th><th>DNP</th></tr>
        <tr><td class="lbl">OD</td><td>${fmtRx(rx.rx_re_esf)}</td><td>${fmtRx(rx.rx_re_cil)}</td><td>${rx.rx_re_eixo ? rx.rx_re_eixo + '°' : '—'}</td><td>${rx.rx_re_av || '—'}</td><td>${rx.rx_re_dnp || '—'}</td></tr>
        <tr><td class="lbl">OE</td><td>${fmtRx(rx.rx_le_esf)}</td><td>${fmtRx(rx.rx_le_cil)}</td><td>${rx.rx_le_eixo ? rx.rx_le_eixo + '°' : '—'}</td><td>${rx.rx_le_av || '—'}</td><td>${rx.rx_le_dnp || '—'}</td></tr>
        ${rx.rx_adicao ? `<tr><td class="lbl">Adição</td><td colspan="5">${Number(rx.rx_adicao).toFixed(2).replace('.', ',')}</td></tr>` : ''}
      </table>
      ${rx.rx_tipo_lente ? `<div class="par"><span class="par-lbl">Tipo de Lente:</span>${rx.rx_tipo_lente}</div>` : ''}
      ` : ''}

      <div class="secao">Histórico de Consultas (${consultas.length})</div>
      <table>
        <tr><th>Data</th><th>Profissional</th><th>Queixa</th><th>Diagnóstico</th><th>Válida</th></tr>
        ${consultas.map(c => `
        <tr>
          <td>${fmtDate(c.date)}</td>
          <td>${c.professional_name || '—'}</td>
          <td style="font-size:10px">${c.queixa_principal || '—'}</td>
          <td style="font-size:10px">${[c.dx_refrativo, c.dx_motor, c.dx_ocular].filter(Boolean).join(', ') || '—'}</td>
          <td style="text-align:center">${isValida(c.date) ? '✓' : '✗'}</td>
        </tr>`).join('')}
      </table>

      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ color: 'var(--text-muted)' }}>Carregando prontuário...</div>
    </div>
  );

  if (!customer) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ color: 'var(--text-muted)' }}>Paciente não encontrado.</div>
    </div>
  );

  const tabs = [
    { id: 'cadastro', label: '👤 Dados Cadastrais', icon: User },
    { id: 'ultima_rx', label: '👁 Última Receita', icon: Eye },
    { id: 'historico', label: '📋 Histórico Clínico', icon: Activity },
  ] as const;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 40 }}>

      {/* ── Cabeçalho ── */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '16px 28px' }}>
        <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0 }}>
              {(customer.name || '?').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{customer.name}</h2>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 2 }}>
                {customer.birth_date && <span>Idade: <strong>{idade(customer.birth_date)}</strong></span>}
                {customer.cpf && <span>CPF: <strong>{customer.cpf}</strong></span>}
                {customer.phone && <span>Tel: <strong>{customer.phone}</strong></span>}
                <span>{consultas.length} consulta(s)</span>
              </div>
            </div>
          </div>
          <button onClick={handlePrint} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={14} /> Imprimir Prontuário
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 28px', display: 'flex', gap: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTabAtiva(t.id)}
            style={{ padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tabAtiva === t.id ? '#6366f1' : 'var(--text-muted)', borderBottom: tabAtiva === t.id ? '2px solid #6366f1' : '2px solid transparent', transition: 'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* ══ TAB: DADOS CADASTRAIS ══ */}
        {tabAtiva === 'cadastro' && (
          <div style={{ maxWidth: 700 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
              <Secao titulo="Identificação">
                <Par label="Nome completo" valor={customer.name} />
                <Par label="CPF" valor={customer.cpf} />
                <Par label="Data de Nascimento" valor={customer.birth_date ? `${fmtDate(customer.birth_date)} (${idade(customer.birth_date)})` : '—'} />
              </Secao>
              <Secao titulo="Contato">
                <Par label="Telefone" valor={customer.phone} />
                <Par label="WhatsApp" valor={customer.whatsapp} />
                <Par label="E-mail" valor={customer.email} />
              </Secao>
              <Secao titulo="Endereço">
                <Par label="Endereço" valor={customer.address} />
                <Par label="Cidade/Estado" valor={[customer.city, customer.state].filter(Boolean).join('/')} />
              </Secao>
              {customer.notes && (
                <Secao titulo="Observações">
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{customer.notes}</div>
                </Secao>
              )}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
                Cadastrado em: {customer.created_at ? new Date(customer.created_at).toLocaleDateString('pt-BR') : '—'}
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: ÚLTIMA RECEITA ══ */}
        {tabAtiva === 'ultima_rx' && (
          <div style={{ maxWidth: 800 }}>
            {!ultimaRx ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60 }}>
                <Eye size={40} style={{ opacity: .3, marginBottom: 12 }} />
                <p>Nenhuma receita registrada para este paciente.</p>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Data</div>
                      <div style={{ fontWeight: 600 }}>{fmtDate(ultimaRx.date)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Válida até</div>
                      <div style={{ fontWeight: 600, color: isValida(ultimaRx.date) ? '#22c55e' : '#f87171' }}>
                        {ultimaRx.date ? new Date(new Date(ultimaRx.date + 'T12:00:00').setFullYear(new Date(ultimaRx.date + 'T12:00:00').getFullYear() + 1)).toLocaleDateString('pt-BR') : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Profissional</div>
                      <div style={{ fontWeight: 600 }}>{ultimaRx.professional_name || '—'}</div>
                    </div>
                  </div>
                  <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: isValida(ultimaRx.date) ? 'rgba(34,197,94,.15)' : 'rgba(248,113,113,.15)', color: isValida(ultimaRx.date) ? '#22c55e' : '#f87171' }}>
                    {isValida(ultimaRx.date) ? '✓ Válida' : '✗ Vencida'}
                  </span>
                </div>

                {/* Tabela RX */}
                <div style={{ padding: '16px 20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 100, padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}></th>
                        {['Esférico','Cilíndrico','Eixo','AV','Prisma','DNP'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textAlign: 'center' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'OD', esf: ultimaRx.rx_re_esf, cil: ultimaRx.rx_re_cil, eixo: ultimaRx.rx_re_eixo, av: ultimaRx.rx_re_av, prisma: ultimaRx.rx_re_prisma, dnp: ultimaRx.rx_re_dnp },
                        { label: 'OE', esf: ultimaRx.rx_le_esf, cil: ultimaRx.rx_le_cil, eixo: ultimaRx.rx_le_eixo, av: ultimaRx.rx_le_av, prisma: ultimaRx.rx_le_prisma, dnp: ultimaRx.rx_le_dnp },
                      ].map(row => (
                        <tr key={row.label}>
                          <td style={{ padding: '6px 10px', fontWeight: 700, fontSize: 12, color: '#60a5fa' }}>{row.label}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', color: '#60a5fa' }}>{fmtRx(row.esf)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', color: '#60a5fa' }}>{fmtRx(row.cil)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#60a5fa' }}>{row.eixo ? row.eixo + '°' : '—'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#60a5fa' }}>{row.av || '—'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#60a5fa' }}>{row.prisma || '—'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#60a5fa' }}>{row.dnp || '—'}</td>
                        </tr>
                      ))}
                      {ultimaRx.rx_adicao && (
                        <tr>
                          <td style={{ padding: '6px 10px', fontWeight: 700, fontSize: 12 }}>Adição</td>
                          <td colSpan={6} style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{Number(ultimaRx.rx_adicao).toFixed(2).replace('.', ',')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                    {ultimaRx.rx_tipo_lente && <div style={{ fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>Lente: </span><strong>{ultimaRx.rx_tipo_lente}</strong></div>}
                    {ultimaRx.rx_tratamento && <div style={{ fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>Tratamento: </span><strong>{ultimaRx.rx_tratamento}</strong></div>}
                    {ultimaRx.rx_av_perto && <div style={{ fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>AV Perto: </span><strong>{ultimaRx.rx_av_perto}</strong></div>}
                  </div>
                </div>

                {/* Acuidade Visual */}
                {(ultimaRx.av_sc_od_vl || ultimaRx.av_cc_od_vl) && (
                  <div style={{ padding: '0 20px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Acuidade Visual</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '5px 8px', color: 'var(--text-muted)', fontWeight: 600 }}></th>
                          <th colSpan={2} style={{ padding: '5px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>VL</th>
                          <th colSpan={2} style={{ padding: '5px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>VP</th>
                        </tr>
                        <tr>
                          <th style={{ padding: '4px 8px' }}></th>
                          {['OD','OE','OD','OE'].map((l, i) => <th key={i} style={{ padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11 }}>{l}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '4px 8px', fontWeight: 700, fontSize: 11 }}>S/C</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{ultimaRx.av_sc_od_vl || '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{ultimaRx.av_sc_oe_vl || '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{ultimaRx.av_sc_od_vp || '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{ultimaRx.av_sc_oe_vp || '—'}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '4px 8px', fontWeight: 700, fontSize: 11 }}>C/C</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{ultimaRx.av_cc_od_vl || '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{ultimaRx.av_cc_oe_vl || '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{ultimaRx.av_cc_od_vp || '—'}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{ultimaRx.av_cc_oe_vp || '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: HISTÓRICO CLÍNICO ══ */}
        {tabAtiva === 'historico' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {consultas.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60 }}>
                <FileText size={40} style={{ opacity: .3, marginBottom: 12 }} />
                <p>Nenhuma consulta registrada.</p>
              </div>
            ) : consultas.map(c => (
              <div key={c.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

                {/* Header do card */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, background: 'rgba(99,102,241,.05)' }}>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Data</div><div style={{ fontWeight: 700 }}>{fmtDate(c.date)}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Profissional</div><div style={{ fontWeight: 600 }}>{c.professional_name || '—'}</div></div>
                    {c.queixa_principal && <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Queixa</div><div style={{ fontSize: 13 }}>{c.queixa_principal}</div></div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isValida(c.date) ? 'rgba(34,197,94,.15)' : 'rgba(248,113,113,.15)', color: isValida(c.date) ? '#22c55e' : '#f87171' }}>
                      {isValida(c.date) ? '✓ Válida' : '✗ Vencida'}
                    </span>
                    <button onClick={() => navigate('/consulta/atendimento/' + c.id)} style={{ background: 'rgba(99,102,241,.15)', border: '1px solid #6366f1', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', color: '#a5b4fc', fontSize: 12, fontWeight: 600 }}>
                      Ver consulta
                    </button>
                  </div>
                </div>

                {/* Conteúdo clínico em grid */}
                <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>

                  {/* Anamnese */}
                  {(c.sintomas?.length || c.doencas_oculares?.length || c.doencas_sistemicas?.length || c.medicamentos?.length) && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Anamnese</div>
                      {c.sintomas?.length > 0 && <div style={{ fontSize: 12, marginBottom: 4 }}><span style={{ color: 'var(--text-muted)' }}>Sintomas: </span>{checks(c.sintomas)}</div>}
                      {c.doencas_oculares?.length > 0 && <div style={{ fontSize: 12, marginBottom: 4 }}><span style={{ color: 'var(--text-muted)' }}>D. Oculares: </span>{checks(c.doencas_oculares)}</div>}
                      {c.doencas_sistemicas?.length > 0 && <div style={{ fontSize: 12, marginBottom: 4 }}><span style={{ color: 'var(--text-muted)' }}>D. Sistêmicas: </span>{checks(c.doencas_sistemicas)}</div>}
                      {c.medicamentos?.length > 0 && <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>Medicamentos: </span>{checks(c.medicamentos)}</div>}
                    </div>
                  )}

                  {/* Acuidade Visual */}
                  {(c.av_sc_od_vl || c.av_cc_od_vl) && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Acuidade Visual</div>
                      <div style={{ fontSize: 12, marginBottom: 3 }}><span style={{ color: 'var(--text-muted)' }}>VL S/C: </span>OD {c.av_sc_od_vl || '—'} / OE {c.av_sc_oe_vl || '—'}</div>
                      <div style={{ fontSize: 12, marginBottom: 3 }}><span style={{ color: 'var(--text-muted)' }}>VL C/C: </span>OD {c.av_cc_od_vl || '—'} / OE {c.av_cc_oe_vl || '—'}</div>
                      <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>VP S/C: </span>OD {c.av_sc_od_vp || '—'} / OE {c.av_sc_oe_vp || '—'}</div>
                    </div>
                  )}

                  {/* Tonometria */}
                  {(c.tono_od || c.tono_oe) && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Tonometria</div>
                      <div style={{ fontSize: 12, marginBottom: 3 }}><span style={{ color: 'var(--text-muted)' }}>OD: </span>{c.tono_od || '—'}</div>
                      <div style={{ fontSize: 12, marginBottom: 3 }}><span style={{ color: 'var(--text-muted)' }}>OE: </span>{c.tono_oe || '—'}</div>
                      {c.tono_hora && <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>Hora: </span>{c.tono_hora}</div>}
                    </div>
                  )}

                  {/* Diagnóstico */}
                  {(c.dx_refrativo || c.dx_motor || c.dx_ocular || c.dx_conduta?.length) && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Diagnóstico</div>
                      {c.dx_refrativo && <div style={{ fontSize: 12, marginBottom: 3 }}><span style={{ color: 'var(--text-muted)' }}>Refrativo: </span>{c.dx_refrativo}</div>}
                      {c.dx_motor && <div style={{ fontSize: 12, marginBottom: 3 }}><span style={{ color: 'var(--text-muted)' }}>Motor: </span>{c.dx_motor}</div>}
                      {c.dx_ocular && <div style={{ fontSize: 12, marginBottom: 3 }}><span style={{ color: 'var(--text-muted)' }}>Ocular: </span>{c.dx_ocular}</div>}
                      {c.dx_conduta?.length > 0 && <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>Conduta: </span>{checks(c.dx_conduta)}</div>}
                    </div>
                  )}

                  {/* RX */}
                  {(c.rx_re_esf != null || c.rx_le_esf != null) && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>RX Final</div>
                      <div style={{ fontSize: 12, marginBottom: 3, fontFamily: 'monospace' }}><span style={{ color: 'var(--text-muted)', fontFamily: 'inherit' }}>OD: </span>{fmtRx(c.rx_re_esf)} {fmtRx(c.rx_re_cil)} {c.rx_re_eixo ? c.rx_re_eixo + '°' : ''}</div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace' }}><span style={{ color: 'var(--text-muted)', fontFamily: 'inherit' }}>OE: </span>{fmtRx(c.rx_le_esf)} {fmtRx(c.rx_le_cil)} {c.rx_le_eixo ? c.rx_le_eixo + '°' : ''}</div>
                      {c.rx_adicao && <div style={{ fontSize: 12, marginTop: 3 }}><span style={{ color: 'var(--text-muted)' }}>Adição: </span>{Number(c.rx_adicao).toFixed(2).replace('.', ',')}</div>}
                    </div>
                  )}

                  {/* Obs */}
                  {c.anamnese_obs && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Observações</div>
                      <div style={{ fontSize: 12, lineHeight: 1.5 }}>{c.anamnese_obs}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

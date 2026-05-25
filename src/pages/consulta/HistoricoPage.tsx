import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Printer, Eye } from 'lucide-react';

function fmtRx(v: any): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(2).replace('.', ',');
}

function fmtAdicao(v: any): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return n.toFixed(2).replace('.', ',');
}

function fmtDate(d: string): string {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function isValida(dateStr: string, retornoStr: string): boolean {
  // Válida se a data da consulta + 1 ano >= hoje
  if (!dateStr) return false;
  const consulta = new Date(dateStr + 'T12:00:00');
  const validade = new Date(consulta);
  validade.setFullYear(validade.getFullYear() + 1);
  return validade >= new Date();
}

export default function HistoricoPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [consultas, setConsultas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState('');

  useEffect(() => {
    if (!tenantId || !customerId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('consultations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId)
        .order('date', { ascending: false });
      if (data && data.length > 0) {
        setCustomerName(data[0].customer_name || '');
        setConsultas(data);
      }
      setLoading(false);
    };
    load();
  }, [tenantId, customerId]);

  const handlePrint = (c: any) => {
    const win = window.open('', '_blank');
    if (!win) return;
    const validade = c.date ? new Date(new Date(c.date + 'T12:00:00').setFullYear(new Date(c.date + 'T12:00:00').getFullYear() + 1)).toLocaleDateString('pt-BR') : '—';
    win.document.write(`
      <html><head><title>Receita — ${c.customer_name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #000; font-size: 13px; }
        h2 { text-align: center; margin-bottom: 4px; }
        .sub { text-align: center; color: #555; margin-bottom: 24px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { border: 1px solid #ccc; padding: 7px 10px; text-align: center; }
        th { background: #f0f0f0; font-size: 11px; }
        .label { text-align: left; font-weight: bold; }
        .footer { margin-top: 40px; text-align: center; }
        .line { border-top: 1px solid #000; width: 200px; margin: 0 auto 4px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <h2>PRESCRIÇÃO PARA ÓCULOS</h2>
      <div class="sub">
        Paciente: <strong>${c.customer_name}</strong> &nbsp;|&nbsp;
        Data: ${fmtDate(c.date)} &nbsp;|&nbsp;
        Válida até: ${validade}
      </div>
      <table>
        <tr><th></th><th>Esférico</th><th>Cilíndrico</th><th>Eixo</th><th>AV</th><th>DNP</th></tr>
        <tr>
          <td class="label">OD (Longe)</td>
          <td>${fmtRx(c.rx_re_esf)}</td><td>${fmtRx(c.rx_re_cil)}</td>
          <td>${c.rx_re_eixo ? c.rx_re_eixo + '°' : '—'}</td>
          <td>${c.rx_re_av || '—'}</td><td>${c.rx_re_dnp || '—'}</td>
        </tr>
        <tr>
          <td class="label">OE (Longe)</td>
          <td>${fmtRx(c.rx_le_esf)}</td><td>${fmtRx(c.rx_le_cil)}</td>
          <td>${c.rx_le_eixo ? c.rx_le_eixo + '°' : '—'}</td>
          <td>${c.rx_le_av || '—'}</td><td>${c.rx_le_dnp || '—'}</td>
        </tr>
        ${c.rx_adicao ? `
        <tr><td class="label" colspan="6" style="text-align:left">Adição: <strong>${fmtAdicao(c.rx_adicao)}</strong></td></tr>
        ` : ''}
      </table>
      ${c.rx_tipo_lente ? `<p><strong>Tipo de Lente:</strong> ${c.rx_tipo_lente}</p>` : ''}
      ${c.rx_tratamento ? `<p><strong>Tratamento:</strong> ${c.rx_tratamento}</p>` : ''}
      <div class="footer">
        <div class="line"></div>
        <div>${c.professional_name || ''}</div>
        <div style="font-size:11px;color:#555">Médico / Optometrista</div>
      </div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ color:'var(--text-muted)' }}>Carregando histórico...</div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', padding:'0 0 40px' }}>

      {/* Cabeçalho */}
      <div style={{ background:'var(--bg-card)', borderBottom:'1px solid var(--border)', padding:'16px 28px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:13, marginBottom:8 }}
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:'white' }}>
            {(customerName||'?').slice(0,2).toUpperCase()}
          </div>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:700 }}>{customerName}</h2>
            <div style={{ fontSize:13, color:'var(--text-muted)' }}>{consultas.length} consulta(s) registrada(s)</div>
          </div>
        </div>
      </div>

      {/* Lista de consultas */}
      <div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>
        {consultas.length === 0 ? (
          <div style={{ textAlign:'center', color:'var(--text-muted)', marginTop:60 }}>
            <Eye size={40} style={{ opacity:.3, marginBottom:12 }} />
            <p>Nenhuma consulta registrada para este paciente.</p>
          </div>
        ) : consultas.map(c => {
          const valida = isValida(c.date, c.rx_retorno);
          const validadeDate = c.date ? new Date(new Date(c.date + 'T12:00:00').setFullYear(new Date(c.date + 'T12:00:00').getFullYear() + 1)).toLocaleDateString('pt-BR') : '—';
          const temRx = c.rx_re_esf != null || c.rx_le_esf != null;

          return (
            <div key={c.id} style={{ background:'var(--bg-card)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>

              {/* Header do card */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:2 }}>Data da Consulta</div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{fmtDate(c.date)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:2 }}>Válida até</div>
                    <div style={{ fontWeight:600, fontSize:14, color: valida ? '#22c55e' : '#f87171' }}>{validadeDate}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:2 }}>Profissional</div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{c.professional_name || '—'}</div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {/* Badge status validade */}
                  <span style={{
                    padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700,
                    background: valida ? 'rgba(34,197,94,.15)' : 'rgba(248,113,113,.15)',
                    color: valida ? '#22c55e' : '#f87171'
                  }}>
                    {valida ? '✓ Válida' : '✗ Vencida'}
                  </span>
                  <button
                    onClick={() => navigate('/consulta/atendimento/' + c.id)}
                    style={{ background:'rgba(99,102,241,.15)', border:'1px solid #6366f1', borderRadius:8, padding:'6px 14px', cursor:'pointer', color:'#a5b4fc', fontSize:12, fontWeight:600 }}
                  >
                    Ver consulta
                  </button>
                  {temRx && (
                    <button
                      onClick={() => handlePrint(c)}
                      style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(6,182,212,.15)', border:'1px solid #06b6d4', borderRadius:8, padding:'6px 14px', cursor:'pointer', color:'#67e8f9', fontSize:12, fontWeight:600 }}
                    >
                      <Printer size={13} /> Imprimir
                    </button>
                  )}
                </div>
              </div>

              {/* Tabela RX */}
              {temRx ? (
                <div style={{ padding:'16px 20px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Receita</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr>
                        <th style={{ width:100, padding:'6px 10px', textAlign:'left', color:'var(--text-muted)', fontWeight:600, fontSize:11 }}></th>
                        <th style={{ padding:'6px 10px', color:'var(--text-muted)', fontWeight:600, fontSize:11, textAlign:'center' }}>Esférico</th>
                        <th style={{ padding:'6px 10px', color:'var(--text-muted)', fontWeight:600, fontSize:11, textAlign:'center' }}>Cilíndrico</th>
                        <th style={{ padding:'6px 10px', color:'var(--text-muted)', fontWeight:600, fontSize:11, textAlign:'center' }}>Eixo</th>
                        <th style={{ padding:'6px 10px', color:'var(--text-muted)', fontWeight:600, fontSize:11, textAlign:'center' }}>AV</th>
                        <th style={{ padding:'6px 10px', color:'var(--text-muted)', fontWeight:600, fontSize:11, textAlign:'center' }}>DNP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Longe */}
                      <tr>
                        <td style={{ padding:'5px 10px', fontSize:11, fontWeight:700, color:'#60a5fa' }}>👁 OD (Longe)</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', fontFamily:'monospace', color:'#60a5fa' }}>{fmtRx(c.rx_re_esf)}</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', fontFamily:'monospace', color:'#60a5fa' }}>{fmtRx(c.rx_re_cil)}</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', color:'#60a5fa' }}>{c.rx_re_eixo ? c.rx_re_eixo + '°' : '—'}</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', color:'#60a5fa' }}>{c.rx_re_av || '—'}</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', color:'#60a5fa' }}>{c.rx_re_dnp || '—'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding:'5px 10px', fontSize:11, fontWeight:700, color:'#60a5fa' }}>👁 OE (Longe)</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', fontFamily:'monospace', color:'#60a5fa' }}>{fmtRx(c.rx_le_esf)}</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', fontFamily:'monospace', color:'#60a5fa' }}>{fmtRx(c.rx_le_cil)}</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', color:'#60a5fa' }}>{c.rx_le_eixo ? c.rx_le_eixo + '°' : '—'}</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', color:'#60a5fa' }}>{c.rx_le_av || '—'}</td>
                        <td style={{ padding:'5px 10px', textAlign:'center', color:'#60a5fa' }}>{c.rx_le_dnp || '—'}</td>
                      </tr>

                      {/* Perto (presbiopia) — só mostra se tiver adição */}
                      {c.rx_adicao != null && (
                        <>
                          <tr><td colSpan={6} style={{ padding:'4px 0' }}></td></tr>
                          <tr>
                            <td style={{ padding:'5px 10px', fontSize:11, fontWeight:700, color:'#f87171' }}>👁 OD (Perto)</td>
                            <td style={{ padding:'5px 10px', textAlign:'center', fontFamily:'monospace', color:'#f87171' }}>
                              {c.rx_re_esf != null ? fmtRx(Number(c.rx_re_esf) + Number(c.rx_adicao)) : '—'}
                            </td>
                            <td style={{ padding:'5px 10px', textAlign:'center', fontFamily:'monospace', color:'#f87171' }}>{fmtRx(c.rx_re_cil)}</td>
                            <td style={{ padding:'5px 10px', textAlign:'center', color:'#f87171' }}>{c.rx_re_eixo ? c.rx_re_eixo + '°' : '—'}</td>
                            <td style={{ padding:'5px 10px', textAlign:'center', color:'#f87171' }}>{c.rx_av_perto || '—'}</td>
                            <td style={{ padding:'5px 10px', textAlign:'center', color:'#f87171' }}>{c.rx_re_dnp || '—'}</td>
                          </tr>
                          <tr>
                            <td style={{ padding:'5px 10px', fontSize:11, fontWeight:700, color:'#f87171' }}>👁 OE (Perto)</td>
                            <td style={{ padding:'5px 10px', textAlign:'center', fontFamily:'monospace', color:'#f87171' }}>
                              {c.rx_le_esf != null ? fmtRx(Number(c.rx_le_esf) + Number(c.rx_adicao)) : '—'}
                            </td>
                            <td style={{ padding:'5px 10px', textAlign:'center', fontFamily:'monospace', color:'#f87171' }}>{fmtRx(c.rx_le_cil)}</td>
                            <td style={{ padding:'5px 10px', textAlign:'center', color:'#f87171' }}>{c.rx_le_eixo ? c.rx_le_eixo + '°' : '—'}</td>
                            <td style={{ padding:'5px 10px', textAlign:'center', color:'#f87171' }}>{c.rx_av_perto || '—'}</td>
                            <td style={{ padding:'5px 10px', textAlign:'center', color:'#f87171' }}>{c.rx_le_dnp || '—'}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>

                  {/* Adição e extras */}
                  <div style={{ display:'flex', gap:24, marginTop:12, flexWrap:'wrap' }}>
                    {c.rx_adicao != null && (
                      <div style={{ fontSize:13 }}>
                        <span style={{ color:'var(--text-muted)' }}>Adição: </span>
                        <strong>{fmtAdicao(c.rx_adicao)}</strong>
                      </div>
                    )}
                    {c.rx_tipo_lente && (
                      <div style={{ fontSize:13 }}>
                        <span style={{ color:'var(--text-muted)' }}>Lente: </span>
                        <strong>{c.rx_tipo_lente}</strong>
                      </div>
                    )}
                    {c.rx_tratamento && (
                      <div style={{ fontSize:13 }}>
                        <span style={{ color:'var(--text-muted)' }}>Tratamento: </span>
                        <strong>{c.rx_tratamento}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding:'16px 20px', color:'var(--text-muted)', fontSize:13 }}>
                  Nenhum RX registrado nesta consulta.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

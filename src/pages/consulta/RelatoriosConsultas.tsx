import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { fetchAllRows } from '../../lib/fetchAll';
import { DollarSign, TrendingUp, TrendingDown, Award, Handshake, Stethoscope, ListFilter, Download } from 'lucide-react';
import { formatBRL, formatDate } from '../../types/index';
import { exportarCSV } from '../../lib/exportCsv';

function KpiCard({ icon: Icon, color, value, label }: any) {
  return (
    <div className="card" style={{ padding: 18, borderTop: `3px solid ${color}` }}>
      <div style={{ color, marginBottom: 6 }}><Icon size={22} /></div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

export default function RelatoriosConsultas() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('mes');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [totalReceita, setTotalReceita] = useState(0);
  const [totalDespesa, setTotalDespesa] = useState(0);
  const [porProfissional, setPorProfissional] = useState<any[]>([]);
  const [porConvenio, setPorConvenio] = useState<any[]>([]);
  const [porProcedimento, setPorProcedimento] = useState<any[]>([]);

  // Extrato detalhado (paciente a paciente) - listas pra popular os filtros
  // e os itens em si, com os nomes ja resolvidos (join feito na mao, pois
  // clinic_financial_entries so guarda os ids).
  const [itens, setItens] = useState<any[]>([]);
  const [listaProfissionais, setListaProfissionais] = useState<{ id: string; name: string }[]>([]);
  const [listaParcerias, setListaParcerias] = useState<{ id: string; name: string }[]>([]);
  const [listaProcedimentos, setListaProcedimentos] = useState<{ id: string; name: string }[]>([]);
  const [filtroProfissional, setFiltroProfissional] = useState('');
  const [filtroParceria, setFiltroParceria] = useState('');
  const [filtroPagamento, setFiltroPagamento] = useState('');
  const [filtroProcedimento, setFiltroProcedimento] = useState('');

  const getRange = () => {
    if (periodo === 'custom' && dateFrom && dateTo) return { from: dateFrom, to: dateTo };
    const hoje = new Date();
    if (periodo === 'hoje') { const d = hoje.toISOString().split('T')[0]; return { from: d, to: d }; }
    if (periodo === 'semana') { const from = new Date(hoje); from.setDate(hoje.getDate() - 7); return { from: from.toISOString().split('T')[0], to: hoje.toISOString().split('T')[0] }; }
    if (periodo === '30dias') { const from = new Date(hoje); from.setDate(hoje.getDate() - 30); return { from: from.toISOString().split('T')[0], to: hoje.toISOString().split('T')[0] }; }
    if (periodo === 'ano') return { from: hoje.getFullYear() + '-01-01', to: hoje.toISOString().split('T')[0] };
    return { from: hoje.toISOString().slice(0, 8) + '01', to: hoje.toISOString().split('T')[0] };
  };

  useEffect(() => { if (tenantId) loadData(); }, [tenantId, periodo, dateFrom, dateTo]);

  const formasPagamento = useMemo(
    () => Array.from(new Set(itens.map(i => i.pagamento).filter(p => p && p !== '—'))).sort(),
    [itens]
  );
  const itensFiltrados = useMemo(() => itens.filter(i =>
    (!filtroProfissional || i.profissionalId === filtroProfissional) &&
    (!filtroParceria || i.parceriaId === filtroParceria) &&
    (!filtroPagamento || i.pagamento === filtroPagamento) &&
    (!filtroProcedimento || i.procedimentoId === filtroProcedimento)
  ), [itens, filtroProfissional, filtroParceria, filtroPagamento, filtroProcedimento]);
  const totalFiltrado = itensFiltrados.reduce((s, i) => s + i.valor, 0);

  const loadData = async () => {
    setLoading(true);
    const { from, to } = getRange();
    const [entries, professionals, partnershipsList, proceduresList, consultationsList] = await Promise.all([
      fetchAllRows<any>((rf, rt) => supabase.from('clinic_financial_entries').select('*')
        .eq('tenant_id', tenantId).gte('due_date', from).lte('due_date', to).range(rf, rt)),
      supabase.from('professionals').select('id,name').eq('tenant_id', tenantId).then(({ data }) => data || []),
      supabase.from('partnerships').select('id,name').eq('tenant_id', tenantId).then(({ data }) => data || []),
      supabase.from('procedures').select('id,name').eq('tenant_id', tenantId).then(({ data }) => data || []),
      fetchAllRows<any>((rf, rt) => supabase.from('consultations').select('id,customer_name').eq('tenant_id', tenantId).range(rf, rt)),
    ]);

    const profMap: Record<string, string> = {};
    (professionals as any[]).forEach(p => { profMap[p.id] = p.name; });
    const partnerMap: Record<string, string> = {};
    (partnershipsList as any[]).forEach(p => { partnerMap[p.id] = p.name; });
    const procMap: Record<string, string> = {};
    (proceduresList as any[]).forEach(p => { procMap[p.id] = p.name; });
    const custMap: Record<string, string> = {};
    (consultationsList as any[]).forEach(c => { custMap[c.id] = c.customer_name; });
    setListaProfissionais(professionals as any[]);
    setListaParcerias(partnershipsList as any[]);
    setListaProcedimentos(proceduresList as any[]);

    const receitas = (entries || []).filter(e => e.type === 'receita');
    const despesas = (entries || []).filter(e => e.type === 'despesa');
    setTotalReceita(receitas.reduce((s, e) => s + Number(e.amount || 0), 0));
    setTotalDespesa(despesas.reduce((s, e) => s + Number(e.amount || 0), 0));

    // Agrupa por profissional: receita das consultas dele + comissão a pagar
    const grupo: Record<string, { nome: string; consultas: Set<string>; receita: number; comissao: number }> = {};
    receitas.forEach(e => {
      if (!e.professional_id) return;
      const g = grupo[e.professional_id] || (grupo[e.professional_id] = { nome: profMap[e.professional_id] || 'Profissional removido', consultas: new Set(), receita: 0, comissao: 0 });
      g.receita += Number(e.amount || 0);
      if (e.consultation_id) g.consultas.add(e.consultation_id);
    });
    despesas.filter(e => e.category === 'comissao_profissional').forEach(e => {
      if (!e.professional_id) return;
      const g = grupo[e.professional_id] || (grupo[e.professional_id] = { nome: profMap[e.professional_id] || 'Profissional removido', consultas: new Set(), receita: 0, comissao: 0 });
      g.comissao += Number(e.amount || 0);
    });
    setPorProfissional(Object.values(grupo).map(g => ({ ...g, consultas: g.consultas.size })).sort((a, b) => b.receita - a.receita));

    // Agrupa por convênio: receita das consultas por convênio + repasse (comissão do convênio) devido
    const grupoConv: Record<string, { nome: string; consultas: Set<string>; receita: number; repasse: number }> = {};
    receitas.forEach(e => {
      if (!e.partnership_id) return;
      const g = grupoConv[e.partnership_id] || (grupoConv[e.partnership_id] = { nome: partnerMap[e.partnership_id] || 'Parceria removida', consultas: new Set(), receita: 0, repasse: 0 });
      g.receita += Number(e.amount || 0);
      if (e.consultation_id) g.consultas.add(e.consultation_id);
    });
    despesas.filter(e => e.category === 'comissao_convenio').forEach(e => {
      if (!e.partnership_id) return;
      const g = grupoConv[e.partnership_id] || (grupoConv[e.partnership_id] = { nome: partnerMap[e.partnership_id] || 'Parceria removida', consultas: new Set(), receita: 0, repasse: 0 });
      g.repasse += Number(e.amount || 0);
    });
    setPorConvenio(Object.values(grupoConv).map(g => ({ ...g, consultas: g.consultas.size })).sort((a, b) => b.receita - a.receita));

    // Agrupa por procedimento: quantidade e receita (só a receita carrega procedure_id)
    const grupoProc: Record<string, { nome: string; consultas: Set<string>; receita: number }> = {};
    receitas.forEach(e => {
      if (!e.procedure_id) return;
      const g = grupoProc[e.procedure_id] || (grupoProc[e.procedure_id] = { nome: procMap[e.procedure_id] || 'Procedimento removido', consultas: new Set(), receita: 0 });
      g.receita += Number(e.amount || 0);
      if (e.consultation_id) g.consultas.add(e.consultation_id);
    });
    setPorProcedimento(Object.values(grupoProc).map(g => ({ ...g, consultas: g.consultas.size })).sort((a, b) => b.receita - a.receita));

    // Extrato detalhado: uma linha por atendimento cobrado (receita), com os
    // nomes ja resolvidos - e o que a Samara pedia pra ver ("todos os
    // pacientes que eu atendi no mes inteiro"), nao so o total agrupado.
    const itensDetalhados = receitas
      .filter(e => e.consultation_id)
      .map(e => ({
        id: e.id,
        data: e.due_date,
        paciente: custMap[e.consultation_id] || 'Paciente removido',
        procedimentoId: e.procedure_id || '',
        procedimento: e.procedure_id ? (procMap[e.procedure_id] || '—') : '—',
        profissionalId: e.professional_id || '',
        profissional: e.professional_id ? (profMap[e.professional_id] || '—') : '—',
        parceriaId: e.partnership_id || '',
        parceria: e.partnership_id ? (partnerMap[e.partnership_id] || '—') : 'Particular',
        pagamento: e.payment_method || '—',
        valor: Number(e.amount || 0),
        status: e.status,
      }))
      .sort((a, b) => (a.data < b.data ? 1 : -1));
    setItens(itensDetalhados);

    setLoading(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 160 }} value={periodo} onChange={e => setPeriodo(e.target.value)}>
          <option value="hoje">Hoje</option>
          <option value="semana">Últimos 7 dias</option>
          <option value="mes">Este mês</option>
          <option value="30dias">Últimos 30 dias</option>
          <option value="ano">Este ano</option>
          <option value="custom">Personalizado</option>
        </select>
        {periodo === 'custom' && (<>
          <input className="form-input" type="date" style={{ width: 160 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ color: 'var(--text-muted)' }}>até</span>
          <input className="form-input" type="date" style={{ width: 160 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </>)}
      </div>

      {loading ? <p style={{ color: 'var(--text-muted)' }}>Carregando...</p> : (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 28 }}>
          <KpiCard icon={TrendingUp} color="#22c55e" value={formatBRL(totalReceita)} label="Receita do período" />
          <KpiCard icon={TrendingDown} color="#f87171" value={formatBRL(totalDespesa)} label="Despesas (comissões) do período" />
          <KpiCard icon={DollarSign} color="#6366f1" value={formatBRL(totalReceita - totalDespesa)} label="Saldo líquido" />
        </div>

        <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Award size={16} /> Por profissional
        </h3>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Profissional</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Consultas</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Receita gerada</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Comissão a pagar</th>
              </tr>
            </thead>
            <tbody>
              {porProfissional.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum lançamento no período.</td></tr>
              )}
              {porProfissional.map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px' }}>{p.nome}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{p.consultas}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#22c55e' }}>{formatBRL(p.receita)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f87171' }}>{formatBRL(p.comissao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 12 }}>
          <Handshake size={16} /> Por Parceria (Ótica)
        </h3>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Parceria / Ótica</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Consultas</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Receita gerada</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Repasse devido</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>ROI (líquido)</th>
              </tr>
            </thead>
            <tbody>
              {porConvenio.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum atendimento por parceria no período.</td></tr>
              )}
              {porConvenio.map((c, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px' }}>{c.nome}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{c.consultas}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#22c55e' }}>{formatBRL(c.receita)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f87171' }}>{formatBRL(c.repasse)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#6366f1' }}>{formatBRL(c.receita - c.repasse)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 12 }}>
          <Stethoscope size={16} /> Por procedimento
        </h3>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Procedimento</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Quantidade</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Receita gerada</th>
              </tr>
            </thead>
            <tbody>
              {porProcedimento.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum lançamento no período.</td></tr>
              )}
              {porProcedimento.map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px' }}>{p.nome}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{p.consultas}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#22c55e' }}>{formatBRL(p.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 12 }}>
          <ListFilter size={16} /> Extrato detalhado (paciente a paciente)
        </h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <select className="form-input" style={{ width: 190 }} value={filtroProfissional} onChange={e => setFiltroProfissional(e.target.value)}>
            <option value="">Todos os profissionais</option>
            {listaProfissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="form-input" style={{ width: 190 }} value={filtroParceria} onChange={e => setFiltroParceria(e.target.value)}>
            <option value="">Todas as parcerias</option>
            {listaParcerias.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="form-input" style={{ width: 170 }} value={filtroPagamento} onChange={e => setFiltroPagamento(e.target.value)}>
            <option value="">Todas as formas de pagamento</option>
            {formasPagamento.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="form-input" style={{ width: 190 }} value={filtroProcedimento} onChange={e => setFiltroProcedimento(e.target.value)}>
            <option value="">Todos os procedimentos</option>
            {listaProcedimentos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
            disabled={itensFiltrados.length === 0}
            onClick={() => exportarCSV(
              `extrato-consultas-${dateFrom || getRange().from}-a-${dateTo || getRange().to}.csv`,
              [
                { chave: 'data', titulo: 'Data' },
                { chave: 'paciente', titulo: 'Paciente' },
                { chave: 'procedimento', titulo: 'Procedimento' },
                { chave: 'profissional', titulo: 'Profissional' },
                { chave: 'parceria', titulo: 'Parceria/Ótica' },
                { chave: 'pagamento', titulo: 'Forma de Pagamento' },
                { chave: 'valor', titulo: 'Valor (R$)' },
                { chave: 'status', titulo: 'Status' },
              ],
              itensFiltrados
            )}
          >
            <Download size={14} /> Exportar CSV
          </button>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Data</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Paciente</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Procedimento</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Profissional</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Parceria/Ótica</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>Forma de Pagamento</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Valor</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum atendimento cobrado no período com esses filtros.</td></tr>
              )}
              {itensFiltrados.map(i => (
                <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px' }}>{formatDate(i.data)}</td>
                  <td style={{ padding: '10px 14px' }}>{i.paciente}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{i.procedimento}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{i.profissional}</td>
                  <td style={{ padding: '10px 14px' }}>{i.parceria}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{i.pagamento}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#22c55e' }}>{formatBRL(i.valor)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, background: i.status === 'pago' ? 'rgba(34,197,94,.15)' : 'rgba(245,158,11,.15)', color: i.status === 'pago' ? '#22c55e' : '#f59e0b' }}>
                      {i.status === 'pago' ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {itensFiltrados.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan={6} style={{ padding: '10px 14px', fontWeight: 700 }}>Total do período ({itensFiltrados.length} atendimento{itensFiltrados.length === 1 ? '' : 's'})</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>{formatBRL(totalFiltrado)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </>)}
    </div>
  );
}

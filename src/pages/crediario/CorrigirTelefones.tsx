// Cobranca nova - Fase 2, Telefones (11/11/2026): quem deve e NAO recebe cobranca por falta de telefone valido.
// Lista gerada pela funcao cobranca_telefones_corrigir (supabase/migrations/20261111_telefones.sql).
// "Número sem WhatsApp" = a Meta recusou a mensagem; a marca some sozinha quando o telefone do cadastro e alterado.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

interface Linha { customer_id: string; nome: string; telefone: string; motivo: string; divida: number; parcelas: number; dias_max: number; cidade: string }
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CorrigirTelefones({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('');
  useEffect(() => {
    supabase.rpc('cobranca_telefones_corrigir', { p_tenant: tenantId }).then(({ data, error }) => {
      if (error) setErro(error.message); else setLinhas((data as Linha[]) || []);
    });
  }, [tenantId]);
  if (erro) return <div className="card" style={{ padding: 20, color: '#f87171' }}>Não foi possível carregar: {erro}</div>;
  if (!linhas) return <div className="empty-state"><p>Carregando...</p></div>;
  const total = linhas.reduce((s, l) => s + Number(l.divida), 0);
  const motivos = [...new Set(linhas.map(l => l.motivo))];
  const lista = filtro ? linhas.filter(l => l.motivo === filtro) : linhas;
  return (
    <div>
      <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: '4px solid #f59e0b' }}>
        <div style={{ fontWeight: 700 }}>{linhas.length} clientes devendo {brl(total)} não recebem cobrança por falta de telefone válido</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Quando o cliente vier à loja (ou ligar), atualize o celular no cadastro. A partir daí o robô volta a cobrar e ele entra no Feirão.
          Dívidas com mais de 5 anos não aparecem aqui.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {['', ...motivos].map(m => (
            <button key={m} onClick={() => setFiltro(m)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: '1px solid ' + (filtro === m ? '#f59e0b' : 'var(--border)'), background: filtro === m ? 'rgba(245,158,11,.15)' : 'none',
              color: filtro === m ? '#f59e0b' : 'var(--text-muted)' }}>
              {m || 'Todos'} ({m ? linhas.filter(l => l.motivo === m).length : linhas.length})
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>Cliente</th><th>Telefone no cadastro</th><th>Problema</th><th>Cidade</th><th style={{ textAlign: 'right' }}>Dívida</th><th>Atraso</th><th></th></tr></thead>
          <tbody>
            {lista.map(l => (
              <tr key={l.customer_id}>
                <td style={{ fontWeight: 600 }}>{l.nome}</td>
                <td>{l.telefone || '—'}</td>
                <td style={{ fontSize: 12, color: l.motivo.startsWith('Número sem') ? '#f87171' : '#f59e0b' }}>{l.motivo}</td>
                <td style={{ fontSize: 12 }}>{l.cidade || '—'}</td>
                <td style={{ textAlign: 'right' }}>{brl(Number(l.divida))} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({l.parcelas})</span></td>
                <td style={{ fontSize: 12 }}>{l.dias_max} dias</td>
                <td><button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => navigate('/clientes', { state: { buscar: l.nome } })}>Abrir cadastro</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { norm } from '../utils/normalize';

export default function BaixasTab() {
  const { tenantId } = useAuth();
  const [baixasLog, setBaixasLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase.from('baixas_log').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200);
    setBaixasLog(data || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const fmt = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDT = (d: string) => d ? new Date(d).toLocaleString('pt-BR') : '--';
  const filtered = baixasLog.filter(b => !search || norm(b.customer_name).includes(norm(search)) || norm(b.operator_name).includes(norm(search)));

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input className="form-input" placeholder="Buscar por cliente ou operador..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        <button className="btn btn-secondary" onClick={load}>Atualizar</button>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>Nenhuma baixa registrada ainda.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Data/Hora', 'Operador', 'Cliente', 'Parcela', 'Valor', 'Pago', 'Saldo', 'Tipo'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>{fmtDT(b.created_at)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600 }}>{b.operator_name || '--'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>{b.customer_name || '--'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>#{b.installment_number}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>{fmt(b.amount)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#22c55e', fontWeight: 600 }}>{fmt(b.paid_amount)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: b.balance > 0 ? '#eab308' : 'var(--text-muted)' }}>{b.balance > 0 ? fmt(b.balance) : '--'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: b.is_partial ? 'rgba(234,179,8,.2)' : 'rgba(34,197,94,.15)', color: b.is_partial ? '#eab308' : '#22c55e' }}>
                      {b.is_partial ? 'Parcial' : 'Total'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Link2 } from 'lucide-react';
import toast from 'react-hot-toast';

// Integração OptiFlow -> Centofin (MEI / Empresas). A loja gera a chave no
// Centofin (Integrações) e cola aqui. O envio é feito pela Edge Function
// centofin-sync a cada 15 minutos. A chave salva nunca volta para a tela.
export default function CentofinIntegracao() {
  const { tenantId } = useAuth();
  const [ativo, setAtivo] = useState(false);
  const [desde, setDesde] = useState('');
  const [chave, setChave] = useState('');
  const [status, setStatus] = useState<{ envio?: string; texto?: string }>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('store_settings')
      .select('centofin_ativo,centofin_desde,centofin_ultimo_envio,centofin_ultimo_status')
      .eq('tenant_id', tenantId).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setAtivo(!!(data as any).centofin_ativo);
        setDesde((data as any).centofin_desde || '');
        setStatus({ envio: (data as any).centofin_ultimo_envio || '', texto: (data as any).centofin_ultimo_status || '' });
      });
  }, [tenantId]);

  const salvar = async () => {
    if (ativo && chave && !chave.trim().startsWith('cfn_')) { toast.error('A chave do Centofin começa com cfn_'); return; }
    setSalvando(true);
    const dados: any = { centofin_ativo: ativo, centofin_desde: desde || null };
    if (chave.trim()) dados.centofin_chave = chave.trim();
    const { error } = await supabase.from('store_settings').update(dados).eq('tenant_id', tenantId);
    setSalvando(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    setChave('');
    toast.success(ativo ? 'Integração com o Centofin salva. Os dados vão em até 15 minutos.' : 'Integração desligada.');
  };

  const ok = (status.texto || '').startsWith('ok');
  return (
    <div className="card" style={{ padding: 24, gridColumn: '1/-1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={16} style={{ color: '#0F6E56' }} /> Centofin — controle financeiro e impostos da empresa
        </h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{ativo ? 'Ativado' : 'Desativado'}</span>
          <div onClick={() => setAtivo(a => !a)}
            style={{ width: 44, height: 24, borderRadius: 12, background: ativo ? '#22c55e' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'all 0.2s' }}>
            <div style={{ position: 'absolute', top: 2, left: ativo ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'all 0.2s' }} />
          </div>
        </label>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        Manda para o Centofin MEI / Empresas as vendas pagas, as despesas e o carnê (parcelas com vencimento e cada baixa), a cada 15 minutos.
        No Centofin, gere a chave em Integrações → OptiFlow e cole aqui.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div>
          <label className="form-label">Chave do Centofin</label>
          <input className="form-input" type="password" autoComplete="off" value={chave} onChange={e => setChave(e.target.value)}
            placeholder={status.envio || status.texto ? 'Chave já salva — cole outra só se for trocar' : 'cfn_...'} />
        </div>
        <div>
          <label className="form-label">Enviar a partir de</label>
          <input className="form-input" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Vazio = desde o dia 1 do mês atual</div>
        </div>
      </div>
      {status.envio && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', color: 'var(--text-muted)' }}>
          {ok ? '✅' : '⚠️'} Último envio: {new Date(status.envio).toLocaleString('pt-BR')} — {ok ? 'tudo certo' : status.texto}
        </div>
      )}
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar integração'}</button>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { MessageCircle, QrCode, X, RotateCcw, History, AlertTriangle, Phone } from 'lucide-react';
import { formatDateTime } from '../types/index';
import toast from 'react-hot-toast';

const TRIGGER_LABELS: Record<string, string> = {
  aniversario: 'Aniversário',
  vencimento: 'Vencimento de parcela',
  vencimento_dia: 'Vencimento (no dia)',
  vencimento_atraso5: 'Vencimento (5 dias de atraso)',
  pos_venda: 'Pós-venda',
  adaptacao: 'Adaptação',
  cobranca_atraso: 'Cobrança de atraso',
  cobranca_manual: 'Cobrança manual (robô)',
  cobranca_manual_local: 'Cobrança manual (WhatsApp do celular)',
  aviso_negativacao: 'Aviso de negativação (débito > 1 ano)',
  negociacao_debito_antigo: 'Convite p/ negociar (débito > 1 ano)',
};

// Mesmo prazo usado em supabase/functions/send-whatsapp-triggers/index.ts
// (PRAZO_NEGATIVACAO_DIAS) — se um dia for alterado lá, mudar aqui também.
const PRAZO_NEGATIVACAO_DIAS = 10;

export default function WhatsAppAutomatico() {
  const { user, tenantId } = useAuth();
  const isMaster = user?.role === 'master';

  const [status, setStatus] = useState<{ connected: boolean; instance: string | null; state?: string } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);

  // Cadastro no SPC/Serasa (controla o tom do aviso de debito > 1 ano, ver
  // send-whatsapp-triggers/index.ts secao 6) e a lista de clientes cujo
  // prazo de 10 dias ja venceu sem pagamento, para negativacao manual.
  const [spcAtivo, setSpcAtivo] = useState(false);
  const [loadingSpc, setLoadingSpc] = useState(true);
  const [salvandoSpc, setSalvandoSpc] = useState(false);
  const [aguardandoNeg, setAguardandoNeg] = useState<Array<{ customer_id: string; customer_name: string; phone: string | null; avisado_em: string }>>([]);
  const [loadingNeg, setLoadingNeg] = useState(false);

  const carregarStatus = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('whatsapp-manage', { body: { action: 'status' } });
    if (!error && data) setStatus(data);
    setLoadingStatus(false);
    return data;
  }, []);

  const carregarHistorico = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('whatsapp_triggers_log')
      .select('trigger_type, sent_at, success, error_message')
      .eq('tenant_id', tenantId)
      .order('sent_at', { ascending: false })
      .limit(20);
    setHistorico(data || []);
  }, [tenantId]);

  const carregarSpc = useCallback(async () => {
    if (!tenantId) return;
    setLoadingSpc(true);
    const { data } = await supabase.from('tenants').select('spc_serasa_ativo').eq('id', tenantId).single();
    setSpcAtivo(!!data?.spc_serasa_ativo);
    setLoadingSpc(false);
  }, [tenantId]);

  const alternarSpc = async () => {
    if (!tenantId) return;
    const novoValor = !spcAtivo;
    setSalvandoSpc(true);
    try {
      const { error } = await supabase.from('tenants').update({ spc_serasa_ativo: novoValor }).eq('id', tenantId);
      if (error) throw error;
      setSpcAtivo(novoValor);
      toast.success(novoValor
        ? 'Ativado. Débitos com mais de 1 ano agora recebem o aviso formal de prazo/negativação.'
        : 'Desativado. Débitos com mais de 1 ano agora recebem apenas o convite para negociar.');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSalvandoSpc(false);
    }
  };

  // Clientes que ja receberam o aviso formal (aviso_negativacao) ha mais de
  // PRAZO_NEGATIVACAO_DIAS e ainda tem parcela pendente — candidatos a
  // negativacao manual no SPC/Serasa (o OptiFlow nao faz isso sozinho).
  const carregarAguardandoNeg = useCallback(async () => {
    if (!tenantId) return;
    setLoadingNeg(true);
    try {
      const limiteIso = new Date(Date.now() - PRAZO_NEGATIVACAO_DIAS * 86400000).toISOString();
      const { data: avisos } = await supabase
        .from('whatsapp_triggers_log')
        .select('customer_id, sent_at')
        .eq('tenant_id', tenantId)
        .eq('trigger_type', 'aviso_negativacao')
        .eq('success', true)
        .lte('sent_at', limiteIso)
        .order('sent_at', { ascending: true });

      const porCliente = new Map<string, string>();
      for (const a of avisos || []) {
        if (a.customer_id && !porCliente.has(a.customer_id)) porCliente.set(a.customer_id, a.sent_at);
      }
      if (porCliente.size === 0) { setAguardandoNeg([]); return; }

      const idsAvisados = [...porCliente.keys()];

      // So entra na lista quem AINDA deve (se ja pagou tudo, sai da lista
      // sozinho, sem precisar de nenhuma acao manual de "resolver").
      const { data: creditosDoCliente } = await supabase
        .from('crediario')
        .select('id, customer_id')
        .in('customer_id', idsAvisados);
      const credIds = (creditosDoCliente || []).map((c: any) => c.id);
      const credParaCliente: Record<string, string> = {};
      for (const c of creditosDoCliente || []) credParaCliente[c.id] = c.customer_id;

      const { data: parcelasPendentes } = credIds.length
        ? await supabase.from('crediario_parcelas').select('crediario_id').in('crediario_id', credIds).eq('status', 'pendente')
        : { data: [] as any[] };
      const aindaDeve = new Set<string>((parcelasPendentes || []).map((p: any) => credParaCliente[p.crediario_id]).filter(Boolean));

      const idsFinal = idsAvisados.filter((id) => aindaDeve.has(id));
      if (idsFinal.length === 0) { setAguardandoNeg([]); return; }

      const { data: clientes } = await supabase.from('customers').select('id, name, whatsapp, phone').in('id', idsFinal);
      const nomeECelular: Record<string, { name: string; phone: string | null }> = {};
      for (const c of clientes || []) nomeECelular[c.id] = { name: c.name, phone: c.whatsapp || c.phone || null };

      setAguardandoNeg(
        idsFinal.map((id) => ({
          customer_id: id,
          customer_name: nomeECelular[id]?.name || 'Cliente',
          phone: nomeECelular[id]?.phone || null,
          avisado_em: porCliente.get(id)!,
        }))
      );
    } finally {
      setLoadingNeg(false);
    }
  }, [tenantId]);

  useEffect(() => { carregarStatus(); carregarHistorico(); carregarSpc(); carregarAguardandoNeg(); }, [carregarStatus, carregarHistorico, carregarSpc, carregarAguardandoNeg]);

  // Enquanto o QR Code está na tela, confere a cada 4s se já conectou
  useEffect(() => {
    if (!qrcode) return;
    const interval = setInterval(async () => {
      const data = await carregarStatus();
      if (data?.connected) {
        setQrcode(null);
        toast.success('WhatsApp conectado com sucesso!');
        clearInterval(interval);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [qrcode, carregarStatus]);

  const conectar = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-manage', { body: { action: 'connect' } });
      if (error) throw error;
      if (data?.qrcode) {
        setQrcode(data.qrcode);
      } else {
        toast.error(data?.error || 'Não foi possível gerar o QR Code agora. Tente de novo em alguns segundos.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao conectar WhatsApp');
    } finally {
      setConnecting(false);
    }
  };

  const desconectar = async () => {
    if (!confirm('Tem certeza que quer desconectar o WhatsApp? Os gatilhos automáticos param de funcionar até reconectar.')) return;
    try {
      const { error } = await supabase.functions.invoke('whatsapp-manage', { body: { action: 'disconnect' } });
      if (error) throw error;
      toast.success('WhatsApp desconectado.');
      carregarStatus();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao desconectar');
    }
  };

  return (
    <div className="card" style={{ padding: 24, gridColumn: '1/-1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={16} style={{ color: '#25D366' }} /> WhatsApp Automático
        </h3>
        {!loadingStatus && (
          <span style={{
            padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: status?.connected ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
            color: status?.connected ? '#22c55e' : '#ef4444',
          }}>
            {status?.connected ? '🟢 Conectado' : '🔴 Desconectado'}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        Envia mensagens automáticas de aniversário, vencimento de parcela, pós-venda e adaptação de lentes — sem precisar de nada manual.
      </p>

      {!isMaster && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Só o dono da conta pode conectar ou desconectar o WhatsApp automático.
        </p>
      )}

      {isMaster && !status?.connected && !qrcode && (
        <button type="button" onClick={conectar} disabled={connecting}
          style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#25D366',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: connecting ? 'default' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8, opacity: connecting ? 0.7 : 1 }}>
          <QrCode size={16} /> {connecting ? 'Gerando QR Code...' : 'Conectar WhatsApp'}
        </button>
      )}

      {qrcode && (
        <div style={{ textAlign: 'center', padding: 20, background: 'rgba(255,255,255,.03)', borderRadius: 8, marginTop: 8 }}>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Abre o WhatsApp no celular da loja → <strong>Configurações → Aparelhos conectados → Conectar aparelho</strong> → aponta a câmera pra este QR Code:
          </p>
          <img src={qrcode} alt="QR Code do WhatsApp" style={{ width: 220, height: 220, borderRadius: 8, background: '#fff', padding: 8 }} />
          <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button type="button" onClick={() => setQrcode(null)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none',
                color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <X size={13} /> Cancelar
            </button>
            <button type="button" onClick={conectar}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none',
                color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RotateCcw size={13} /> Gerar novo QR Code
            </button>
          </div>
        </div>
      )}

      {isMaster && status?.connected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={desconectar}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)',
              color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Desconectar WhatsApp
          </button>
        </div>
      )}

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
          <AlertTriangle size={14} /> Débitos com mais de 1 ano
        </h4>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Em vez de mandar uma mensagem por parcela atrasada, esses clientes recebem um único aviso consolidado com o valor total (parcelas + juros).
          {spcAtivo
            ? ` Como sua loja está cadastrada no SPC/Serasa, o aviso é formal: dá um prazo de ${PRAZO_NEGATIVACAO_DIAS} dias e informa que o nome poderá ser negativado.`
            : ' Como sua loja ainda não está cadastrada no SPC/Serasa, o aviso é um convite para negociar, sem mencionar negativação.'}
        </p>

        {!loadingSpc && isMaster && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: salvandoSpc ? 'default' : 'pointer', fontSize: 13 }}>
            <span
              onClick={salvandoSpc ? undefined : alternarSpc}
              style={{
                width: 38, height: 22, borderRadius: 20, position: 'relative', flexShrink: 0,
                background: spcAtivo ? '#25D366' : 'rgba(255,255,255,.15)',
                transition: 'background .15s', opacity: salvandoSpc ? 0.6 : 1,
              }}>
              <span style={{
                position: 'absolute', top: 2, left: spcAtivo ? 18 : 2, width: 18, height: 18, borderRadius: '50%',
                background: '#fff', transition: 'left .15s',
              }} />
            </span>
            Loja tem cadastro ativo no SPC/Serasa
          </label>
        )}
        {!isMaster && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Só o dono da conta pode alterar essa configuração.</p>
        )}
      </div>

      {aguardandoNeg.length > 0 && (
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#f87171' }}>
            <Phone size={14} /> Aguardando negativação manual ({aguardandoNeg.length})
          </h4>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            O prazo de {PRAZO_NEGATIVACAO_DIAS} dias já venceu para estes clientes e o débito continua em aberto. O OptiFlow não negativa automaticamente — é preciso fazer isso direto no SPC/Serasa (ou ligar antes, se preferir uma última tentativa).
          </p>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Cliente</th>
                <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>WhatsApp</th>
                <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Avisado em</th>
              </tr>
            </thead>
            <tbody>
              {aguardandoNeg.map((c) => (
                <tr key={c.customer_id} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                  <td style={{ padding: '6px 8px' }}>{c.customer_name}</td>
                  <td style={{ padding: '6px 8px' }}>{c.phone || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{formatDateTime(c.avisado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loadingNeg && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>Carregando...</p>}

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
          <History size={14} /> Últimas mensagens enviadas
        </h4>
        {historico.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma mensagem enviada ainda.</p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Tipo</th>
                <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Quando</th>
                <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                  <td style={{ padding: '6px 8px' }}>{TRIGGER_LABELS[h.trigger_type] || h.trigger_type}</td>
                  <td style={{ padding: '6px 8px' }}>{formatDateTime(h.sent_at)}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {h.success
                      ? <span style={{ color: '#22c55e' }}>Enviada</span>
                      : <span style={{ color: '#ef4444' }} title={h.error_message || ''}>Falhou</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

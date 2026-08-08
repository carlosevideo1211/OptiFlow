import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { MessageCircle, QrCode, X, RotateCcw, History } from 'lucide-react';
import { formatDateTime } from '../types/index';
import toast from 'react-hot-toast';

const TRIGGER_LABELS: Record<string, string> = {
  aniversario: 'Aniversário',
  vencimento: 'Vencimento de parcela',
  pos_venda: 'Pós-venda',
  adaptacao: 'Adaptação',
};

export default function WhatsAppAutomatico() {
  const { user, tenantId } = useAuth();
  const isMaster = user?.role === 'master';

  const [status, setStatus] = useState<{ connected: boolean; instance: string | null; state?: string } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);

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

  useEffect(() => { carregarStatus(); carregarHistorico(); }, [carregarStatus, carregarHistorico]);

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

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { Check, QrCode, X, Loader2, CheckCircle, Copy, MessageCircle } from 'lucide-react';

const WHATSAPP = '5592992779106';
const PLANO_VALOR = 99.99;

const FEATURES = [
  'Usuarios ilimitados',
  'Clientes ilimitados',
  'Vendas / PDV',
  'Ordens de Servico',
  'Crediario',
  'Controle de estoque',
  'Relatorios avancados',
  'Suporte por email',
];

// Carrega a mesma biblioteca de QR Code (qrcodejs via CDN) ja usada para
// desenhar o Pix do carne (ver src/pages/VendasPage.tsx / printDoc.ts),
// so que aqui direto na tela, sem precisar abrir uma janela de impressao.
function carregarQrCodeLib(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).QRCode) { resolve(); return; }
    const existente = document.getElementById('qrcodejs-lib') as HTMLScriptElement | null;
    if (existente) { existente.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'qrcodejs-lib';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar biblioteca de QR Code'));
    document.head.appendChild(script);
  });
}

type AssinaturaResposta = {
  authorization_id: string;
  status: string;
  qr_payload: string | null;
  qr_image: string | null;
};

export default function PlanosPage() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [assinatura, setAssinatura] = useState<AssinaturaResposta | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const assinarComPix = async () => {
    if (!tenantId) { toast.error('Faca login primeiro'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-asaas-subscription', {
        body: { tenant_id: tenantId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.qr_payload) {
        console.warn('Autorizacao criada mas sem QR Code no formato esperado. Resposta crua:', data?.debug_raw);
        toast.error('Assinatura criada, mas nao conseguimos gerar o QR Code automaticamente. Entre em contato com o suporte informando o codigo: ' + data?.authorization_id);
        return;
      }
      setAssinatura(data);
      setConfirmado(false);
    } catch (e: any) {
      const msg = e?.message || 'Erro ao iniciar assinatura';
      toast.error(msg, msg.includes('CPF/CNPJ') ? { duration: 7000 } : undefined);
    } finally {
      setLoading(false);
    }
  };

  // Desenha o QR Code assim que o modal abre com um payload valido.
  useEffect(() => {
    if (!assinatura?.qr_payload || !qrRef.current) return;
    let cancelado = false;
    carregarQrCodeLib().then(() => {
      if (cancelado || !qrRef.current) return;
      qrRef.current.innerHTML = '';
      new (window as any).QRCode(qrRef.current, {
        text: assinatura.qr_payload,
        width: 220,
        height: 220,
        colorDark: '#000',
        colorLight: '#fff',
      });
    }).catch(() => toast.error('Nao foi possivel desenhar o QR Code. Use o botao de copiar o codigo abaixo.'));
    return () => { cancelado = true; };
  }, [assinatura?.qr_payload]);

  // Enquanto o modal esta aberto e ainda nao confirmou, verifica de tempos em
  // tempos se o webhook da Asaas ja ativou a assinatura (tenants.status='ativo').
  useEffect(() => {
    if (!assinatura || confirmado || !tenantId) return;
    let tentativas = 0;
    const maxTentativas = 40; // ~80s
    let cancelado = false;

    const verificar = async () => {
      if (cancelado) return;
      const { data } = await supabase.from('tenants').select('status').eq('id', tenantId).maybeSingle();
      tentativas++;
      if (data?.status === 'ativo') {
        setConfirmado(true);
        setTimeout(() => navigate('/dashboard'), 2500);
        return;
      }
      if (tentativas < maxTentativas && !cancelado) setTimeout(verificar, 2000);
    };
    verificar();
    return () => { cancelado = true; };
  }, [assinatura, confirmado, tenantId, navigate]);

  const copiarCodigo = () => {
    if (!assinatura?.qr_payload) return;
    navigator.clipboard.writeText(assinatura.qr_payload);
    toast.success('Codigo Pix copiado!');
  };

  const falarSobreWhatsAppNfe = () => {
    const msg = encodeURIComponent('Ola! Tenho interesse em envio automatico de WhatsApp e/ou emissao de NF-e no OptiFlow. Pode me passar mais detalhes?');
    window.open(`https://wa.me/${WHATSAPP}?text=${msg}`, '_blank');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Assine o OptiFlow</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>Um plano so, sem pegadinha. Cancele quando quiser.</p>
        </div>

        <div className="card" style={{ padding: 32, borderTop: '3px solid #6366f1' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Plano OptiFlow</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Tudo que sua otica precisa pra rodar no dia a dia</div>
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: '#6366f1' }}>R$ {PLANO_VALOR.toFixed(2).replace('.', ',')}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/mes</span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
            {FEATURES.map((f, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontSize: 13, color: 'var(--text)' }}>
                <Check size={14} color="#6366f1" style={{ marginTop: 2, flexShrink: 0 }} />{f}
              </li>
            ))}
          </ul>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 24, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <MessageCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>
              Nao inclui envio automatico de WhatsApp nem emissao de NF-e. Tem interesse em algum dos dois?{' '}
              <button onClick={falarSobreWhatsAppNfe} style={{ background: 'none', border: 'none', padding: 0, color: '#6366f1', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>
                Fale com a gente
              </button>.
            </span>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', fontSize: 14 }}
            onClick={assinarComPix}
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="spin" /> : <QrCode size={16} />}
            {loading ? 'Gerando cobranca...' : 'Assinar com Pix Automatico'}
          </button>
          <p style={{ textAlign: 'center', marginTop: 12, color: 'var(--text-muted)', fontSize: 12 }}>
            Voce autoriza uma vez; as proximas cobrancas acontecem sozinhas, sem precisar pagar todo mes na mao.
          </p>
        </div>
      </div>

      {assinatura && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: 32, maxWidth: 420, width: '100%', position: 'relative', textAlign: 'center' }}>
            <button
              onClick={() => setAssinatura(null)}
              style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={20} />
            </button>

            {!confirmado ? (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Escaneie para autorizar</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                  R$ {PLANO_VALOR.toFixed(2).replace('.', ',')}/mes via Pix Automatico
                </p>
                <div ref={qrRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }} />
                <button
                  onClick={copiarCodigo}
                  className="btn btn-secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 }}
                >
                  <Copy size={14} />Copiar codigo Pix
                </button>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                  <Loader2 size={14} className="spin" />Aguardando confirmacao do pagamento...
                </div>
              </>
            ) : (
              <>
                <CheckCircle size={64} color="#22c55e" style={{ marginBottom: 24 }} />
                <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Assinatura confirmada! 🎉</h1>
                <p style={{ color: 'var(--text-muted)' }}>Redirecionando para o dashboard...</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

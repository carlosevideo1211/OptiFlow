import { useEffect, useRef, useState } from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { pixEMV, carregarQrCodeLib } from '../utils/pix';
import { PLATFORM_PIX_KEY, PLATFORM_PIX_NOME } from '../config/platformPix';
import { formatBRL } from '../types/index';

// Modal "Gerar Pix" mostrado pro inquilino quando a mensalidade está
// vencendo/venceu (ver banner em DashboardPage.tsx). Gera um Pix "Copia e
// Cola" estático (mesma técnica já usada nos carnês de crediário — ver
// src/utils/pix.ts) usando a chave Pix pessoal/da empresa do Carlos
// (src/config/platformPix.ts), não a do Asaas. O pagamento cai direto na
// conta dele, fora do OptiFlow — por isso a liberação do acesso continua
// manual, feita por ele no Painel Admin depois de conferir o recebimento.
export default function GerarPixMensalidade({
  open,
  onClose,
  valor,
}: {
  open: boolean;
  onClose: () => void;
  valor: number;
}) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [copiado, setCopiado] = useState(false);

  const chaveConfigurada = !!PLATFORM_PIX_KEY;
  const payload = chaveConfigurada && valor > 0 ? pixEMV(PLATFORM_PIX_KEY, valor, PLATFORM_PIX_NOME) : '';

  useEffect(() => {
    if (!open || !payload) return;
    setCopiado(false);
    let cancelado = false;
    carregarQrCodeLib()
      .then(() => {
        if (cancelado || !qrRef.current) return;
        qrRef.current.innerHTML = '';
        new (window as any).QRCode(qrRef.current, {
          text: payload,
          width: 200,
          height: 200,
          colorDark: '#000',
          colorLight: '#fff',
        });
      })
      .catch(() => toast.error('Não foi possível carregar o QR Code. Você ainda pode copiar o código Pix abaixo.'));
    return () => { cancelado = true; };
  }, [open, payload]);

  if (!open) return null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiado(true);
      toast.success('Código Pix copiado!');
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      toast.error('Não foi possível copiar automaticamente. Selecione o código manualmente.');
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 380, width: '100%', padding: 24, position: 'relative' }}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          <X size={20} />
        </button>

        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Pagar mensalidade via Pix</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Valor: <b>{formatBRL(valor)}</b>
        </p>

        {!chaveConfigurada || valor <= 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
            {!chaveConfigurada
              ? 'A geração de Pix ainda não foi configurada. Fale com o suporte para receber os dados de pagamento.'
              : 'Não foi possível calcular o valor da mensalidade. Fale com o suporte.'}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div ref={qrRef} style={{ width: 200, height: 200, background: '#fff', borderRadius: 8, padding: 8 }} />
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Pix Copia e Cola:</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                readOnly
                value={payload}
                onFocus={e => e.target.select()}
                style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input, #1a1a1a)', color: 'inherit', minWidth: 0 }}
              />
              <button
                onClick={copiar}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: copiado ? '#22c55e' : '#6366f1', color: 'white', border: 'none', borderRadius: 6, padding: '0 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                {copiado ? <CheckCircle size={14} /> : <Copy size={14} />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Depois de pagar, o acesso é liberado manualmente após a confirmação do recebimento — pode levar algum tempo. Se precisar, entre em contato com o suporte.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

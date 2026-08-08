import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Loader2 } from 'lucide-react';

// Esta tela NUNCA escreve o status do plano — isso é responsabilidade
// exclusiva do webhook do Stripe (stripe-webhook), que só roda com
// confirmacao real e assinada do proprio Stripe. Aqui, so conferimos
// (leitura) se o webhook ja processou, com um pequeno polling, porque
// o webhook pode levar alguns segundos para chegar depois do redirect.
export default function PlanosSuccessPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tenantId = params.get('tenant');
  const [status, setStatus] = useState<'aguardando' | 'confirmado' | 'demorando'>('aguardando');

  useEffect(() => {
    if (!tenantId) return;
    let tentativas = 0;
    const maxTentativas = 10; // ~15s no total

    const verificar = async () => {
      const { data } = await supabase.from('tenants').select('status').eq('id', tenantId).maybeSingle();
      tentativas++;
      if (data?.status === 'ativo') {
        setStatus('confirmado');
        setTimeout(() => navigate('/dashboard'), 2000);
        return;
      }
      if (tentativas >= maxTentativas) {
        setStatus('demorando');
        return;
      }
      setTimeout(verificar, 1500);
    };

    verificar();
  }, [tenantId, navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 24px' }}>
        {status === 'aguardando' && (
          <>
            <Loader2 size={64} color="#6366f1" style={{ marginBottom: 24 }} className="spin" />
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
              Confirmando seu pagamento...
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>Isso costuma levar só alguns segundos.</p>
          </>
        )}
        {status === 'confirmado' && (
          <>
            <CheckCircle size={64} color="#22c55e" style={{ marginBottom: 24 }} />
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
              Pagamento confirmado! 🎉
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>Redirecionando para o dashboard...</p>
          </>
        )}
        {status === 'demorando' && (
          <>
            <Loader2 size={64} color="#f59e0b" style={{ marginBottom: 24 }} />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
              Ainda confirmando...
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
              Seu pagamento pode ter sido aprovado, mas a confirmação está demorando mais que o normal.
              Você já pode entrar no sistema — se o plano ainda não aparecer ativo em alguns minutos,
              entre em contato com o suporte.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-primary"
              style={{ padding: '10px 24px' }}
            >
              Ir para o Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
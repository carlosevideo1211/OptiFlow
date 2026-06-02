import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { Check, Zap, Star, Crown } from 'lucide-react';

const STRIPE_PK = "pk_test_51TQwAn0MJPFm576O3btqmhbvkUaKB0K29sQed43MayJTXVnbUaJyzs4DjgnEvPerCLZ4X3mNYbA8VwBgUVOoKItK00iVcG2EoM";

const planos = [
  {
    id: 'basico',
    nome: 'Básico',
    preco: 97,
    icon: Zap,
    color: '#6366f1',
    descricao: 'Ideal para óticas pequenas',
    price_id: 'price_basico',
    features: [
      'Até 2 usuários',
      'Clientes ilimitados',
      'Ordens de Serviço',
      'Vendas / PDV',
      'Crediário',
      'Suporte por email',
    ],
  },
  {
    id: 'pro',
    nome: 'Pro',
    preco: 147,
    icon: Star,
    color: '#f59e0b',
    descricao: 'Para óticas em crescimento',
    price_id: 'price_pro',
    popular: true,
    features: [
      'Até 5 usuários',
      'Tudo do Básico',
      'Relatórios avançados',
      'NF-e',
      'Controle de estoque',
      'Suporte prioritário',
    ],
  },
  {
    id: 'premium',
    nome: 'Premium',
    preco: 197,
    icon: Crown,
    color: '#a855f7',
    descricao: 'Para redes de óticas',
    price_id: 'price_premium',
    features: [
      'Usuários ilimitados',
      'Tudo do Pro',
      'Multi-filial',
      'API de integração',
      'Gerente de conta',
      'Suporte 24/7',
    ],
  },
];

export default function PlanosPage() {
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  const assinar = async (plano: typeof planos[0]) => {
    if (!tenantId) { toast.error('Faça login primeiro'); return; }
    setLoading(plano.id);
    try {
      // Carregar Stripe dinamicamente
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(STRIPE_PK);
      if (!stripe) throw new Error('Stripe não carregou');

      // Chamar Edge Function para criar sessão de checkout
      const { data: { session_url } } = await supabase.functions.invoke('create-checkout', {
        body: { price_id: plano.price_id, tenant_id: tenantId, plan: plano.id, email: user?.email },
      });

      if (session_url) {
        window.location.href = session_url;
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao iniciar pagamento');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
            Escolha seu plano
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>
            Sem fidelidade. Cancele quando quiser.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {planos.map((plano) => {
            const Icon = plano.icon;
            return (
              <div
                key={plano.id}
                className="card"
                style={{
                  padding: 28,
                  borderTop: `3px solid ${plano.color}`,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {plano.popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: plano.color, color: 'white', padding: '2px 16px',
                    borderRadius: 20, fontSize: 12, fontWeight: 700,
                  }}>
                    MAIS POPULAR
                  </div>
                )}
                <div style={{ color: plano.color, marginBottom: 12 }}>
                  <Icon size={24} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  {plano.nome}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                  {plano.descricao}
                </div>
                <div style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: plano.color }}>
                    R$ {plano.preco}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/mês</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
                  {plano.features.map((f, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 13, color: 'var(--text)' }}>
                      <Check size={14} color={plano.color} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className="btn btn-primary"
                  style={{ background: plano.color, borderColor: plano.color, width: '100%' }}
                  onClick={() => assinar(plano)}
                  disabled={loading === plano.id}
                >
                  {loading === plano.id ? 'Aguarde...' : 'Assinar agora'}
                </button>
              </div>
            );
          })}
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, color: 'var(--text-muted)', fontSize: 13 }}>
          🔒 Pagamento seguro via Stripe · Cancele quando quiser
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { Check, Zap, Star, Crown, Rocket, CreditCard, QrCode, X } from 'lucide-react';

const STRIPE_PK = "pk_test_51TQwAn0MJPFm576O3btqmhbvkUaKB0K29sQed43MayJTXVnbUaJyzs4DjgnEvPerCLZ4X3mNYbA8VwBgUVOoKItK00iVcG2EoM";
const PIX_KEY = "+55 92 99277-9106";
const WHATSAPP = "5592992779106";

const planos = [
  { id: 'basico', nome: 'Basico', preco: 97, icon: Zap, color: '#6366f1', descricao: 'Ideal para oticas pequenas', price_id: 'price_basico',
    features: ['Ate 2 usuarios','Clientes ilimitados','Ordens de Servico','Vendas / PDV','Crediario','Suporte por email'] },
  { id: 'pro', nome: 'Pro', preco: 147, icon: Star, color: '#f59e0b', descricao: 'Para oticas em crescimento', price_id: 'price_pro', popular: true,
    features: ['Ate 5 usuarios','Tudo do Basico','Relatorios avancados','NF-e','Controle de estoque','Suporte prioritario'] },
  { id: 'premium', nome: 'Premium', preco: 197, icon: Crown, color: '#a855f7', descricao: 'Para redes de oticas', price_id: 'price_premium',
    features: ['Usuarios ilimitados','Tudo do Pro','Multi-filial','API de integracao','Gerente de conta','Suporte 24/7'] },
  { id: 'lancamento', nome: 'Lancamento', preco: 109.90, icon: Rocket, color: '#22c55e', descricao: 'Oferta por tempo limitado', price_id: 'price_premium', tag: 'MELHOR OFERTA',
    features: ['Tudo do Premium incluso','Usuarios ilimitados','Suporte 24/7','Preco garantido por 12 meses','Apos 1 ano: R$ 197/mes','Cancele quando quiser'] },
];

export default function PlanosPage() {
  const { user, tenantId } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [pixModal, setPixModal] = useState<{ plano: typeof planos[0] } | null>(null);

  const assinarCartao = async (plano: typeof planos[0]) => {
    if (!tenantId) { toast.error('Faca login primeiro'); return; }
    setLoading(plano.id + '_cartao');
    try {
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(STRIPE_PK);
      if (!stripe) throw new Error('Stripe nao carregou');
      const { data } = await supabase.functions.invoke('create-checkout', {
        body: { price_id: plano.price_id, tenant_id: tenantId, plan: plano.id, email: user?.email },
      });
      if (data?.session_url) window.location.href = data.session_url;
    } catch (e: any) {
      toast.error(e.message || 'Erro ao iniciar pagamento');
    } finally { setLoading(null); }
  };

  const enviarComprovante = (plano: typeof planos[0]) => {
    const valor = plano.preco.toFixed(2).replace('.', ',');
    const msg = encodeURIComponent(`Ola! Realizei o pagamento via Pix do plano ${plano.nome} (R$ ${valor}/mes) do OptiFlow. Segue o comprovante.`);
    window.open(`https://wa.me/${WHATSAPP}?text=${msg}`, '_blank');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Escolha seu plano</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>Sem fidelidade. Cancele quando quiser.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
          {planos.map((plano) => {
            const Icon = plano.icon;
            return (
              <div key={plano.id} className="card" style={{ padding: 28, borderTop: `3px solid ${plano.color}`, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {(plano as any).popular && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plano.color, color: 'white', padding: '2px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>MAIS POPULAR</div>
                )}
                {(plano as any).tag && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plano.color, color: 'white', padding: '2px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>MELHOR OFERTA</div>
                )}
                <div style={{ color: plano.color, marginBottom: 12 }}><Icon size={24} /></div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{plano.nome}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{plano.descricao}</div>
                <div style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, color: plano.color }}>R$ {plano.preco.toFixed(2).replace('.', ',')}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/mes</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
                  {plano.features.map((f, i) => (
                    <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontSize: 13, color: 'var(--text)' }}>
                      <Check size={14} color={plano.color} style={{ marginTop: 2, flexShrink: 0 }} />{f}
                    </li>
                  ))}
                </ul>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn btn-primary" style={{ background: plano.color, borderColor: plano.color, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => assinarCartao(plano)} disabled={loading === plano.id + '_cartao'}>
                    <CreditCard size={14} />{loading === plano.id + '_cartao' ? 'Aguarde...' : 'Cartao'}
                  </button>
                  <button className="btn btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: plano.color, color: plano.color }}
                    onClick={() => setPixModal({ plano })}>
                    <QrCode size={14} />Pix
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ textAlign: 'center', marginTop: 24, color: 'var(--text-muted)', fontSize: 13 }}>Pagamento seguro · Cancele quando quiser</p>
      </div>

      {pixModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ padding: 32, maxWidth: 420, width: '100%', position: 'relative', textAlign: 'center' }}>
            <button onClick={() => setPixModal(null)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            <QrCode size={48} color="#22c55e" style={{ marginBottom: 16 }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Pagar com Pix</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Plano {pixModal.plano.nome} — R$ {pixModal.plano.preco.toFixed(2).replace('.', ',')}/mes</p>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Chave Pix</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-all' }}>{PIX_KEY}</div>
              <button onClick={() => { navigator.clipboard.writeText(PIX_KEY); toast.success('Chave copiada!'); }}
                style={{ marginTop: 8, fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Copiar chave</button>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13, color: '#15803d' }}>
              Apos o pagamento, clique abaixo para enviar o comprovante via WhatsApp. Seu acesso sera ativado em ate 1 hora.
            </div>
            <button className="btn btn-primary" style={{ width: '100%', background: '#25d366', borderColor: '#25d366', fontSize: 14 }}
              onClick={() => enviarComprovante(pixModal.plano)}>
              Enviar comprovante via WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

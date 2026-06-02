import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { CheckCircle } from 'lucide-react';

export default function PlanosSuccessPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tenantId = params.get('tenant');
  const plan = params.get('plan');

  useEffect(() => {
    if (!tenantId || !plan) return;
    // Atualizar status do tenant para ativo
    supabase.from('tenants').update({ status: 'ativo', plan }).eq('id', tenantId).then(() => {
      toast.success('Assinatura ativada! Bem-vindo ao OptiFlow! 🎉');
      setTimeout(() => navigate('/dashboard'), 3000);
    });
  }, [tenantId, plan]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <CheckCircle size={64} color="#22c55e" style={{ marginBottom: 24 }} />
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
          Pagamento confirmado! 🎉
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>Redirecionando para o dashboard...</p>
      </div>
    </div>
  );
}

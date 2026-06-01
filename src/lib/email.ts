// Servico de email via Resend

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  try {
    // Usar Edge Function do Supabase para evitar CORS
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ to, subject, html }),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (err) {
    console.error('Erro ao enviar email:', err);
    return { ok: false, data: null };
  }
}

export function emailBoasVindas(nomeOtica: string, nomeUsuario: string, email: string) {
  return {
    to: email,
    subject: `Bem-vindo ao OptiFlow, ${nomeOtica}! 🎉`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;margin-top:40px">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1,#06b6d4);padding:40px 32px;text-align:center">
      <h1 style="color:white;margin:0;font-size:28px;font-weight:800">👁️ OptiFlow</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px">Sistema de Gestão para Óticas</p>
    </div>
    <!-- Conteudo -->
    <div style="padding:40px 32px">
      <h2 style="color:#1e293b;margin:0 0 16px;font-size:22px">Olá, ${nomeUsuario}! 👋</h2>
      <p style="color:#475569;line-height:1.6;margin:0 0 20px">
        Sua conta da <strong>${nomeOtica}</strong> foi criada com sucesso no OptiFlow!
        Você tem <strong>14 dias de acesso completo e gratuito</strong> para testar tudo.
      </p>
      <!-- Box trial -->
      <div style="background:#f0f9ff;border:2px solid #06b6d4;border-radius:8px;padding:20px;margin:24px 0;text-align:center">
        <div style="font-size:32px;margin-bottom:8px">🎁</div>
        <div style="font-size:18px;font-weight:700;color:#0891b2">14 dias grátis</div>
        <div style="color:#475569;font-size:13px;margin-top:4px">Sem cartão de crédito necessário</div>
      </div>
      <!-- O que pode fazer -->
      <h3 style="color:#1e293b;font-size:16px;margin:24px 0 12px">O que você pode fazer no OptiFlow:</h3>
      <table style="width:100%;border-collapse:collapse">
        ${[
          ['👥','Clientes','Cadastro completo com histórico'],
          ['🔬','Consulta / Rx','Receituário óptico digital'],
          ['📋','Ordem de Serviço','Controle de laboratório'],
          ['🛒','Vendas / PDV','6 formas de pagamento'],
          ['💳','Crediário','Parcelamento com juros automáticos'],
          ['📦','Estoque','Controle de entrada e saída'],
          ['💰','Financeiro','Fluxo de caixa completo'],
          ['📊','Relatórios','Dados em tempo real'],
        ].map(([icon, title, desc]) => `
        <tr>
          <td style="padding:8px 0;vertical-align:top;width:32px;font-size:18px">${icon}</td>
          <td style="padding:8px 12px;vertical-align:top">
            <strong style="color:#1e293b">${title}</strong>
            <span style="color:#64748b;font-size:13px"> — ${desc}</span>
          </td>
        </tr>`).join('')}
      </table>
      <!-- CTA -->
      <div style="text-align:center;margin:32px 0">
        <a href="http://localhost:5173/dashboard" 
           style="background:linear-gradient(135deg,#6366f1,#06b6d4);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
          Acessar o OptiFlow →
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0">
        Dúvidas? Responda este email que te ajudamos.
      </p>
    </div>
    <!-- Footer -->
    <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0">
      <p style="color:#94a3b8;font-size:12px;margin:0">
        © 2026 OptiFlow · Sistema de Gestão para Óticas<br>
        Você está recebendo este email porque criou uma conta no OptiFlow.
      </p>
    </div>
  </div>
</body>
</html>
    `
  };
}

export function emailTrialExpirando(nomeOtica: string, email: string, diasRestantes: number) {
  const urgente = diasRestantes <= 1;
  return {
    to: email,
    subject: urgente 
      ? `⚠️ Seu trial do OptiFlow expira HOJE, ${nomeOtica}!`
      : `⏰ Seu trial do OptiFlow expira em ${diasRestantes} dias`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;margin-top:40px">
    <div style="background:${urgente ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'linear-gradient(135deg,#f59e0b,#ef4444)'};padding:40px 32px;text-align:center">
      <h1 style="color:white;margin:0;font-size:28px;font-weight:800">${urgente ? '⚠️' : '⏰'} OptiFlow</h1>
      <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:16px;font-weight:600">
        ${urgente ? 'Seu trial expira hoje!' : `${diasRestantes} dias restantes no trial`}
      </p>
    </div>
    <div style="padding:40px 32px">
      <p style="color:#475569;line-height:1.6;margin:0 0 20px;font-size:15px">
        Olá, <strong>${nomeOtica}</strong>! Seu período de trial do OptiFlow 
        ${urgente ? 'expira <strong>hoje</strong>' : `expira em <strong>${diasRestantes} dias</strong>`}.
        Para continuar usando o sistema sem interrupções, assine um plano.
      </p>
      <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;padding:20px;margin:24px 0;text-align:center">
        <div style="font-size:32px;margin-bottom:8px">💎</div>
        <div style="font-size:18px;font-weight:700;color:#92400e">Plano Profissional</div>
        <div style="font-size:28px;font-weight:800;color:#1e293b;margin:8px 0">R$ 97<span style="font-size:14px;font-weight:400">/mês</span></div>
        <div style="color:#475569;font-size:13px">Acesso completo sem limites</div>
      </div>
      <div style="text-align:center;margin:32px 0">
        <a href="http://localhost:5173/dashboard" 
           style="background:linear-gradient(135deg,#6366f1,#06b6d4);color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
          Assinar agora →
        </a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0">
      <p style="color:#94a3b8;font-size:12px;margin:0">© 2026 OptiFlow · Sistema de Gestão para Óticas</p>
    </div>
  </div>
</body>
</html>
    `
  };
}

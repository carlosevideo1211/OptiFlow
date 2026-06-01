import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = "re_HY17oTgE_6dvnjjnfGqDwCLGwPQ2kLZhW";
const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async () => {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const em3dias = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];

    // Buscar tenants com trial_end_date nos proximos 3 dias (qualquer status)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?trial_end_date=gte.${hoje}&trial_end_date=lte.${em3dias}&select=id,company_name,email,trial_end_date,status`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    const tenants = await res.json();
    console.log("Tenants encontrados:", JSON.stringify(tenants));
    let enviados = 0;

    for (const tenant of tenants) {
      const diasRestantes = Math.ceil(
        (new Date(tenant.trial_end_date).getTime() - Date.now()) / 86400000
      );

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "onboarding@resend.dev",
          to: ["carlosevideo28@gmail.com"],
          subject: `⚠️ Seu trial do OptiFlow expira em ${diasRestantes} dia(s)!`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px">
              <div style="text-align:center;margin-bottom:24px">
                <h1 style="color:#6366f1;margin:0">OptiFlow</h1>
                <p style="color:#64748b;margin:4px 0 0">Sistema de Gestão para Óticas</p>
              </div>
              <div style="background:white;border-radius:8px;padding:24px;border:1px solid #e2e8f0">
                <h2 style="color:#f59e0b;margin:0 0 16px">⚠️ Seu período de teste está acabando!</h2>
                <p style="color:#374151">Olá, <strong>${tenant.company_name}</strong>!</p>
                <p style="color:#374151">Seu trial gratuito do OptiFlow expira em <strong style="color:#ef4444">${diasRestantes} dia(s)</strong> (${new Date(tenant.trial_end_date + "T00:00:00").toLocaleDateString("pt-BR")}).</p>
                <p style="color:#374151">Para continuar usando sem interrupções, escolha um plano:</p>
                <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0">
                  <p style="margin:4px 0;color:#374151">✅ <strong>Plano Básico</strong> — R$ 97/mês</p>
                  <p style="margin:4px 0;color:#374151">✅ <strong>Plano Pro</strong> — R$ 147/mês</p>
                  <p style="margin:4px 0;color:#374151">✅ <strong>Plano Premium</strong> — R$ 197/mês</p>
                </div>
                <div style="text-align:center;margin-top:24px">
                  <a href="https://optiflow.com.br/planos" style="background:#6366f1;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
                    Assinar agora
                  </a>
                </div>
              </div>
            </div>
          `,
        }),
      });

      if (emailRes.ok) enviados++;
    }

    return new Response(
      JSON.stringify({ ok: true, tenants_verificados: tenants.length, emails_enviados: enviados, debug_hoje: hoje, debug_em3dias: em3dias }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

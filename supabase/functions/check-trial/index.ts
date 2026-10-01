import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

serve(async (req) => {
  // Esta funcao so pode ser chamada pelo nosso proprio agendamento (cron),
  // nunca pelo navegador de um usuario. Por isso a checagem e por um
  // segredo compartilhado (x-cron-secret), nao por login de usuario.
  const secret = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Nao autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY nao configurada" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Achado 1 da auditoria (encontrado numa varredura final): este servidor
    // roda em UTC, entao "hoje" direto adianta a data a partir de ~20h no
    // horario de Manaus (UTC-4, sem horario de verao desde 2019) — fazendo
    // esta busca por trials vencendo usar a data errada nesse intervalo.
    // Mesmo ajuste ja usado em send-whatsapp-triggers/index.ts.
    const MANAUS_OFFSET_MS = 4 * 60 * 60 * 1000;
    const hoje = new Date(Date.now() - MANAUS_OFFSET_MS).toISOString().split("T")[0];
    const em3dias = new Date(Date.now() + 3 * 86400000 - MANAUS_OFFSET_MS).toISOString().split("T")[0];

    // Alerta para o DONO DO SISTEMA (Carlos), nao para a loja: lista as lojas
    // REALMENTE em teste (status e plan = 'trial') cujo teste vence em ate 3
    // dias, para ele ligar antes do bloqueio. Um e-mail so por dia, e so
    // quando ha loja na lista. (O remetente onboarding@resend.dev so entrega
    // para o dono da conta Resend; avisar a propria loja exige dominio proprio.)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?status=eq.trial&plan=eq.trial&excluido_em=is.null&trial_end_date=gte.${hoje}&trial_end_date=lte.${em3dias}&select=id,company_name,email,phone,trial_end_date&order=trial_end_date`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    const tenants = await res.json();
    if (!Array.isArray(tenants)) {
      return new Response(JSON.stringify({ error: "Falha ao consultar tenants", detalhe: tenants }), { status: 500 });
    }
    let enviados = 0;

    if (tenants.length > 0) {
      const esc = (t: unknown) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
      const linhas = tenants.map((t: any) => {
        const dias = Math.round((new Date(t.trial_end_date + "T00:00:00Z").getTime() - new Date(hoje + "T00:00:00Z").getTime()) / 86400000);
        const quando = dias <= 0 ? "vence HOJE" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`;
        return `<tr>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${esc(t.company_name)}</strong><br><span style="color:#64748b;font-size:13px">${esc(t.email)}${t.phone ? " · " + esc(t.phone) : ""}</span></td>
          <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#ef4444;white-space:nowrap">${quando}<br><span style="color:#64748b;font-size:13px">${new Date(t.trial_end_date + "T00:00:00").toLocaleDateString("pt-BR")}</span></td>
        </tr>`;
      }).join("");

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "onboarding@resend.dev",
          to: ["carlosevideo28@gmail.com"],
          subject: `OptiFlow: ${tenants.length} loja(s) com teste grátis acabando`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px">
              <h1 style="color:#6366f1;margin:0 0 4px">OptiFlow</h1>
              <p style="color:#64748b;margin:0 0 20px">Lojas em teste grátis que vencem nos próximos 3 dias</p>
              <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0">
                <table style="width:100%;border-collapse:collapse;color:#374151">${linhas}</table>
                <p style="color:#374151;margin:16px 0 0">Vale ligar para o cliente antes do bloqueio. Planos: Ótica e Consultório (R$ 99,99/mês) e Consultório (R$ 49,99/mês).</p>
                <div style="text-align:center;margin-top:20px">
                  <a href="https://app.visionproerp.com.br/admin" style="background:#6366f1;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
                    Abrir o Painel Admin
                  </a>
                </div>
              </div>
            </div>
          `,
        }),
      });
      if (emailRes.ok) enviados = 1;
      else console.error("Resend falhou:", emailRes.status, await emailRes.text());
    }

    return new Response(
      JSON.stringify({ ok: true, lojas_em_teste_vencendo: tenants.length, emails_enviados: enviados, debug_hoje: hoje, debug_em3dias: em3dias }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
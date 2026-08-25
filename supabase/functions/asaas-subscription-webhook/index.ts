import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Recebe os eventos da Asaas sobre a assinatura (Pix Automatico) da PROPRIA
// OptiFlow com o inquilino - autorizacao ativada/cancelada e cada cobranca
// recorrente gerada automaticamente pela Asaas (paymentCreationMode: SUBSCRIPTION
// em create-asaas-subscription). So atualiza a tabela tenants/asaas_subscriptions;
// nao mexe em nada do create-boleto (que e outra integracao, do inquilino com
// OS CLIENTES DELE).

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Token escolhido por nos ao cadastrar o webhook no painel da Asaas; a Asaas
// devolve esse mesmo valor no header "asaas-access-token" em toda chamada.
const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "";

async function supabaseFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (res.status === 204) return null;
  return res.json();
}

async function tenantDaAutorizacao(authorizationId: string): Promise<string | null> {
  const subs = await supabaseFetch(
    `asaas_subscriptions?asaas_authorization_id=eq.${authorizationId}&select=tenant_id,value`
  );
  return Array.isArray(subs) && subs[0] ? subs[0].tenant_id : null;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const tokenRecebido = req.headers.get("asaas-access-token") || "";
  if (!ASAAS_WEBHOOK_TOKEN || tokenRecebido !== ASAAS_WEBHOOK_TOKEN) {
    return new Response(JSON.stringify({ error: "token invalido" }), { status: 401 });
  }

  let event: any;
  try {
    event = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "payload invalido" }), { status: 400 });
  }

  try {
    // Idempotencia: a Asaas pode reenviar o mesmo evento se demorarmos a
    // responder. Se ja processamos este id de evento, ignora.
    const eventId: string | undefined = event.id;
    if (eventId) {
      const jaExiste = await supabaseFetch(`asaas_webhook_events?asaas_event_id=eq.${eventId}&select=id`);
      if (Array.isArray(jaExiste) && jaExiste.length > 0) {
        return new Response(JSON.stringify({ ok: true, ignorado: "evento duplicado" }), { status: 200 });
      }
      await supabaseFetch(`asaas_webhook_events`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ asaas_event_id: eventId, event_type: event.event || "desconhecido", payload: event }),
      });
    }

    const tipo: string = event.event || "";
    const authorizationId: string | null =
      event.pixAutomaticAuthorization || event.authorization?.id || event.payment?.pixAutomaticAuthorizationId || null;

    if (tipo === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED") {
      if (authorizationId) {
        await supabaseFetch(`asaas_subscriptions?asaas_authorization_id=eq.${authorizationId}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "ACTIVE", updated_at: new Date().toISOString() }),
        });
        const tenantId = await tenantDaAutorizacao(authorizationId);
        if (tenantId) {
          const nb = new Date(); nb.setDate(nb.getDate() + 30);
          await supabaseFetch(`tenants?id=eq.${tenantId}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              status: "ativo",
              plan: "assinatura_pix_automatico",
              mrr_value: 99.99,
              next_billing: nb.toISOString().split("T")[0],
            }),
          });
        }
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (
      tipo === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED" ||
      tipo === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED" ||
      tipo === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED"
    ) {
      if (authorizationId) {
        const novoStatus = tipo.endsWith("CANCELLED") ? "CANCELLED" : tipo.endsWith("EXPIRED") ? "EXPIRED" : "REFUSED";
        await supabaseFetch(`asaas_subscriptions?asaas_authorization_id=eq.${authorizationId}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: novoStatus, updated_at: new Date().toISOString() }),
        });
        const tenantId = await tenantDaAutorizacao(authorizationId);
        if (tenantId) {
          await supabaseFetch(`tenants?id=eq.${tenantId}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "cancelado" }),
          });
        }
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // Cada cobranca recorrente que a propria Asaas gera automaticamente
    // (paymentCreationMode: SUBSCRIPTION) dispara os mesmos eventos de
    // pagamento normais, com pixAutomaticAuthorizationId apontando pra
    // autorizacao. NOTE: confirmar em sandbox se PAYMENT_OVERDUE so dispara
    // depois de esgotadas as 3 tentativas (retryPolicy) ou a cada tentativa -
    // a documentacao publica nao deixa isso explicito.
    if (tipo === "PAYMENT_CONFIRMED" || tipo === "PAYMENT_RECEIVED") {
      const pixAuthId = event.payment?.pixAutomaticAuthorizationId || authorizationId;
      if (pixAuthId) {
        const tenantId = await tenantDaAutorizacao(pixAuthId);
        if (tenantId) {
          const nb = new Date(); nb.setDate(nb.getDate() + 30);
          await supabaseFetch(`tenants?id=eq.${tenantId}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "ativo", next_billing: nb.toISOString().split("T")[0] }),
          });
        }
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (tipo === "PAYMENT_OVERDUE" || tipo === "PAYMENT_REFUSED") {
      const pixAuthId = event.payment?.pixAutomaticAuthorizationId || authorizationId;
      if (pixAuthId) {
        const tenantId = await tenantDaAutorizacao(pixAuthId);
        if (tenantId) {
          await supabaseFetch(`tenants?id=eq.${tenantId}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "inadimplente" }),
          });
        }
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true, ignorado: tipo }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), { status: 500 });
  }
});

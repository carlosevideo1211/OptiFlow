import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

async function verificarAssinaturaStripe(payload: string, header: string, secret: string): Promise<boolean> {
  const partes = header.split(",").reduce((acc: Record<string, string>, item) => {
    const [k, v] = item.split("=");
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = partes["t"];
  const assinaturaRecebida = partes["v1"];
  if (!timestamp || !assinaturaRecebida) return false;

  const payloadAssinado = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinaturaBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadAssinado));
  const assinaturaCalculada = Array.from(new Uint8Array(assinaturaBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const idadeSegundos = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (idadeSegundos > 300) return false;

  return assinaturaCalculada === assinaturaRecebida;
}

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
  return res.json();
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const payload = await req.text();
  const assinatura = req.headers.get("stripe-signature") || "";

  if (!STRIPE_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "STRIPE_WEBHOOK_SECRET nao configurada" }), { status: 500 });
  }

  const valido = await verificarAssinaturaStripe(payload, assinatura, STRIPE_WEBHOOK_SECRET);
  if (!valido) {
    return new Response(JSON.stringify({ error: "assinatura invalida" }), { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response(JSON.stringify({ error: "payload invalido" }), { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const tenantId = session.metadata?.tenant_id;
      const plan = session.metadata?.plan;

      if (!tenantId) {
        return new Response(JSON.stringify({ ok: true, ignorado: "sem tenant_id no metadata" }), { status: 200 });
      }

      await supabaseFetch(`tenants?id=eq.${tenantId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "ativo",
          plan: plan || undefined,
          stripe_customer_id: session.customer || undefined,
          stripe_subscription_id: session.subscription || undefined,
        }),
      });

      return new Response(JSON.stringify({ ok: true, tenant_ativado: tenantId }), { status: 200 });
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      await supabaseFetch(`tenants?stripe_subscription_id=eq.${sub.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "cancelado" }),
      });
      return new Response(JSON.stringify({ ok: true, evento: "subscription_cancelada" }), { status: 200 });
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      if (invoice.subscription) {
        await supabaseFetch(`tenants?stripe_subscription_id=eq.${invoice.subscription}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "inadimplente" }),
        });
      }
      return new Response(JSON.stringify({ ok: true, evento: "pagamento_falhou" }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true, ignorado: event.type }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
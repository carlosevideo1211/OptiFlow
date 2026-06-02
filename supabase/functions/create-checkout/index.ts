import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const STRIPE_SK = Deno.env.get("STRIPE_SECRET_KEY") || "";

const PRICE_MAP: Record<string, number> = {
  price_basico: 9700,
  price_pro: 14700,
  price_premium: 19700,
};

const PLAN_NAMES: Record<string, string> = {
  price_basico: "OptiFlow Básico",
  price_pro: "OptiFlow Pro",
  price_premium: "OptiFlow Premium",
};

serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { price_id, tenant_id, plan, email } = await req.json();
    const amount = PRICE_MAP[price_id] || 9700;
    const planName = PLAN_NAMES[price_id] || "OptiFlow";

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SK}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "payment_method_types[]": "card",
        "mode": "subscription",
        "line_items[0][price_data][currency]": "brl",
        "line_items[0][price_data][product_data][name]": planName,
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][price_data][unit_amount]": String(amount),
        "line_items[0][quantity]": "1",
        "success_url": `http://localhost:5173/planos/sucesso?tenant=${tenant_id}&plan=${plan}`,
        "cancel_url": `http://localhost:5173/planos`,
        "customer_email": email || "",
        "metadata[tenant_id]": tenant_id,
        "metadata[plan]": plan,
      }).toString(),
    });

    const session = await res.json();
    if (!session.url) throw new Error(session.error?.message || "Erro ao criar checkout");

    return new Response(JSON.stringify({ session_url: session.url }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

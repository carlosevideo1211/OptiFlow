// Cobranca nova - acordo automatico (11/11/2026): manda a OFERTA do Feirao (modelo oferta_acordo_feirao da Meta)
// para um cliente e abre o acordo em cobranca_acordos. As respostas (botoes) sao tratadas no whatsapp-webhook.
// So com o x-cron-secret. Uso:
//   POST ?acao=simular&tenant=<id>&customer=<id>  -> mostra a oferta calculada, sem mandar nada
//   POST ?acao=ofertar&tenant=<id>&customer=<id>  -> manda a oferta (1 cliente) e registra o acordo "ofertado"
// O envio em massa do Feirao (02/12) vai usar esta mesma funcao, aos poucos, com o ok do Carlos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const META_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") || "";
const META_V = Deno.env.get("META_GRAPH_VERSION") || "v21.0";
const VALIDADE = "2026-12-31"; // fim do Feirao de Natal
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function db(path: string, init?: RequestInit) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const fmt = (v: number) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Nao autorizado" }, 401);
  const u = new URL(req.url);
  const acao = u.searchParams.get("acao") || "simular";
  const tenant = u.searchParams.get("tenant") || "";
  const customer = u.searchParams.get("customer") || "";
  if (!tenant || !customer) return json({ error: "informe tenant e customer" }, 400);
  try {
    const [t] = await db(`tenants?id=eq.${tenant}&select=company_name,cobranca_nova&limit=1`);
    if (!t?.cobranca_nova) return json({ error: "cobranca nova desligada nesta loja" }, 400);
    const [ss] = await db(`store_settings?tenant_id=eq.${tenant}&select=wa_phone_id,name&limit=1`);
    const [c] = await db(`customers?id=eq.${customer}&tenant_id=eq.${tenant}&select=id,name,phone,whatsapp,whatsapp_opt_out&limit=1`);
    if (!c) return json({ error: "cliente nao encontrado nesta loja" }, 404);
    const o = await db("rpc/cobranca_oferta", { method: "POST", body: JSON.stringify({ p_tenant: tenant, p_customer: customer }) });
    const original = Number(o.original), atualizado = Math.round((original + Number(o.juros)) * 100) / 100;
    const nE = Math.max(1, Math.min(4, Math.floor(original / 100)));
    const nome = String(c.name || "").split(" ")[0];
    const loja = ss?.name || t.company_name || "loja";
    // Nome do feirao (Carlos, 11/11): vai junto do nome da loja, porque o texto do modelo aprovado e fixo.
    const params = [nome, `${loja}, no Feirão Limpa Nome`, "31/12", fmt(atualizado), fmt(Number(o.vista)), String(nE)];
    const resumo = { cliente: c.name, parcelas_vencidas: o.qtd, original, juros: o.juros, atualizado, vista: o.vista, ate_parcelas: nE, params };
    if (acao === "simular") return json({ simular: true, ...resumo });

    if (acao !== "ofertar") return json({ error: "acao invalida" }, 400);
    if (!o.qtd) return json({ error: "cliente sem parcelas vencidas", ...resumo }, 400);
    if (c.whatsapp_opt_out) return json({ error: "cliente pediu para nao receber mensagens (PARAR)" }, 400);
    const fone = String(c.whatsapp || c.phone || "").replace(/\D/g, "");
    if (fone.length < 10 || !ss?.wa_phone_id) return json({ error: "cliente sem telefone ou loja sem WhatsApp oficial" }, 400);
    const para = fone.startsWith("55") ? fone : `55${fone}`;
    const aberto = await db(`cobranca_acordos?tenant_id=eq.${tenant}&customer_id=eq.${customer}&status=in.(ofertado,escolhendo,aguardando_pagamento)&select=id&limit=1`);
    if (aberto?.length) return json({ error: "cliente ja tem acordo em aberto", acordo: aberto[0].id }, 400);

    const r = await fetch(`https://graph.facebook.com/${META_V}/${ss.wa_phone_id}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "template", template: {
        name: "oferta_acordo_feirao", language: { code: "pt_BR" },
        components: [{ type: "body", parameters: params.map((x) => ({ type: "text", text: x })) }] } }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, erro: d?.error?.message || r.status, ...resumo }, 502);
    const [ac] = await db("cobranca_acordos", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
      tenant_id: tenant, customer_id: customer, phone: para, status: "ofertado", validade: VALIDADE,
      parcelas_originais: o.ids, valor_original: original, valor_juros: o.juros, valor_vista: o.vista }) });
    const texto = `[oferta do Feirão] Olá ${params[0]}, aqui é da ${params[1]}. Até ${params[2]} você pode quitar seu débito de R$ ${params[3]} por R$ ${params[4]} à vista no Pix, ou parcelar em até ${params[5]}x.`;
    await db("whatsapp_mensagens", { method: "POST", body: JSON.stringify({ tenant_id: tenant, phone: para, direcao: "out", tipo: "template",
      texto, enviado_por: "robo", meta_message_id: d?.messages?.[0]?.id || null, status: "sent" }) });
    return json({ ok: true, acordo: ac?.id, ...resumo });
  } catch (e) {
    return json({ ok: false, erro: String(e) }, 500);
  }
});

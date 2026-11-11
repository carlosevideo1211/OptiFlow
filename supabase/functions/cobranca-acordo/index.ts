// Cobranca nova - acordo automatico do Feirao Limpa Nome (11/11/2026): manda a OFERTA (modelo oferta_acordo_feirao
// da Meta) e abre o acordo em cobranca_acordos. As respostas (botoes) sao tratadas no whatsapp-webhook.
// So com o x-cron-secret. Uso:
//   POST ?acao=simular&tenant=<id>&customer=<id>  -> oferta calculada de 1 cliente, sem mandar
//   POST ?acao=ofertar&tenant=<id>&customer=<id>  -> manda a oferta para 1 cliente
//   POST ?acao=lote[&tenant=<id>][&simular=1]     -> envio do dia (pg_cron): para cada loja com tenants.feirao_envio
//        'enviar' manda ate tenants.feirao_por_dia ofertas na ordem aprovada (cobranca_feirao_candidatos);
//        'espelho' (ou simular=1) so devolve a lista, sem mandar. So de segunda a sabado, 8h-20h de Manaus.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const META_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") || "";
const META_V = Deno.env.get("META_GRAPH_VERSION") || "v21.0";
const VALIDADE = "2026-12-31"; // fim do Feirao
const FEIRAO = "Feirão Limpa Nome";
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function db(path: string, init?: RequestInit) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const fmt = (v: number) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "Content-Type": "application/json" } });

// Calcula e (se enviar=true) manda a oferta para 1 cliente. Devolve o resumo ou { erro }.
async function ofertar(tenant: string, customer: string, enviar: boolean): Promise<Record<string, unknown>> {
  const [t] = await db(`tenants?id=eq.${tenant}&select=company_name,cobranca_nova&limit=1`);
  if (!t?.cobranca_nova) return { erro: "cobranca nova desligada nesta loja" };
  const [ss] = await db(`store_settings?tenant_id=eq.${tenant}&select=wa_phone_id,name&limit=1`);
  const [c] = await db(`customers?id=eq.${customer}&tenant_id=eq.${tenant}&select=id,name,phone,whatsapp,whatsapp_opt_out&limit=1`);
  if (!c) return { erro: "cliente nao encontrado nesta loja" };
  const o = await db("rpc/cobranca_oferta", { method: "POST", body: JSON.stringify({ p_tenant: tenant, p_customer: customer }) });
  const original = Number(o.original), atualizado = Math.round((original + Number(o.juros)) * 100) / 100;
  const nE = Math.max(1, Math.min(4, Math.floor(original / 100)));
  const nome = String(c.name || "").trim().split(/\s+/)[0] || "cliente";
  const loja = ss?.name || t.company_name || "loja";
  // Nome do feirao vai junto do nome da loja: o texto do modelo aprovado e fixo.
  const params = [nome, `${loja}, no ${FEIRAO}`, "31/12", fmt(atualizado), fmt(Number(o.vista)), String(nE)];
  const resumo = { cliente: c.name, parcelas_vencidas: o.qtd, original, juros: o.juros, atualizado, vista: o.vista, ate_parcelas: nE };
  if (!enviar) return { simular: true, ...resumo, params };
  if (!o.qtd) return { erro: "cliente sem parcelas vencidas", ...resumo };
  if (c.whatsapp_opt_out) return { erro: "cliente pediu PARAR" };
  const fone = String(c.whatsapp || c.phone || "").replace(/\D/g, "");
  if (fone.length < 10 || !ss?.wa_phone_id) return { erro: "cliente sem telefone ou loja sem WhatsApp oficial" };
  const para = fone.startsWith("55") ? fone : `55${fone}`;
  const aberto = await db(`cobranca_acordos?tenant_id=eq.${tenant}&customer_id=eq.${customer}&status=in.(ofertado,escolhendo,aguardando_pagamento)&select=id&limit=1`);
  if (aberto?.length) return { erro: "cliente ja tem acordo em aberto" };

  const r = await fetch(`https://graph.facebook.com/${META_V}/${ss.wa_phone_id}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "template", template: {
      name: "oferta_acordo_feirao", language: { code: "pt_BR" },
      components: [{ type: "body", parameters: params.map((x) => ({ type: "text", text: x })) }] } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { erro: `Meta: ${d?.error?.message || r.status}`, ...resumo };
  const [ac] = await db("cobranca_acordos", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
    tenant_id: tenant, customer_id: customer, phone: para, status: "ofertado", validade: VALIDADE,
    parcelas_originais: o.ids, valor_original: original, valor_juros: o.juros, valor_vista: o.vista }) });
  const texto = `[oferta do ${FEIRAO}] Olá ${params[0]}, aqui é da ${params[1]}. Até ${params[2]} você pode quitar seu débito de R$ ${params[3]} por R$ ${params[4]} à vista no Pix, ou parcelar em até ${params[5]}x.`;
  await db("whatsapp_mensagens", { method: "POST", body: JSON.stringify({ tenant_id: tenant, phone: para, direcao: "out", tipo: "template",
    texto, enviado_por: "robo", meta_message_id: d?.messages?.[0]?.id || null, status: "sent" }) });
  // Conta como a mensagem do dia desse cliente (o robo de cobranca nao manda outra no mesmo dia).
  await db("whatsapp_triggers_log?on_conflict=tenant_id,trigger_type,reference_id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ tenant_id: tenant, trigger_type: "oferta_feirao", reference_id: ac?.id, customer_id: customer,
      phone: para, success: true, sent_at: new Date().toISOString() }) });
  return { ok: true, acordo: ac?.id, ...resumo };
}

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Nao autorizado" }, 401);
  const u = new URL(req.url);
  const acao = u.searchParams.get("acao") || "simular";
  const tenant = u.searchParams.get("tenant") || "";
  try {
    if (acao === "lote") {
      const agora = new Date(Date.now() - 4 * 3600e3); // Manaus
      const hora = agora.getUTCHours(), domingo = agora.getUTCDay() === 0;
      const simular = u.searchParams.get("simular") === "1";
      if (!simular && (domingo || hora < 8 || hora >= 20)) return json({ ok: true, fora_do_horario: true, hora_manaus: hora });
      const lojas = await db(`tenants?select=id,company_name,feirao_envio,feirao_por_dia&cobranca_nova=eq.true${tenant ? `&id=eq.${tenant}` : "&feirao_envio=neq.off"}`);
      const saida: unknown[] = [];
      for (const l of lojas || []) {
        const modo = simular ? "espelho" : l.feirao_envio;
        if (modo === "off") continue;
        // Ja mandou hoje? (o lote pode rodar mais de uma vez no dia)
        const inicio = new Date(agora.toISOString().slice(0, 10) + "T04:00:00Z").toISOString();
        const hoje = await db(`cobranca_acordos?tenant_id=eq.${l.id}&ofertado_em=gte.${inicio}&select=id`);
        const faltam = Math.max(0, Number(l.feirao_por_dia || 20) - (modo === "enviar" ? (hoje?.length || 0) : 0));
        const cand = faltam ? await db("rpc/cobranca_feirao_candidatos", { method: "POST", body: JSON.stringify({ p_tenant: l.id, p_limite: faltam }) }) : [];
        const resultados: unknown[] = [];
        for (const c of cand || []) {
          if (modo === "enviar") {
            const r = await ofertar(l.id, c.customer_id, true);
            resultados.push({ cliente: c.nome, grupo: c.grupo, ...r });
            await new Promise((ok) => setTimeout(ok, 500 + Math.random() * 1000)); // espaco entre envios
          } else {
            resultados.push({ cliente: c.nome, grupo: c.grupo, divida: c.original, vista: c.vista, dias: c.dias_max });
          }
        }
        saida.push({ loja: l.company_name, modo, ja_enviadas_hoje: hoje?.length || 0, nesta_rodada: resultados.length, resultados });
      }
      return json({ ok: true, lojas: saida });
    }

    const customer = u.searchParams.get("customer") || "";
    if (!tenant || !customer) return json({ error: "informe tenant e customer" }, 400);
    if (acao === "simular") return json(await ofertar(tenant, customer, false));
    if (acao === "ofertar") { const r = await ofertar(tenant, customer, true); return json(r, r.erro ? 400 : 200); }
    return json({ error: "acao invalida" }, 400);
  } catch (e) {
    return json({ ok: false, erro: String(e) }, 500);
  }
});

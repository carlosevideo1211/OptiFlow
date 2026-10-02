// Funcao administrativa (so roda com o x-cron-secret): cria/consulta na Meta os
// modelos de cobranca COM PIX (imagem do QR Code no cabecalho + botao "Copiar
// codigo Pix") para o canal oficial. Uso:
//   POST ?acao=status   -> lista os modelos *_pix e a situacao de cada um
//   POST ?acao=criar    -> cria os que ainda nao existem
// O token da Meta fica so no servidor (META_WHATSAPP_TOKEN).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import QRCode from "npm:qrcode@1.5.4";

const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") || "";
const V = Deno.env.get("META_GRAPH_VERSION") || "v21.0";
const G = `https://graph.facebook.com/${V}`;
// WABA "Otica Evangelista Castanho" (ver CLAUDE.md, sessao 23/09/2026).
const WABA_ID = Deno.env.get("META_WABA_ID") || "2124840844909179";

const EX = ["Maria", "R$ 150,00", "Ótica Evangelista Castanho", "15/10/2026"];
const MODELOS: { name: string; text: string; example: string[] }[] = [
  {
    name: "vencimento_proximo_pix",
    text: "Olá, {{1}}! Passando para lembrar: sua parcela de {{2}} do crediário na {{3}} vence em {{4}}. Para pagar por Pix, use o QR Code acima ou o botão abaixo. Qualquer dúvida, é só chamar por aqui!",
    example: EX,
  },
  {
    name: "vencimento_hoje_pix",
    text: "Olá, {{1}}! Sua parcela de {{2}} do crediário na {{3}} vence hoje ({{4}}). Para pagar por Pix, use o QR Code acima ou o botão abaixo. Qualquer dúvida, é só chamar por aqui!",
    example: EX,
  },
  {
    name: "vencimento_atraso5_pix",
    text: "Olá, {{1}}. Notamos que sua parcela de {{2}} do crediário na {{3}}, com vencimento em {{4}}, ainda está em aberto. Para pagar por Pix, use o QR Code acima ou o botão abaixo. Se já pagou, desconsidere esta mensagem. Qualquer dúvida ou para negociar, estamos à disposição!",
    example: EX,
  },
  {
    name: "cobranca_atraso_pix",
    text: "Olá, {{1}}. Este é um lembrete importante da {{2}}: identificamos uma parcela em atraso no valor de {{3}}, com vencimento em {{4}}. Para pagar por Pix, use o QR Code acima ou o botão abaixo. Se você já efetuou o pagamento, por favor desconsidere esta mensagem ou nos avise por aqui. Qualquer dúvida ou para negociar, estamos à disposição.",
    example: ["Maria", "Ótica Evangelista Castanho", "R$ 150,00", "15/09/2026"],
  },
];

async function gj(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}

// Imagem de exemplo do cabecalho (um QR Code qualquer), enviada pela API de
// upload da Meta; devolve o "handle" exigido na criacao do modelo.
async function handleImagemExemplo(): Promise<{ handle?: string; erro?: unknown }> {
  const app = await gj(`${G}/app?access_token=${TOKEN}`);
  if (!app.ok || !app.d?.id) return { erro: { etapa: "app", ...app } };
  const dataUrl: string = await QRCode.toDataURL("00020126EXEMPLO-DE-QR-CODE-PIX", { margin: 2, width: 480 });
  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
  const ses = await gj(`${G}/${app.d.id}/uploads?file_name=pix.png&file_length=${bytes.length}&file_type=image/png&access_token=${TOKEN}`, { method: "POST" });
  if (!ses.ok || !ses.d?.id) return { erro: { etapa: "sessao", ...ses } };
  const up = await gj(`${G}/${ses.d.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${TOKEN}`, file_offset: "0" },
    body: bytes,
  });
  if (!up.ok || !up.d?.h) return { erro: { etapa: "upload", ...up } };
  return { handle: up.d.h };
}

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const url = new URL(req.url);
  const acao = url.searchParams.get("acao") || "status";
  const comBotao = url.searchParams.get("botao") !== "0";

  // ?acao=assinaturas -> mostra o webhook cadastrado no app (URL, ativo, campos assinados).
  if (acao === "assinaturas") {
    const seg = Deno.env.get("META_APP_SECRET") || "";
    const app = await gj(`${G}/app?access_token=${TOKEN}`);
    const sub = await gj(`${G}/${app.d?.id}/subscriptions?access_token=${app.d?.id}|${encodeURIComponent(seg)}`);
    const lista = (sub.d?.data || []).map((x: any) => ({ objeto: x.object, url: x.callback_url, ativo: x.active, campos: (x.fields || []).map((f: any) => f.name) }));
    return new Response(JSON.stringify({ ok: sub.ok, erro: sub.ok ? undefined : sub.d?.error?.message, webhooks: lista }), { headers: { "Content-Type": "application/json" } });
  }

  // ?acao=assinar_messages -> assina o campo "messages" do webhook do app (mantem a URL ja cadastrada).
  if (acao === "assinar_messages") {
    const seg = Deno.env.get("META_APP_SECRET") || "";
    const vt = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "";
    const app = await gj(`${G}/app?access_token=${TOKEN}`);
    const corpo = new URLSearchParams({
      object: "whatsapp_business_account",
      callback_url: "https://fkwamdnstrbvgheosalz.supabase.co/functions/v1/whatsapp-webhook",
      verify_token: vt, fields: "messages", access_token: `${app.d?.id}|${seg}`,
    });
    const r = await gj(`${G}/${app.d?.id}/subscriptions`, { method: "POST", body: corpo });
    return new Response(JSON.stringify({ ok: r.ok, resposta: r.d }), { headers: { "Content-Type": "application/json" } });
  }

  // ?acao=segredo -> confere (sem mostrar) se o META_APP_SECRET guardado vale na Meta
  // e se o token de verificacao do webhook ja foi configurado.
  if (acao === "segredo") {
    const seg = Deno.env.get("META_APP_SECRET") || "";
    const app = await gj(`${G}/app?access_token=${TOKEN}`);
    const chk = seg && app.d?.id ? await gj(`${G}/${app.d.id}?fields=name&access_token=${app.d.id}|${encodeURIComponent(seg)}`) : null;
    return new Response(JSON.stringify({
      app_secret_tamanho: seg.length, app_secret_valido: !!chk?.ok, erro: chk && !chk.ok ? chk.d?.error?.message : undefined,
      verify_token_configurado: !!(Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || ""),
    }), { headers: { "Content-Type": "application/json" } });
  }

  // ?acao=webhook -> inscreve o app nos eventos desta conta (necessario para as
  // respostas dos clientes chegarem no whatsapp-webhook) e mostra a inscricao.
  if (acao === "webhook") {
    const ins = await gj(`${G}/${WABA_ID}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } });
    const ver = await gj(`${G}/${WABA_ID}/subscribed_apps?access_token=${TOKEN}`);
    return new Response(JSON.stringify({ inscricao: ins.d, inscritos: ver.d }), { headers: { "Content-Type": "application/json" } });
  }

  const lista = await gj(`${G}/${WABA_ID}/message_templates?fields=name,status,category,language,rejected_reason,components&limit=100&access_token=${TOKEN}`);
  const existentes: any[] = lista.d?.data || [];
  const resumo = (t: any) => ({
    name: t.name, status: t.status, category: t.category, motivo: t.rejected_reason,
    componentes: (t.components || []).map((c: any) => c.type + (c.format ? ":" + c.format : "") + (c.buttons ? ":" + c.buttons.map((b: any) => b.type).join("+") : "")),
  });
  if (acao === "status") {
    return new Response(JSON.stringify({ ok: lista.ok, erro: lista.ok ? undefined : lista.d, modelos: existentes.map(resumo) }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const img = await handleImagemExemplo();
  if (!img.handle) return new Response(JSON.stringify({ ok: false, erro_imagem: img.erro }), { status: 500 });

  const resultados: unknown[] = [];
  for (const m of MODELOS) {
    if (existentes.some((t) => t.name === m.name)) { resultados.push({ name: m.name, ja_existia: true }); continue; }
    const components: unknown[] = [
      { type: "HEADER", format: "IMAGE", example: { header_handle: [img.handle] } },
      { type: "BODY", text: m.text, example: { body_text: [m.example] } },
    ];
    if (comBotao) components.push({ type: "BUTTONS", buttons: [{ type: "ORDER_DETAILS", text: "Copy Pix code" }] });
    const r = await gj(`${G}/${WABA_ID}/message_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ name: m.name, language: "pt_BR", category: "UTILITY", components }),
    });
    resultados.push({ name: m.name, ok: r.ok, status: r.status, resposta: r.d });
    if (!r.ok) break; // para no primeiro erro para ajustar antes de criar os demais
  }
  return new Response(JSON.stringify({ ok: true, com_botao: comBotao, resultados }), { headers: { "Content-Type": "application/json" } });
});

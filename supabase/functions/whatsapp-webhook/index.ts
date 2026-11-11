// Webhook do WhatsApp oficial (Meta Cloud API): recebe as RESPOSTAS dos
// clientes e os avisos de entregue/lido/falhou, e grava em whatsapp_mensagens
// (tela "Mensagens" do OptiFlow).
//
// Configuracao no painel da Meta (developers.facebook.com > app OptiFlow >
// WhatsApp > Configuracao > Webhook):
//   URL de retorno: https://fkwamdnstrbvgheosalz.supabase.co/functions/v1/whatsapp-webhook
//   Token de verificacao: o mesmo valor do secret META_WEBHOOK_VERIFY_TOKEN
//   Campo assinado: messages
// Secrets: META_WEBHOOK_VERIFY_TOKEN (obrigatorio) e META_APP_SECRET
// (recomendado: confere a assinatura X-Hub-Signature-256 de cada chamada).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import QRCode from "npm:qrcode@1.5.4";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") || "";
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") || "https://evolution.visionproerp.com.br";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const SITE = "https://app.visionproerp.com.br";

async function db(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  return res.json().catch(() => null);
}

async function assinaturaOk(corpo: string, cabecalho: string | null): Promise<boolean> {
  if (!APP_SECRET) return true; // sem o segredo do app configurado, nao ha como conferir
  if (!cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === cabecalho.slice(7);
}

const so8 = (t?: string | null) => (t || "").replace(/\D/g, "").slice(-8);

// Aviso no celular: quando um cliente responde no WhatsApp oficial, manda um
// alerta para o numero configurado na tela Mensagens (store_settings.
// wa_alerta_numero), saindo pelo WhatsApp da loja conectado por QR Code
// (Evolution). No maximo um aviso por cliente a cada 10 minutos.
async function avisarLoja(tenantId: string, de: string, nomeContato: string, texto: string, msgId: string | null) {
  try {
    if (!EVOLUTION_API_KEY) return;
    const ss = await db(`store_settings?tenant_id=eq.${tenantId}&select=wa_alerta_numero&limit=1`);
    const alvo = String(ss?.[0]?.wa_alerta_numero || "").replace(/\D/g, "");
    if (alvo.length < 10 || so8(alvo) === so8(de)) return; // sem numero, ou e o proprio numero de aviso escrevendo
    const tn = await db(`tenants?id=eq.${tenantId}&select=whatsapp_instance_name&limit=1`);
    const instancia = tn?.[0]?.whatsapp_instance_name;
    if (!instancia) return;

    const dezMin = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recentes = await db(`whatsapp_mensagens?tenant_id=eq.${tenantId}&phone=eq.${de}&direcao=eq.in&created_at=gte.${dezMin}&select=meta_message_id&limit=5`);
    if (Array.isArray(recentes) && recentes.some((r: any) => r.meta_message_id !== msgId)) return; // ja avisou ha pouco

    // Nome do cadastro de clientes, se o telefone bater (compara os 8 ultimos digitos).
    let nome = nomeContato || "";
    const fim4 = de.slice(-4);
    const cs = await db(`customers?tenant_id=eq.${tenantId}&or=(phone.ilike.*${fim4},whatsapp.ilike.*${fim4})&select=name,phone,whatsapp&limit=50`);
    const achou = Array.isArray(cs) ? cs.find((c: any) => so8(c.whatsapp) === so8(de) || so8(c.phone) === so8(de)) : null;
    if (achou?.name) nome = achou.name;

    const d = de.replace(/^55/, "");
    const fone = d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : de;
    const aviso = `🔔 *OptiFlow* — nova mensagem no WhatsApp oficial

*${nome || fone}*${nome ? ` (${fone})` : ""}:
${(texto || "").slice(0, 300)}

Abra para responder: ${SITE}/mensagens`;
    const numero = alvo.startsWith("55") ? alvo : `55${alvo}`;
    const r = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${instancia}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: numero, text: aviso }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) console.error("aviso para a loja falhou:", r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error("aviso para a loja falhou:", String(e));
  }
}

// ---------------- Cobranca nova: robo que entende respostas (11/11/2026) ----------------
// So nas lojas com tenants.cobranca_nova. Classifica a resposta do cliente e grava em cobranca_respostas
// (lista "Respostas da cobranca" na tela Crediario). Resposta automatica ao cliente so com
// tenants.cobranca_resposta_auto. O que nao for entendido fica so na tela Mensagens, como antes.
const META_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") || "";
const META_V = Deno.env.get("META_GRAPH_VERSION") || "v21.0";

type Intencao = "paguei" | "pagar_vista" | "parcelar" | "falar_loja" | "nao_consigo" | "parar";

const normal = (t: string) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function classificar(tipo: string, texto: string): Intencao | "comprovante" | null {
  const t = normal(tipo === "image" || tipo === "document" ? texto.replace(/^\[(imagem|documento)\]/, "") : texto);
  // Botoes do modelo oferta_acordo_feirao (e respostas 1/2/3).
  if (t === "pagar a vista" || t === "1") return "pagar_vista";
  if (t === "parcelar" || t === "2") return "parcelar";
  if (t === "falar com a loja" || t === "3") return "falar_loja";
  if (/^(parar|pare|stop|sair|cancelar|descadastrar)$/.test(t) ||
      /(parar de receber|nao quero (mais )?receber|nao me mand|para de mandar|pare de mandar|nao mande mais|nao mandem mais)/.test(t)) return "parar";
  if (/(nao (consigo|tenho como|posso|vou conseguir|da pra|da para) pag|sem dinheiro|nao tenho dinheiro|desempregad|estou sem condic|to sem condic|nao tenho condic)/.test(t)) return "nao_consigo";
  if (/nao pag/.test(t)) return null;
  if (/\b(paguei|ja pago|ta pago|esta pago|fiz o pix|fiz pix|fiz o pagamento|efetuei|transferi|comprovante|quitei|pago ja)\b/.test(t)) return "paguei";
  if (tipo === "image" || tipo === "document") return "comprovante"; // possivel comprovante: confere se deve algo
  return null;
}

async function acharCliente(tenantId: string, de: string): Promise<{ id: string; name: string } | null> {
  const cs = await db(`customers?tenant_id=eq.${tenantId}&or=(phone.ilike.*${de.slice(-4)},whatsapp.ilike.*${de.slice(-4)})&select=id,name,phone,whatsapp&limit=50`);
  const achados = Array.isArray(cs) ? cs.filter((c: any) => so8(c.whatsapp) === so8(de) || so8(c.phone) === so8(de)) : [];
  if (achados.length <= 1) return achados[0] || null;
  // Mesmo telefone em varios cadastros (familia, cadastro duplicado): fica com quem tem parcela em aberto,
  // a mais antiga primeiro (e quem o robo cobrou).
  const creds = await db(`crediario?tenant_id=eq.${tenantId}&status=eq.ativo&customer_id=in.(${achados.map((c: any) => c.id).join(",")})&select=id,customer_id`);
  const credCli: Record<string, string> = {};
  for (const c of Array.isArray(creds) ? creds : []) credCli[c.id] = c.customer_id;
  if (Object.keys(credCli).length) {
    const ab = await db(`crediario_parcelas?crediario_id=in.(${Object.keys(credCli).join(",")})&status=neq.pago&status=neq.cancelado&select=crediario_id&order=due_date.asc&limit=1`);
    const id = Array.isArray(ab) && ab[0] ? credCli[ab[0].crediario_id] : null;
    if (id) return achados.find((c: any) => c.id === id) || achados[0];
  }
  return achados[0];
}

const RESPOSTAS: Record<Intencao, (nome: string, loja: string) => string> = {
  paguei: (n) => `Obrigado${n ? ", " + n : ""}! Recebemos seu aviso de pagamento. A loja vai conferir e dar a baixa. Enquanto isso, você não recebe cobrança.`,
  parar: (_n, l) => `Pronto. Você não vai mais receber mensagens automáticas da ${l}. Se precisar, é só falar com a loja.`,
  nao_consigo: (n) => `Entendemos${n ? ", " + n : ""}. Alguém da loja vai falar com você para combinar uma forma de pagamento que caiba no seu bolso.`,
  falar_loja: (_n, l) => `Certo! Alguém da ${l} vai falar com você por aqui em breve.`,
  pagar_vista: () => `Recebemos sua escolha: pagar à vista. A loja vai mandar o Pix com o valor do acordo por aqui em breve.`,
  parcelar: () => `Recebemos sua escolha: parcelar. A loja vai mandar as condições e o Pix da entrada por aqui em breve.`,
};

async function responderCliente(tenantId: string, phoneId: string, para: string, texto: string) {
  const r = await fetch(`https://graph.facebook.com/${META_V}/${phoneId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  await db("whatsapp_mensagens", { method: "POST", body: JSON.stringify({
    tenant_id: tenantId, phone: para, direcao: "out", tipo: "text", texto, enviado_por: "robo",
    meta_message_id: d?.messages?.[0]?.id || null, status: r.ok ? "sent" : "failed",
    erro: r.ok ? null : String(d?.error?.message || r.status).slice(0, 200),
  }) });
}

// ---------------- Acordo automatico (Fase 1, etapa 4 - 11/11/2026) ----------------
// Cliente tocou "Pagar a vista" / "Parcelar" na oferta (modelo oferta_acordo_feirao) -> o robo calcula pelas regras
// do Carlos (funcao cobranca_oferta no banco), manda o Pix da loja e registra em cobranca_acordos. O carne do acordo
// nasce em cobranca_fechar_acordo (a vista/entrada: quando a loja confirma o Pix; sem entrada: na hora).
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const r2 = (v: number) => Math.round(v * 100) / 100;
const dataBR = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Manaus" });

function pixEMV(chave: string, valor: number, nome: string): string {
  const f = (id: string, vv: string) => id + String(vv.length).padStart(2, "0") + vv;
  const mai = f("00", "BR.GOV.BCB.PIX") + f("01", chave);
  const amt = valor > 0 ? valor.toFixed(2) : "";
  const p = f("00", "01") + f("26", mai) + f("52", "0000") + f("53", "986") + (amt ? f("54", amt) : "") + f("58", "BR") +
    f("59", nome.normalize("NFD").replace(/[̀-ͯ]/g, "").substring(0, 25).replace(/[^A-Za-z0-9 ]/g, "")) +
    f("60", "SAO PAULO") + f("62", f("05", "***")) + "6304";
  let crc = 0xffff;
  for (let i = 0; i < p.length; i++) {
    crc ^= p.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return p + (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

async function metaEnviar(tenantId: string, phoneId: string, para: string, corpo: any, textoTela: string) {
  const r = await fetch(`https://graph.facebook.com/${META_V}/${phoneId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, ...corpo }), signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  await db("whatsapp_mensagens", { method: "POST", body: JSON.stringify({
    tenant_id: tenantId, phone: para, direcao: "out", tipo: corpo.type || "text", texto: textoTela.slice(0, 4000), enviado_por: "robo",
    meta_message_id: d?.messages?.[0]?.id || null, status: r.ok ? "sent" : "failed",
    erro: r.ok ? null : String(d?.error?.message || r.status).slice(0, 200),
  }) });
  return r.ok;
}

// Pix da loja: imagem do QR Code + o codigo copia e cola numa segunda mensagem (facil de copiar no celular).
async function mandarPix(tenantId: string, phoneId: string, para: string, valor: number, legenda: string) {
  const ss = await db(`store_settings?tenant_id=eq.${tenantId}&select=pix_key,name&limit=1`);
  const chave = String(ss?.[0]?.pix_key || "").trim();
  if (!chave) { await metaEnviar(tenantId, phoneId, para, { type: "text", text: { body: legenda + "\n\n(A loja vai te mandar a chave Pix por aqui.)" } }, legenda); return; }
  const codigo = pixEMV(chave, valor, ss?.[0]?.name || "Loja");
  try {
    const dataUrl: string = await QRCode.toDataURL(codigo, { errorCorrectionLevel: "M", margin: 2, width: 480 });
    const png = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "image/png");
    form.append("file", new Blob([png], { type: "image/png" }), "pix.png");
    const up = await fetch(`https://graph.facebook.com/${META_V}/${phoneId}/media`, { method: "POST", headers: { Authorization: `Bearer ${META_TOKEN}` }, body: form });
    const u = await up.json().catch(() => ({}));
    if (u?.id) await metaEnviar(tenantId, phoneId, para, { type: "image", image: { id: u.id, caption: legenda } }, "[imagem Pix] " + legenda);
    else await metaEnviar(tenantId, phoneId, para, { type: "text", text: { body: legenda } }, legenda);
  } catch {
    await metaEnviar(tenantId, phoneId, para, { type: "text", text: { body: legenda } }, legenda);
  }
  await metaEnviar(tenantId, phoneId, para, { type: "text", text: { body: codigo } }, codigo);
}

async function oferta(tenantId: string, customerId: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cobranca_oferta`, {
    method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tenant: tenantId, p_customer: customerId }),
  });
  const o = await r.json();
  const original = Number(o.original || 0), juros = Number(o.juros || 0), atualizado = r2(original + juros);
  const nE = Math.max(1, Math.min(4, Math.floor(original / 100)));
  const nS = Math.max(1, Math.min(4, Math.floor(atualizado / 100)));
  return { ...o, original, juros, atualizado, vista: Number(o.vista || 0), nE, pE: Math.floor((original / nE) * 100) / 100,
           nS, pS: Math.floor((atualizado / nS) * 100) / 100 };
}

async function atualizarAcordo(id: string, campos: Record<string, unknown>) {
  await db(`cobranca_acordos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });
}

// Devolve true quando a mensagem foi tratada como parte de um acordo.
async function tratarAcordo(tenantId: string, phoneId: string, de: string, cliente: { id: string; name: string } | null,
                            intencao: string | null, botaoId: string | null): Promise<boolean> {
  let ac: any = null;
  let op: string | null = null;
  if (botaoId?.startsWith("acordo:")) {
    const [, id, o] = botaoId.split(":");
    const l = await db(`cobranca_acordos?id=eq.${id}&tenant_id=eq.${tenantId}&select=*&limit=1`);
    ac = l?.[0]; op = o;
    if (!ac) return false;
    if (ac.status !== "escolhendo") {
      await metaEnviar(tenantId, phoneId, de, { type: "text", text: { body: "Esse acordo já foi registrado. Qualquer dúvida, é só falar com a loja por aqui." } }, "acordo já registrado");
      return true;
    }
  } else if ((intencao === "pagar_vista" || intencao === "parcelar") && cliente) {
    const hoje = new Date().toISOString().slice(0, 10);
    const l = await db(`cobranca_acordos?tenant_id=eq.${tenantId}&customer_id=eq.${cliente.id}&status=in.(ofertado,escolhendo)&validade=gte.${hoje}&select=*&order=created_at.desc&limit=1`);
    ac = l?.[0]; op = intencao === "pagar_vista" ? "vista" : "parcelar";
    if (!ac) return false; // sem oferta aberta: fica na lista da loja, como antes
  } else return false;

  const nome = (cliente?.name || "").split(" ")[0];
  const o = await oferta(tenantId, ac.customer_id);
  if (!o.qtd) {
    await atualizarAcordo(ac.id, { status: "cancelado", obs: "sem parcelas vencidas na hora do aceite" });
    await metaEnviar(tenantId, phoneId, de, { type: "text", text: { body: "Não encontramos nenhuma parcela vencida em aberto no seu nome. Se tiver dúvida, é só falar com a loja por aqui." } }, "sem débito");
    return true;
  }
  const base = { parcelas_originais: o.ids, valor_original: o.original, valor_juros: o.juros, valor_vista: o.vista, aceito_em: new Date().toISOString() };
  const amanha = new Date(Date.now() + 864e5);

  if (op === "parcelar" && o.nE <= 1) op = "vista"; // divida pequena: so a vista (regra da parcela minima de R$ 100)
  if (op === "vista") {
    await atualizarAcordo(ac.id, { ...base, tipo: "vista", n_parcelas: 1, valor_parcela: o.vista, valor_acordo: o.vista, pix_valor: o.vista,
      status: "aguardando_pagamento", expira_em: amanha.toISOString() });
    const desc = o.atualizado > o.vista ? ` (em vez de ${brl(o.atualizado)})` : "";
    await mandarPix(tenantId, phoneId, de, o.vista,
      `Combinado${nome ? ", " + nome : ""}! Acordo do Feirão Limpa Nome feito: ${brl(o.vista)} à vista${desc}.\n\nPague pelo Pix (QR Code acima ou o código na próxima mensagem) até ${dataBR(amanha)}. Quando pagar, responda PAGUEI.`);
    return true;
  }
  if (op === "parcelar") {
    await atualizarAcordo(ac.id, { ...base, status: "escolhendo" });
    const corpo = `Feirão Limpa Nome — para parcelar seu débito, escolha:\n\n✅ COM ENTRADA (sem juros): entrada de ${brl(o.pE)} hoje no Pix + ${o.nE - 1}x de ${brl(o.pE)} por mês. Total ${brl(o.original)}.\n\n` +
      `📅 SEM ENTRADA (com juros): ${o.nS}x de ${brl(o.pS)}, a 1ª em 7 dias. Total ${brl(o.atualizado)}.`;
    await metaEnviar(tenantId, phoneId, de, { type: "interactive", interactive: { type: "button", body: { text: corpo }, action: { buttons: [
      { type: "reply", reply: { id: `acordo:${ac.id}:entrada`, title: "Com entrada" } },
      { type: "reply", reply: { id: `acordo:${ac.id}:sem`, title: "Sem entrada" } },
    ] } } }, corpo);
    return true;
  }
  if (op === "entrada") {
    await atualizarAcordo(ac.id, { ...base, tipo: "entrada", n_parcelas: o.nE, valor_parcela: o.pE, valor_acordo: o.original, pix_valor: o.pE,
      status: "aguardando_pagamento", expira_em: amanha.toISOString() });
    await mandarPix(tenantId, phoneId, de, o.pE,
      `Combinado! Acordo do Feirão Limpa Nome: entrada de ${brl(o.pE)} pelo Pix (vale até ${dataBR(amanha)}). Depois, ${o.nE - 1}x de ${brl(o.pE)} por mês, sem juros.\n\nQuando pagar a entrada, responda PAGUEI.`);
    return true;
  }
  if (op === "sem") {
    await atualizarAcordo(ac.id, { ...base, tipo: "sem_entrada", n_parcelas: o.nS, valor_parcela: o.pS, valor_acordo: o.atualizado, pix_valor: o.pS,
      status: "aguardando_pagamento" });
    const f = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cobranca_fechar_acordo`, {
      method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_acordo: ac.id, p_por: "robo (sem entrada)" }),
    });
    if (!f.ok) {
      console.error("acordo sem entrada falhou:", (await f.text()).slice(0, 300));
      await metaEnviar(tenantId, phoneId, de, { type: "text", text: { body: "Recebemos sua escolha. A loja vai confirmar o acordo e te mandar os detalhes por aqui." } }, "acordo sem entrada: falha ao gerar carnê");
      return true;
    }
    const primeira = new Date(Date.now() + 7 * 864e5);
    await mandarPix(tenantId, phoneId, de, o.pS,
      `Combinado! Seu acordo do Feirão Limpa Nome ficou em ${o.nS}x de ${brl(o.pS)}. A 1ª vence em ${dataBR(primeira)} e as outras todo mês no mesmo dia. Vamos te lembrar antes de cada vencimento.\n\nSe quiser já pagar a 1ª, use o Pix acima.`);
    return true;
  }
  return false;
}

async function tratarResposta(tenantId: string, phoneId: string, de: string, nomeContato: string, tipo: string, texto: string, msgId: string | null, botaoId: string | null = null) {
  try {
    const tn = await db(`tenants?id=eq.${tenantId}&select=cobranca_nova,cobranca_resposta_auto,company_name&limit=1`);
    const t = tn?.[0];
    if (!t?.cobranca_nova) return;
    if (botaoId?.startsWith("acordo:")) {
      await tratarAcordo(tenantId, phoneId, de, await acharCliente(tenantId, de), null, botaoId);
      return;
    }
    let intencao = classificar(tipo, texto);
    if (!intencao) return;
    const cliente = await acharCliente(tenantId, de);
    if ((intencao === "pagar_vista" || intencao === "parcelar") && await tratarAcordo(tenantId, phoneId, de, cliente, intencao, null)) return;
    if (intencao === "comprovante") {
      // Imagem/documento so vira "PAGUEI" se o cliente tem parcela vencida ou vencendo em ate 3 dias.
      if (!cliente) return;
      const ate = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
      const creds = await db(`crediario?tenant_id=eq.${tenantId}&customer_id=eq.${cliente.id}&status=eq.ativo&select=id`);
      const ids = (Array.isArray(creds) ? creds : []).map((c: any) => c.id);
      if (!ids.length) return;
      const ab = await db(`crediario_parcelas?crediario_id=in.(${ids.join(",")})&status=neq.pago&status=neq.cancelado&due_date=lte.${ate}&select=id&limit=1`);
      if (!Array.isArray(ab) || !ab.length) return;
      intencao = "paguei";
    }
    // Ja tem a mesma intencao esperando a loja? Nao duplica nem responde de novo.
    const filtro = cliente ? `customer_id=eq.${cliente.id}` : `phone=eq.${de}`;
    const ja = await db(`cobranca_respostas?tenant_id=eq.${tenantId}&${filtro}&intencao=eq.${intencao}&status=eq.pendente&select=id&limit=1`);
    if (Array.isArray(ja) && ja.length) return;

    const nome = (cliente?.name || nomeContato || "").split(" ")[0];
    const resposta = t.cobranca_resposta_auto ? RESPOSTAS[intencao](nome, t.company_name || "loja") : null;
    await db("cobranca_respostas?on_conflict=meta_message_id", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ tenant_id: tenantId, customer_id: cliente?.id || null, phone: de, nome: cliente?.name || nomeContato || null,
        intencao, texto: (texto || "").slice(0, 500), meta_message_id: msgId, resposta_auto: resposta,
        // PARAR ja fica resolvido: o cadastro e marcado para nao receber mais nada.
        status: intencao === "parar" && cliente ? "resolvido" : "pendente",
        resolvido_em: intencao === "parar" && cliente ? new Date().toISOString() : null,
        resolvido_por: intencao === "parar" && cliente ? "robo" : null }),
    });
    if (intencao === "parar" && cliente) {
      await db(`customers?id=eq.${cliente.id}`, { method: "PATCH",
        body: JSON.stringify({ whatsapp_opt_out: true, whatsapp_opt_out_em: new Date().toISOString() }) });
    }
    if (resposta) await responderCliente(tenantId, phoneId, de, resposta);
  } catch (e) {
    console.error("cobranca nova - resposta:", String(e));
  }
}

// Texto que aparece na tela para cada tipo de mensagem recebida.
function textoDaMensagem(m: any): { tipo: string; texto: string } {
  const tipo = m.type || "text";
  if (tipo === "text") return { tipo, texto: m.text?.body || "" };
  if (tipo === "button") return { tipo, texto: m.button?.text || "" };
  if (tipo === "interactive") {
    const i = m.interactive || {};
    return { tipo, texto: i.button_reply?.title || i.list_reply?.title || "[resposta interativa]" };
  }
  if (tipo === "image") return { tipo, texto: "[imagem]" + (m.image?.caption ? " " + m.image.caption : "") };
  if (tipo === "audio") return { tipo, texto: "[áudio]" };
  if (tipo === "video") return { tipo, texto: "[vídeo]" + (m.video?.caption ? " " + m.video.caption : "") };
  if (tipo === "document") return { tipo, texto: "[documento] " + (m.document?.filename || "") };
  if (tipo === "sticker") return { tipo, texto: "[figurinha]" };
  if (tipo === "location") return { tipo, texto: "[localização]" };
  if (tipo === "reaction") return { tipo, texto: "[reação] " + (m.reaction?.emoji || "") };
  return { tipo, texto: `[${tipo}]` };
}

serve(async (req) => {
  const url = new URL(req.url);

  // Verificacao do webhook (a Meta chama uma vez, ao salvar a configuracao).
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && VERIFY_TOKEN &&
      url.searchParams.get("hub.verify_token") === VERIFY_TOKEN;
    return new Response(ok ? url.searchParams.get("hub.challenge") || "" : "forbidden", { status: ok ? 200 : 403 });
  }
  if (req.method !== "POST") return new Response("ok");

  const corpo = await req.text();
  if (!(await assinaturaOk(corpo, req.headers.get("x-hub-signature-256")))) {
    return new Response("assinatura invalida", { status: 403 });
  }

  try {
    const dados = JSON.parse(corpo || "{}");
    const phoneIdTenant: Record<string, string | null> = {};
    for (const entry of dados.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const phoneId = v.metadata?.phone_number_id;
        if (!phoneId) continue;
        if (!(phoneId in phoneIdTenant)) {
          const ss = await db(`store_settings?wa_phone_id=eq.${encodeURIComponent(phoneId)}&select=tenant_id&limit=1`);
          phoneIdTenant[phoneId] = Array.isArray(ss) && ss[0] ? ss[0].tenant_id : null;
        }
        const tenantId = phoneIdTenant[phoneId];
        if (!tenantId) continue; // numero que nao e de nenhuma loja do sistema

        const nomes: Record<string, string> = {};
        for (const c of v.contacts || []) nomes[c.wa_id] = c.profile?.name || "";

        // Mensagens recebidas do cliente.
        for (const m of v.messages || []) {
          const { tipo, texto } = textoDaMensagem(m);
          if (tipo === "reaction" && !m.reaction?.emoji) continue;
          await db("whatsapp_mensagens?on_conflict=meta_message_id", {
            method: "POST",
            headers: { Prefer: "resolution=ignore-duplicates" },
            body: JSON.stringify({
              tenant_id: tenantId,
              phone: String(m.from || "").replace(/\D/g, ""),
              nome_contato: nomes[m.from] || null,
              direcao: "in",
              tipo,
              texto: (texto || "").slice(0, 4000),
              media_id: m[tipo]?.id && ["audio", "image", "video", "document", "sticker"].includes(tipo) ? m[tipo].id : null,
              media_mime: m[tipo]?.mime_type || null,
              meta_message_id: m.id || null,
              created_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
            }),
          });
          if (tipo !== "reaction") {
            await tratarResposta(tenantId, phoneId, String(m.from || "").replace(/\D/g, ""), nomes[m.from] || "", tipo, texto, m.id || null,
              m.interactive?.button_reply?.id || null);
            await avisarLoja(tenantId, String(m.from || "").replace(/\D/g, ""), nomes[m.from] || "", texto, m.id || null);
          }
        }

        // Situacao das mensagens que a loja enviou pela tela (entregue/lida/falhou).
        for (const s of v.statuses || []) {
          if (!s.id) continue;
          const erro = s.errors?.[0] ? `${s.errors[0].code || ""} ${s.errors[0].title || s.errors[0].message || ""}`.trim() : null;
          await db(`whatsapp_mensagens?meta_message_id=eq.${encodeURIComponent(s.id)}&direcao=eq.out`, {
            method: "PATCH",
            body: JSON.stringify(erro ? { status: s.status, erro } : { status: s.status }),
          });
          // Falha de entrega de mensagem automatica: fica registrada no log do servidor.
          if (s.status === "failed") console.error("entrega falhou:", tenantId, s.recipient_id, erro);
          // Cobranca nova (Telefones, 11/11/2026): numero sem WhatsApp fica marcado no cadastro, para a loja corrigir
          // (lista "Corrigir telefones" no Crediario). A marca some quando o telefone do cadastro e alterado.
          if (s.status === "failed" && String(s.errors?.[0]?.code) === "131026" && s.recipient_id) {
            const f8 = so8(s.recipient_id);
            const cs = await db(`customers?tenant_id=eq.${tenantId}&or=(phone.ilike.*${f8.slice(-4)},whatsapp.ilike.*${f8.slice(-4)})&select=id,phone,whatsapp&limit=50`);
            for (const c of Array.isArray(cs) ? cs : []) {
              if (so8(c.whatsapp || c.phone) === f8) {
                await db(`customers?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ telefone_sem_whatsapp_em: new Date().toISOString() }) });
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("whatsapp-webhook erro:", String(e));
  }
  // Sempre 200: se devolver erro, a Meta fica reenviando a mesma notificacao.
  return new Response("ok");
});

// VIGIA da cobranca (Fase 1, etapa 2 - 11/11/2026). Roda de hora em hora pelo pg_cron (x-cron-secret) e avisa o
// Carlos no WhatsApp quando:
//  1. o robo nao enviou nada hoje (dia util, a partir das 14h de Manaus) numa loja da cobranca nova ou em todas;
//     ou a rotina do robo falhou/nao rodou na ultima hora (das 9h as 19h);
//  2. o WhatsApp de uma loja caiu (Evolution desconectado ou numero da Meta fora de CONNECTED) - e quando volta;
//  3. os erros de envio aumentaram (3+ falhas e 30%+ das tentativas nas ultimas 2h, ou 3+ falhas na Meta).
// (O aviso de "PAGUEI" parado entra junto com o robo que entende respostas.)
// So avisa quando a situacao MUDA (e lembra 1x por dia enquanto continuar ruim), para nao virar spam.
// Teste sem mandar nem gravar nada: ?simular=1
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") || "https://evolution.visionproerp.com.br";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const META_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") || "";
const META_V = Deno.env.get("META_GRAPH_VERSION") || "v21.0";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
// Numero do Carlos para os avisos (o mesmo do check-up diario). Pode ser trocado pelo secret VIGIA_NUMERO.
const NUMERO_AVISO = Deno.env.get("VIGIA_NUMERO") || "5592992779106";
const EMAIL_AVISO = "carlosevideo28@gmail.com";
const LEMBRETE_HORAS = 24;

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function db(path: string, init?: RequestInit) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${path}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

async function estadoEvolution(instancia: string): Promise<string> {
  try {
    const r = await fetch(`${EVOLUTION_BASE_URL}/instance/connectionState/${instancia}`, {
      headers: { apikey: EVOLUTION_API_KEY }, signal: AbortSignal.timeout(15000),
    });
    if (r.status === 404) return "nao existe";
    if (!r.ok) return `erro ${r.status}`;
    const d = await r.json().catch(() => ({}));
    return d?.instance?.state || d?.state || "desconhecido";
  } catch (e) {
    return "sem resposta do servidor";
  }
}

async function estadoMeta(phoneId: string): Promise<string> {
  try {
    const r = await fetch(`https://graph.facebook.com/${META_V}/${phoneId}?fields=status,quality_rating&access_token=${META_TOKEN}`,
      { signal: AbortSignal.timeout(15000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return `erro ${d?.error?.message || r.status}`.slice(0, 80);
    const q = d.quality_rating && d.quality_rating !== "GREEN" ? ` (qualidade ${d.quality_rating})` : "";
    return (d.status || "desconhecido") + q;
  } catch {
    return "sem resposta da Meta";
  }
}

async function mandarWhatsApp(instancia: string, texto: string): Promise<string | null> {
  try {
    const r = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${instancia}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number: NUMERO_AVISO, text: texto }), signal: AbortSignal.timeout(25000),
    });
    return r.ok ? null : `Evolution ${r.status}: ${(await r.text()).slice(0, 150)}`;
  } catch (e) {
    return `Evolution: ${String(e).slice(0, 150)}`;
  }
}

// WhatsApp oficial (Meta) da Castanho. Fora da conversa de 24h so vai modelo aprovado (aviso_sistema);
// se o modelo ainda nao estiver aprovado, tenta texto livre (so entrega se o Carlos escreveu nas ultimas 24h).
async function mandarMeta(phoneId: string, texto: string): Promise<string | null> {
  const url = `https://graph.facebook.com/${META_V}/${phoneId}/messages`;
  const h = { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" };
  // Parametro de modelo nao aceita quebra de linha nem 4+ espacos seguidos.
  const resumo = texto.replace(/^👁️ Vigia da cobrança \(OptiFlow\)\s*/, "").replace(/\s*\n+\s*/g, " | ").replace(/\s{4,}/g, " ").slice(0, 900);
  try {
    const r = await fetch(url, { method: "POST", headers: h, signal: AbortSignal.timeout(20000), body: JSON.stringify({
      messaging_product: "whatsapp", to: NUMERO_AVISO, type: "template",
      template: { name: "aviso_sistema", language: { code: "pt_BR" }, components: [{ type: "body", parameters: [
        { type: "text", text: "Carlos" }, { type: "text", text: resumo }] }] } }) });
    if (r.ok) return null;
    const erroModelo = (await r.text()).slice(0, 150);
    // Texto livre: a Meta aceita na hora mas so entrega dentro da conversa de 24h - por isso conta como falha
    // (quem chama manda tambem por e-mail).
    await fetch(url, { method: "POST", headers: h, signal: AbortSignal.timeout(20000), body: JSON.stringify({
      messaging_product: "whatsapp", to: NUMERO_AVISO, type: "text", text: { body: texto } }) }).catch(() => null);
    return `Meta modelo indisponivel (${erroModelo}); tentado texto livre`;
  } catch (e) {
    return `Meta: ${String(e).slice(0, 150)}`;
  }
}

async function mandarEmail(texto: string): Promise<string | null> {
  if (!RESEND_API_KEY) return "sem RESEND_API_KEY";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "OptiFlow <onboarding@resend.dev>", to: [EMAIL_AVISO], subject: "Vigia da cobrança - OptiFlow", text: texto }),
  });
  return r.ok ? null : `Resend ${r.status}`;
}

// Ordem do aviso (11/11/2026): 1) WhatsApp oficial da Castanho (Meta, modelo aviso_sistema). Se o modelo falhar,
// 2) texto livre na Meta + e-mail. So se a Meta nem existir: QR Code (Evolution) + e-mail.
// O QR Code nao e o primeiro porque as mensagens dele para o numero do Carlos chegam como "Aguardando mensagem".
const CASTANHO = "2ca58112-4498-4dfa-b6d1-550630d5c4a4";
async function avisar(dados: any, texto: string): Promise<{ canal: string; erro: string | null }> {
  const castanho = (dados.lojas || []).find((l: any) => l.id === CASTANHO);
  let erro: string | null = castanho?.wa_phone_id ? await mandarMeta(castanho.wa_phone_id, texto) : "sem WhatsApp oficial";
  if (!erro) return { canal: "whatsapp_meta", erro: null };
  if (!castanho?.wa_phone_id && dados.aviso?.instancia) {
    const e2 = await mandarWhatsApp(dados.aviso.instancia, texto);
    erro = e2 ? `${erro} | ${e2}` : erro;
  }
  const erroEmail = await mandarEmail(texto + `\n\n(WhatsApp oficial do aviso falhou: ${erro})`);
  return { canal: erroEmail ? "nenhum" : "email", erro: erroEmail ? `${erro} | ${erroEmail}` : erro };
}

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Nao autorizado" }), { status: 401 });
  }
  const simular = new URL(req.url).searchParams.get("simular") === "1";
  try {
    const dados = await db("rpc/vigia_cobranca_dados", { method: "POST", body: "{}" });
    // ?teste=1 -> manda so uma mensagem de teste para o numero do aviso (confere que o caminho do aviso funciona).
    if (new URL(req.url).searchParams.get("teste") === "1") {
      const r = await avisar(dados, "👁️ Vigia da cobrança (OptiFlow)\n\nMensagem de TESTE: o vigia está ligado. Você só vai receber mensagem daqui quando o robô parar, o WhatsApp de uma loja cair ou os erros de envio aumentarem.");
      return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
    }
    const estados: Record<string, any> = {};
    for (const e of (await db("vigia_estado?select=*")) || []) estados[e.chave] = e;

    const agora = new Date();
    // Na simulacao da para fingir outra hora (?hora=15) para testar os avisos do robo parado.
    const horaTeste = new URL(req.url).searchParams.get("hora");
    const hora = simular && horaTeste ? Number(horaTeste) : Number(dados.hora_manaus);
    const domingo = Number(dados.dia_semana) === 7;
    const avisos: string[] = [];          // linhas do aviso desta rodada
    const gravar: any[] = [];             // novos estados

    // Compara com o estado anterior. "ruim" = situacao com problema agora.
    // Avisa quando passa de bom para ruim, quando volta, e lembra a cada 24h enquanto continuar ruim.
    // primeiraVezSilencio: na primeira vez que ve algo (sem estado guardado) ja ruim, so guarda (ex.: loja que nunca conectou).
    function checar(chave: string, ruim: boolean, estado: string, textoRuim: string, textoVoltou: string, primeiraVezSilencio = false) {
      const ant = estados[chave];
      const antRuim = ant ? ant.estado !== "ok" : false;
      const novoEstado = ruim ? estado : "ok";
      let avisar: string | null = null;
      if (ruim && !ant && primeiraVezSilencio) avisar = null;
      else if (ruim && !antRuim) avisar = textoRuim;
      else if (!ruim && antRuim && ant) avisar = textoVoltou;
      else if (ruim && antRuim && ant?.ultimo_aviso &&
               agora.getTime() - new Date(ant.ultimo_aviso).getTime() > LEMBRETE_HORAS * 3600e3) avisar = textoRuim + " (continua)";
      if (avisar) avisos.push(avisar);
      if (!ant || ant.estado !== novoEstado || avisar) {
        gravar.push({ chave, estado: novoEstado,
          alterado_em: !ant || ant.estado !== novoEstado ? agora.toISOString() : ant.alterado_em,
          ultimo_aviso: avisar ? agora.toISOString() : (ant?.ultimo_aviso ?? null) });
      }
    }

    // 1. Robo parado
    if (!domingo && hora >= 14) {
      checar("robo:todas", Number(dados.envios_hoje_total) === 0, "parado",
        "🔴 Robô de cobrança: nenhuma mensagem registrada hoje em NENHUMA loja.",
        "🟢 Robô de cobrança voltou a enviar.");
    }
    if (hora >= 9 && hora <= 19) {
      const rr = dados.robo_rodadas_1h || {};
      const falhou = Number(rr.total) === 0 || Number(rr.falhas) > 0;
      checar("robo:rotina", falhou, "falhou",
        Number(rr.total) === 0 ? "🔴 A rotina do robô de cobrança NÃO rodou na última hora."
                               : `🔴 A rotina do robô de cobrança falhou ${rr.falhas}x na última hora.`,
        "🟢 A rotina do robô de cobrança voltou a rodar normalmente.");
    }

    const conexoes: Record<string, string> = {};
    for (const l of dados.lojas || []) {
      // 1b. Loja da cobranca nova sem nenhum envio hoje
      if (l.cobranca_nova && !domingo && hora >= 14) {
        checar(`robo:${l.id}`, Number(l.envios_hoje) === 0, "parado",
          `🔴 ${l.nome}: o robô não mandou nenhuma mensagem hoje.`,
          `🟢 ${l.nome}: o robô voltou a mandar mensagens.`);
      }
      // 2. Conexao do WhatsApp
      if (l.instancia) {
        const st = await estadoEvolution(l.instancia);
        conexoes[`${l.nome} (Evolution)`] = st;
        checar(`whatsapp:${l.id}:evolution`, st !== "open", st,
          `🔴 ${l.nome}: o WhatsApp (QR Code) caiu - situação "${st}". Reconectar em Configurações > Integrações > WhatsApp.`,
          `🟢 ${l.nome}: o WhatsApp (QR Code) voltou a conectar.`, true);
      }
      if (l.canal === "meta" && l.wa_phone_id) {
        const st = await estadoMeta(l.wa_phone_id);
        conexoes[`${l.nome} (Meta)`] = st;
        checar(`whatsapp:${l.id}:meta`, !st.startsWith("CONNECTED") || st.includes("qualidade"), st,
          `🔴 ${l.nome}: o WhatsApp oficial (Meta) está "${st}".`,
          `🟢 ${l.nome}: o WhatsApp oficial (Meta) voltou ao normal.`, true);
      }
      // 3. Erros aumentando
      const f = Number(l.falhas_2h), ok = Number(l.ok_2h);
      const muitosErros = (f >= 3 && f / Math.max(1, f + ok) >= 0.3) || Number(l.meta_falhas_2h) >= 3;
      checar(`erros:${l.id}`, muitosErros, "erros",
        `🟠 ${l.nome}: muitos erros de envio nas últimas 2h (${f} falhas, ${ok} ok${Number(l.meta_falhas_2h) ? `, ${l.meta_falhas_2h} falhas na Meta` : ""}).` +
          (l.erro_exemplo ? ` Exemplo: ${l.erro_exemplo}` : ""),
        `🟢 ${l.nome}: os erros de envio pararam.`);
    }

    // 4. "PAGUEI" esperando a loja conferir ha mais de 2 dias (cobranca nova). Lembra 1x por dia.
    const parados = (await db("rpc/vigia_paguei_parados", { method: "POST", body: "{}" })) || [];
    const comParado = new Set<string>();
    for (const p of parados) {
      comParado.add(p.tenant_id);
      checar(`paguei:${p.tenant_id}`, true, "parado",
        `🟠 ${p.loja}: ${p.qtd} cliente(s) disseram "PAGUEI" há mais de 2 dias e a loja ainda não conferiu (${String(p.nomes).slice(0, 200)}). Veja em Crediário > Respostas da cobrança.`,
        "");
    }
    for (const chave of Object.keys(estados)) {
      if (chave.startsWith("paguei:") && !comParado.has(chave.slice(7))) checar(chave, false, "ok", "", `🟢 Os "PAGUEI" pendentes foram conferidos.`);
    }

    let enviado: { canal: string; ok: boolean; erro?: string | null } | null = null;
    const texto = avisos.length ? `👁️ Vigia da cobrança (OptiFlow)\n\n${avisos.join("\n\n")}` : "";
    if (!simular) {
      if (texto) {
        const { canal, erro } = await avisar(dados, texto);
        enviado = { canal, ok: canal !== "nenhum", erro };
        await db("vigia_avisos", { method: "POST", body: JSON.stringify({ texto, canal, ok: canal !== "nenhum", erro }) });
      }
      if (gravar.length) {
        await db("vigia_estado?on_conflict=chave", {
          method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(gravar),
        });
      }
    }
    return new Response(JSON.stringify({ simular, hora_manaus: hora, avisos, conexoes, estados_novos: gravar, enviado }, null, 1),
      { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

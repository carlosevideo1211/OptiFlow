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

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") || "";

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
              meta_message_id: m.id || null,
              created_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
            }),
          });
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
        }
      }
    }
  } catch (e) {
    console.error("whatsapp-webhook erro:", String(e));
  }
  // Sempre 200: se devolver erro, a Meta fica reenviando a mesma notificacao.
  return new Response("ok");
});

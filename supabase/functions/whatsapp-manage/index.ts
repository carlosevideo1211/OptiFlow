import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") || "https://evolution.visionproerp.com.br";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

async function evolutionFetch(path: string, method: string, body?: unknown) {
  const res = await fetch(`${EVOLUTION_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function decodeJwtPayload(token: string): any {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(base64);
  return JSON.parse(json);
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);

    let payload: any;
    try {
      payload = decodeJwtPayload(token);
    } catch {
      return json({ error: "token inválido" }, 401);
    }
    const userId = payload.sub;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const profiles = await supabaseFetch(`user_profiles?id=eq.${userId}&select=id,tenant_id,role,full_name`);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile || !profile.tenant_id) return json({ error: "perfil não encontrado" }, 403);

    const body = await req.json().catch(() => ({ action: "status" }));
    const { action } = body;

    const tenants = await supabaseFetch(`tenants?id=eq.${profile.tenant_id}&select=id,company_name,whatsapp_instance_name`);
    const tenant = Array.isArray(tenants) ? tenants[0] : null;
    if (!tenant) return json({ error: "ótica não encontrada" }, 404);

    // ---------- STATUS ----------
    if (action === "status") {
      if (!tenant.whatsapp_instance_name) {
        return json({ connected: false, instance: null });
      }
      const r = await evolutionFetch(`/instance/connectionState/${tenant.whatsapp_instance_name}`, "GET");
      const state = r.data?.instance?.state || r.data?.state;
      return json({ connected: state === "open", instance: tenant.whatsapp_instance_name, state: state || "desconhecido" });
    }

    // ---------- CHECK_NUMBER ----------
    if (action === "check_number") {
      const numero = String(body.phone || "").replace(/\D/g, "");
      if (!numero || numero.length < 10) {
        return json({ checked: false, reason: "numero_invalido" });
      }
      if (!tenant.whatsapp_instance_name) {
        return json({ checked: false, reason: "sem_instancia" });
      }
      const numeroCompleto = numero.startsWith("55") ? numero : `55${numero}`;
      const r = await evolutionFetch(`/chat/whatsappNumbers/${tenant.whatsapp_instance_name}`, "POST", { numbers: [numeroCompleto] });
      const item = Array.isArray(r.data) ? r.data[0] : (Array.isArray(r.data?.[0]) ? r.data[0][0] : r.data);
      const exists = item?.exists === true;
      return json({ checked: true, exists, jid: item?.jid || null });
    }

    // ---------- SEND_COLLECTION (cobranca manual — parcela vencida ha 30+
    // dias. Qualquer usuario logado do tenant pode disparar; nao exige
    // ser master, pois e uma acao operacional do dia a dia). ----------
    if (action === "send_collection") {
      const numero = String(body.phone || "").replace(/\D/g, "");
      if (!numero) return json({ ok: false, error: "cliente sem WhatsApp cadastrado" }, 400);
      if (!tenant.whatsapp_instance_name) return json({ ok: false, error: "WhatsApp nao conectado nesta ótica" }, 400);

      const nome = String(body.customer_name || "cliente");
      const valor = Number(body.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const venc = body.due_date ? new Date(body.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "";
      const loja = tenant.company_name || "nossa loja";

      const texto = `Olá, ${nome}. Este é um lembrete importante da ${loja}: identificamos uma parcela em atraso no valor de ${valor}, com vencimento em ${venc}. Pedimos que regularize o quanto antes para evitar transtornos. Qualquer dúvida ou para negociar, estamos à disposição por aqui.`;

      const numeroCompleto = numero.startsWith("55") ? numero : `55${numero}`;
      const r = await evolutionFetch(`/message/sendText/${tenant.whatsapp_instance_name}`, "POST", { number: numeroCompleto, text: texto });

      // Registra no mesmo log das cobrancas automaticas, marcado como manual,
      // para a tela de controle mostrar um historico unico por parcela.
      // Usa upsert (on_conflict) em vez de insert simples: se essa mesma
      // parcela ja foi cobrada manualmente antes, atualiza a data e o
      // resultado em vez de tentar criar um segundo registro, que erraria
      // contra a regra de unicidade (tenant_id, trigger_type, reference_id).
      if (body.parcela_id) {
        await supabaseFetch("whatsapp_triggers_log?on_conflict=tenant_id,trigger_type,reference_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            tenant_id: tenant.id,
            trigger_type: "cobranca_manual",
            reference_id: String(body.parcela_id),
            customer_id: body.customer_id || null,
            phone: numeroCompleto,
            success: r.ok,
            error_message: r.ok ? null : `HTTP ${r.status}`,
            sent_at: new Date().toISOString(),
          }),
        });
      }

      if (!r.ok) return json({ ok: false, error: `Falha ao enviar: HTTP ${r.status}`, detalhe: r.data }, 500);
      return json({ ok: true });
    }

    if (action === "log_manual_local") {
      // Registra que o usuario clicou no botao de abrir o WhatsApp Web/app
      // manualmente (nao via robo). O sistema nao tem como confirmar que a
      // mensagem foi de fato enviada dentro do WhatsApp, mas registra a
      // intencao com data, que e o que foi pedido: ter um historico de quando
      // essa cobranca "local" foi feita.
      //
      // Usa upsert (on_conflict) em vez de insert simples: a tabela tem uma
      // regra de unicidade por (tenant_id, trigger_type, reference_id), entao
      // clicar de novo no botao para a mesma parcela atualiza a data do
      // registro existente em vez de tentar criar um duplicado (que erraria).
      if (!body.parcela_id) return json({ ok: false, error: "parcela_id obrigatorio" }, 400);
      const numero = String(body.phone || "").replace(/\D/g, "");
      const logResult = await supabaseFetch("whatsapp_triggers_log?on_conflict=tenant_id,trigger_type,reference_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          tenant_id: tenant.id,
          trigger_type: "cobranca_manual_local",
          reference_id: String(body.parcela_id),
          customer_id: body.customer_id || null,
          phone: numero ? (numero.startsWith("55") ? numero : `55${numero}`) : null,
          success: true,
          error_message: null,
          sent_at: new Date().toISOString(),
        }),
      });
      if (!Array.isArray(logResult) || logResult.length === 0) {
        return json({ ok: false, error: "falha ao salvar no historico", detalhe: logResult }, 500);
      }
      return json({ ok: true });
    }

    // A partir daqui, só o Dono (master) pode alterar a conexão
    if (profile.role !== "master") {
      return json({ error: "apenas o dono da ótica pode gerenciar o WhatsApp" }, 403);
    }

    // ---------- CONNECT ----------
    if (action === "connect") {
      let instanceName = tenant.whatsapp_instance_name;

      if (!instanceName) {
        instanceName = `optiflow-${tenant.id}`;
        const created = await evolutionFetch("/instance/create", "POST", {
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        });
        if (!created.ok) {
          return json({ error: "falha ao criar instância no WhatsApp", detalhe: created.data }, 500);
        }
        await supabaseFetch(`tenants?id=eq.${tenant.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ whatsapp_instance_name: instanceName }),
        });
        const qrcode = created.data?.qrcode;
        if (qrcode?.base64) {
          return json({ instance: instanceName, qrcode: qrcode.base64 });
        }
      }

      const r = await evolutionFetch(`/instance/connect/${instanceName}`, "GET");
      const qrcode = r.data?.base64 || r.data?.qrcode?.base64;
      if (!qrcode) {
        return json({ error: "QR Code ainda não disponível, tente novamente em alguns segundos", detalhe: r.data }, 202);
      }
      return json({ instance: instanceName, qrcode });
    }

    // ---------- DISCONNECT ----------
    if (action === "disconnect") {
      if (!tenant.whatsapp_instance_name) return json({ error: "nenhuma instância conectada" }, 400);
      await evolutionFetch(`/instance/logout/${tenant.whatsapp_instance_name}`, "DELETE");
      return json({ ok: true });
    }

    return json({ error: "ação desconhecida" }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
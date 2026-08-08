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

    const { action, phone: numeroParaChecar } = await req.json().catch(() => ({ action: "status" }));

    const tenants = await supabaseFetch(`tenants?id=eq.${profile.tenant_id}&select=id,company_name,whatsapp_instance_name`);
    const tenant = Array.isArray(tenants) ? tenants[0] : null;
    if (!tenant) return json({ error: "ótica não encontrada" }, 404);

    // ---------- STATUS (qualquer usuário logado pode consultar) ----------
    if (action === "status") {
      if (!tenant.whatsapp_instance_name) {
        return json({ connected: false, instance: null });
      }
      const r = await evolutionFetch(`/instance/connectionState/${tenant.whatsapp_instance_name}`, "GET");
      const state = r.data?.instance?.state || r.data?.state;
      return json({ connected: state === "open", instance: tenant.whatsapp_instance_name, state: state || "desconhecido" });
    }

    // ---------- CHECK_NUMBER (qualquer usuário logado — verifica se um
    // número tem WhatsApp ativo, sem enviar nenhuma mensagem. Usado no
    // cadastro de cliente para preencher o campo WhatsApp sozinho). ----------
    if (action === "check_number") {
      const numero = String(numeroParaChecar || "").replace(/\D/g, "");
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

    // A partir daqui, só o Dono (master) pode alterar a conexão
    if (profile.role !== "master") {
      return json({ error: "apenas o dono da ótica pode gerenciar o WhatsApp" }, 403);
    }

    // ---------- CONNECT (cria a instância se não existir, devolve QR Code) ----------
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
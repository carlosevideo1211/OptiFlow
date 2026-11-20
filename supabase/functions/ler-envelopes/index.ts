// Lê a foto dos envelopes de lentes para o ESTOQUE DO LABORATÓRIO (20/11/2026, pedido do Carlos: "envio as fotos das
// lentes, informo para onde vai e o sistema organiza"). A tela manda a foto; aqui conferimos que é o dono da loja e
// repassamos ao leitor do Centofin (o mesmo da antiga reposição pelo WhatsApp), com a chave da integração da loja
// (store_settings.centofin_chave). Só lê: quem grava o envio é a tela, depois que o dono confere e confirma.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function rest(caminho: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  return r.ok ? await r.json() : [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Entre no sistema de novo." }, 401);
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
    const user = u.ok ? await u.json().catch(() => null) : null;
    if (!user?.id) return json({ error: "Entre no sistema de novo." }, 401);
    const [perfil] = await rest(`user_profiles?id=eq.${user.id}&select=tenant_id,role`);
    if (!perfil?.tenant_id || !["master", "system_admin"].includes(perfil.role)) return json({ error: "Só o dono da conta." }, 403);
    const [loja] = await rest(`store_settings?tenant_id=eq.${perfil.tenant_id}&select=centofin_url,centofin_chave`);
    if (!loja?.centofin_chave) return json({ error: "A loja não está ligada ao Centofin (o leitor de fotos fica lá)." }, 400);

    const body = await req.json().catch(() => ({}));
    if (!body?.imagem) return json({ error: "Sem foto." }, 400);
    const r = await fetch(`${(loja.centofin_url || "https://mei.centofin.com.br").replace(/\/$/, "")}/api/integracao/optiflow/ler-envelopes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loja.centofin_chave}` },
      body: JSON.stringify({ imagem: body.imagem, mime: body.mime || "image/jpeg", envelopes: +body.envelopes || 0 }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: d?.detail || `O leitor respondeu ${r.status}.` }, 502);
    return json(d);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

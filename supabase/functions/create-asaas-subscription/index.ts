import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Cobranca da PROPRIA OptiFlow ao inquilino, via Pix Automatico da Asaas.
// Nao confundir com supabase/functions/create-boleto: aquela function usa a
// chave Asaas do PROPRIO inquilino (configurada em Configuracoes > Integracoes)
// para ele cobrar OS CLIENTES DELE. Aqui usamos a chave Asaas da PLATAFORMA
// (OptiFlow) para cobrar o inquilino pela mensalidade do sistema.

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const PLANO_VALOR = 99.99;
const PLANO_DESCRICAO = "Assinatura OptiFlow";

// Confere se quem esta chamando e um usuario realmente autenticado no Supabase
// e devolve o id dele (para depois conferir se pertence ao tenant informado).
async function usuarioAutenticado(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.id || null;
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
  if (res.status === 204) return null;
  return res.json();
}

serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const userId = await usuarioAutenticado(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Nao autenticado" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { tenant_id } = await req.json();
    if (!tenant_id) throw new Error("tenant_id obrigatorio");

    // So deixa criar assinatura para o PROPRIO tenant do usuario logado
    // (evita que um inquilino crie/veja a autorizacao de outro).
    const perfis = await supabaseFetch(`user_profiles?id=eq.${userId}&select=tenant_id`);
    const perfil = Array.isArray(perfis) ? perfis[0] : null;
    if (!perfil || perfil.tenant_id !== tenant_id) {
      return new Response(JSON.stringify({ error: "Sem permissao para este inquilino" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const ASAAS_ENV = Deno.env.get("ASAAS_PLATFORM_ENV") || "sandbox";
    const ASAAS_KEY = ASAAS_ENV === "production"
      ? (Deno.env.get("ASAAS_API_KEY_PROD") || "")
      : (Deno.env.get("ASAAS_API_KEY_TEST") || "");
    if (!ASAAS_KEY) throw new Error("Chave Asaas da plataforma nao configurada (ASAAS_API_KEY_TEST/ASAAS_API_KEY_PROD)");
    const BASE = ASAAS_ENV === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";
    const asaasHeaders = { access_token: ASAAS_KEY, "Content-Type": "application/json" };

    const tenantsRows = await supabaseFetch(
      `tenants?id=eq.${tenant_id}&select=id,company_name,email,asaas_customer_id,asaas_authorization_id`
    );
    const tenant = Array.isArray(tenantsRows) ? tenantsRows[0] : null;
    if (!tenant) throw new Error("Inquilino nao encontrado");

    // CNPJ/CPF do inquilino: reaproveita o campo ja preenchido em
    // Configuracoes > Dados da Loja (store_settings.cnpj), nao pedimos de novo.
    const settingsRows = await supabaseFetch(
      `store_settings?tenant_id=eq.${tenant_id}&select=name,cnpj,email,phone`
    );
    const settings = Array.isArray(settingsRows) ? settingsRows[0] : null;
    const documento = (settings?.cnpj || "").replace(/[^0-9]/g, "");
    if (!documento || documento.length < 11) {
      throw new Error("CPF/CNPJ nao cadastrado. Preencha em Configuracoes > Dados da Loja antes de assinar.");
    }
    const nomeCliente = settings?.name || tenant.company_name;
    const emailCliente = settings?.email || tenant.email;
    const telefoneCliente = settings?.phone || undefined;

    // Se ja existe uma autorizacao ativa/pendente para este tenant, devolve
    // ela em vez de criar outra (idempotencia ao clicar de novo/recarregar).
    if (tenant.asaas_authorization_id) {
      const checkRes = await fetch(`${BASE}/pix/automatic/authorizations/${tenant.asaas_authorization_id}`, {
        headers: asaasHeaders,
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData?.status && !["CANCELLED", "REFUSED", "EXPIRED"].includes(checkData.status)) {
          return new Response(JSON.stringify({
            authorization_id: checkData.id,
            status: checkData.status,
            qr_payload: checkData.payload || checkData?.immediateQrCode?.payload || null,
            qr_image: checkData.encodedImage || checkData?.immediateQrCode?.encodedImage || null,
            ja_existente: true,
          }), { headers: { ...cors, "Content-Type": "application/json" } });
        }
      }
    }

    // Reaproveita cliente Asaas existente (guardado ou por documento) ou cria um novo.
    let asaasCustomerId = tenant.asaas_customer_id;
    if (!asaasCustomerId) {
      const searchRes = await fetch(`${BASE}/customers?cpfCnpj=${documento}`, { headers: asaasHeaders });
      const searchData = await searchRes.json();
      asaasCustomerId = searchData?.data?.[0]?.id;
      if (!asaasCustomerId) {
        const createRes = await fetch(`${BASE}/customers`, {
          method: "POST",
          headers: asaasHeaders,
          body: JSON.stringify({
            name: nomeCliente,
            cpfCnpj: documento,
            email: emailCliente || undefined,
            phone: telefoneCliente,
            externalReference: tenant_id,
          }),
        });
        const createData = await createRes.json();
        asaasCustomerId = createData?.id;
        if (!asaasCustomerId) throw new Error("Erro ao criar cliente no Asaas: " + JSON.stringify(createData));
      }
    }

    const contractId = String(tenant_id).replace(/-/g, "");
    const hoje = new Date().toISOString().split("T")[0];

    const authRes = await fetch(`${BASE}/pix/automatic/authorizations`, {
      method: "POST",
      headers: asaasHeaders,
      body: JSON.stringify({
        customerId: asaasCustomerId,
        frequency: "MONTHLY",
        contractId,
        startDate: hoje,
        value: PLANO_VALOR,
        description: PLANO_DESCRICAO,
        immediateQrCode: {
          paymentCreationMode: "SUBSCRIPTION",
          retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
        },
      }),
    });
    const authData = await authRes.json();
    if (!authData?.id) throw new Error("Erro ao criar autorizacao Pix Automatico: " + JSON.stringify(authData));

    await supabaseFetch(`tenants?id=eq.${tenant_id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ asaas_customer_id: asaasCustomerId, asaas_authorization_id: authData.id }),
    });

    await supabaseFetch(`asaas_subscriptions`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        tenant_id,
        asaas_customer_id: asaasCustomerId,
        asaas_authorization_id: authData.id,
        contract_id: contractId,
        status: authData.status || "PENDING",
        frequency: "MONTHLY",
        value: PLANO_VALOR,
      }),
    });

    return new Response(JSON.stringify({
      authorization_id: authData.id,
      status: authData.status || "PENDING",
      qr_payload: authData.payload || authData?.immediateQrCode?.payload || null,
      qr_image: authData.encodedImage || authData?.immediateQrCode?.encodedImage || null,
      // Envia a resposta crua junto: se os campos acima vierem vazios, isso
      // mostra no console do navegador (F12) o formato real devolvido pela
      // Asaas, pra ajustar rapido o nome do campo sem precisar redeployar.
      debug_raw: (!authData.payload && !authData?.immediateQrCode?.payload) ? authData : undefined,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Cobranca da PROPRIA OptiFlow ao inquilino, via Pix Automatico da Asaas.
// Nao confundir com supabase/functions/create-boleto: aquela function usa a
// chave Asaas do PROPRIO inquilino (configurada em Configuracoes > Integracoes)
// para ele cobrar OS CLIENTES DELE. Aqui usamos a chave Asaas da PLATAFORMA
// (OptiFlow) para cobrar o inquilino pela mensalidade do sistema.

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Dois planos, dependendo de quais modulos o inquilino tem liberados
// (tenants.modulo_otica_ativo): quem tem a Otica liberada paga o plano
// completo (Otica + Consultas/Rx); quem so tem Consultas/Rx (ex: Samara)
// paga o plano menor. modulo_otica_ativo e NOT NULL DEFAULT true no banco,
// mas seguimos o mesmo padrao defensivo usado no Shell.tsx (!== false)
// para o caso de vir null por algum motivo.
const PLANO_OTICA_VALOR = 99.99;
const PLANO_OTICA_DESCRICAO = "Assinatura OptiFlow - Otica + Consultas/Rx";
const PLANO_CONSULTORIO_VALOR = 49.99;
const PLANO_CONSULTORIO_DESCRICAO = "Assinatura OptiFlow - Consultas/Rx";

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

// Chama a API da Asaas e le a resposta de um jeito seguro: a Asaas às vezes
// devolve corpo vazio (em erros 401/403/5xx, por exemplo), e usar res.json()
// direto nesses casos quebra com "Unexpected end of JSON input" sem mostrar
// o status HTTP real nem motivo do erro. Aqui a gente sempre le como texto
// primeiro e so tenta converter pra JSON se tiver algo escrito.
async function chamarAsaas(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const texto = await res.text();
  let corpo: any = null;
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = { _resposta_nao_json: texto };
    }
  }
  return { ok: res.ok, status: res.status, body: corpo };
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
      `tenants?id=eq.${tenant_id}&select=id,company_name,email,asaas_customer_id,asaas_authorization_id,modulo_otica_ativo`
    );
    const tenant = Array.isArray(tenantsRows) ? tenantsRows[0] : null;
    if (!tenant) throw new Error("Inquilino nao encontrado");

    const temOtica = tenant.modulo_otica_ativo !== false;
    const PLANO_VALOR = temOtica ? PLANO_OTICA_VALOR : PLANO_CONSULTORIO_VALOR;
    const PLANO_DESCRICAO = temOtica ? PLANO_OTICA_DESCRICAO : PLANO_CONSULTORIO_DESCRICAO;

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
      const check = await chamarAsaas(`${BASE}/pix/automatic/authorizations/${tenant.asaas_authorization_id}`, {
        headers: asaasHeaders,
      });
      if (check.ok && check.body) {
        const checkData = check.body;
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
      const search = await chamarAsaas(`${BASE}/customers?cpfCnpj=${documento}`, { headers: asaasHeaders });
      if (!search.ok) throw new Error(`Erro ao buscar cliente no Asaas (HTTP ${search.status}): ` + JSON.stringify(search.body));
      asaasCustomerId = search.body?.data?.[0]?.id;
      if (!asaasCustomerId) {
        const create = await chamarAsaas(`${BASE}/customers`, {
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
        asaasCustomerId = create.body?.id;
        if (!asaasCustomerId) throw new Error(`Erro ao criar cliente no Asaas (HTTP ${create.status}): ` + JSON.stringify(create.body));
      }
    }

    const contractId = String(tenant_id).replace(/-/g, "");
    const hoje = new Date().toISOString().split("T")[0];

    const auth = await chamarAsaas(`${BASE}/pix/automatic/authorizations`, {
      method: "POST",
      headers: asaasHeaders,
      body: JSON.stringify({
        customerId: asaasCustomerId,
        frequency: "MONTHLY",
        contractId,
        startDate: hoje,
        value: PLANO_VALOR,
        description: PLANO_DESCRICAO,
        // IMPORTANTE: paymentCreationMode e retryPolicy ficam no NIVEL RAIZ
        // do corpo, e nao dentro de immediateQrCode (confirmado na doc oficial
        // da Asaas e validado manualmente em producao antes deste codigo
        // existir). Se ficarem dentro de immediateQrCode, a Asaas pode
        // ignorar esses campos e usar o padrao (paymentCreationMode: MANUAL),
        // o que faria a autorizacao ativar mas NUNCA gerar as cobrancas
        // mensais seguintes sozinha.
        paymentCreationMode: "SUBSCRIPTION",
        retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
        immediateQrCode: {
          // originalValue: valor da PRIMEIRA cobranca, a que ativa a
          // autorizacao via QR Code (documentado em immediateQrCode.originalValue).
          // E diferente do "value" la em cima, que e o valor das cobrancas
          // recorrentes seguintes - aqui e o mesmo valor do plano nos dois,
          // pois a primeira cobranca tambem e a mensalidade normal (R$ 99,99).
          originalValue: PLANO_VALOR,
          // Tempo (em segundos) que o QR Code da cobranca imediata fica
          // valido. 86400 = 24 horas (1 hora era curto demais: se o
          // inquilino demorar a pagar, o QR expira, a Asaas cancela a
          // autorizacao pelo webhook e ele volta pra tela de assinar de novo).
          expirationSeconds: 86400,
        },
      }),
    });
    const authData = auth.body;
    if (!auth.ok || !authData?.id) throw new Error(`Erro ao criar autorizacao Pix Automatico (HTTP ${auth.status}): ` + JSON.stringify(authData));

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

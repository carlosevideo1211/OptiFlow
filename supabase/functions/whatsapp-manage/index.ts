import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ---------- EVOLUTION / BAILEYS (canal nao-oficial, mais barato) ----------
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") || "https://evolution.visionproerp.com.br";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

// ---------- META CLOUD API (canal oficial, premium) ----------
// Versao da Graph API da Meta. Pode ser trocada via env sem redeploy caso a
// Meta aposente essa versao no futuro.
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

// Token de acesso da Meta Cloud API (usuario de sistema "OptiFlow
// Integração"). MORA SÓ AQUI, como secret do backend — nunca em
// store_settings nem em nenhuma tela de tenant. Motivo: esse token da acesso
// a mandar mensagem por QUALQUER numero de WhatsApp atribuido ao mesmo
// usuario de sistema (nao so o de um tenant), entao guarda-lo numa tabela
// visivel/editavel por um Master de tenant seria um vazamento entre
// inquilinos. E o MESMO token pra todos os tenants no canal Meta; o que muda
// por tenant e so o Phone ID (esse sim continua em store_settings, pois
// sozinho ele nao da acesso a nada).
const META_WHATSAPP_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") || "";

// Nomes dos modelos (templates) cadastrados no WhatsApp Manager da Meta.
// IMPORTANTE: trocar pelos nomes EXATOS que ficaram registrados depois da
// aprovacao, se forem diferentes dos sugeridos em modelos_whatsapp_meta.md.
const TEMPLATE_COBRANCA_ATRASO = "cobranca_atraso";
const TEMPLATE_AVISO_NEGATIVACAO = "aviso_negativacao";
const TEMPLATE_NEGOCIACAO_DEBITO_ANTIGO = "negociacao_debito_antigo";

// ---------- Dois canais, um tipo comum ----------
// Qual canal cada otica usa fica em tenants.whatsapp_canal ('evolution' ou
// 'meta'), controlado so pelo Carlos (master do sistema) — nao existe tela
// para o dono da otica escolher. Ver migration whatsapp_canal.sql.
type CanalInfo =
  | { canal: "evolution"; instance: string }
  | { canal: "meta"; phoneId: string; token: string };

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

async function sendWhatsAppMessageEvolution(instanceName: string, phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const cleanPhone = phone.replace(/\D/g, "");
  const number = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
  const r = await evolutionFetch(`/message/sendText/${instanceName}`, "POST", { number, text });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}: ${JSON.stringify(r.data)}` };
  return { ok: true };
}

// Manda uma mensagem de MODELO (template) pela Meta Cloud API. Diferente do
// Evolution/Baileys, a Meta NAO deixa mandar texto livre quando e a loja que
// inicia a conversa — so mensagens de template pre-aprovadas (ver
// modelos_whatsapp_meta.md). "params" preenche {{1}}, {{2}}, {{3}}... do
// corpo do modelo, NA ORDEM em que aparecem no texto aprovado.
async function sendWhatsAppTemplateMeta(
  phoneId: string,
  token: string,
  phone: string,
  templateName: string,
  params: string[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const to = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    const res = await fetch(`${META_GRAPH_BASE}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: "pt_BR" },
          components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }],
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Ponto unico de envio: recebe o canal ja resolvido para este tenant e as
// duas versoes da mensagem (texto livre para Evolution, nome+parametros do
// modelo para Meta) e manda pelo canal certo. Mantido num so lugar para nao
// espalhar "if (canal === 'meta')" por cada acao.
async function enviarMensagem(
  canalInfo: CanalInfo,
  telefone: string,
  opts: { texto: string; templateName: string; templateParams: string[] }
): Promise<{ ok: boolean; error?: string }> {
  if (canalInfo.canal === "meta") {
    return sendWhatsAppTemplateMeta(canalInfo.phoneId, canalInfo.token, telefone, opts.templateName, opts.templateParams);
  }
  return sendWhatsAppMessageEvolution(canalInfo.instance, telefone, opts.texto);
}

// Confere se quem esta chamando e um usuario realmente autenticado no Supabase
// (valida a assinatura do token de verdade, perguntando pro proprio Supabase
// quem e o dono dele) e devolve o id.
async function usuarioAutenticado(token: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
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
  return res.json();
}

// Busca o Phone ID desta otica (tela Configuração > Integrações,
// store_settings.wa_phone_id). O Token NAO vem mais daqui — ver
// META_WHATSAPP_TOKEN acima.
async function credenciaisMeta(tenantId: string): Promise<{ phoneId: string; token: string } | null> {
  if (!META_WHATSAPP_TOKEN) return null;
  const rows = await supabaseFetch(`store_settings?tenant_id=eq.${tenantId}&select=wa_phone_id`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.wa_phone_id) return null;
  return { phoneId: row.wa_phone_id, token: META_WHATSAPP_TOKEN };
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
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);

    const userId = await usuarioAutenticado(token);
    if (!userId) return json({ error: "token inválido" }, 401);

    const profiles = await supabaseFetch(`user_profiles?id=eq.${userId}&select=id,tenant_id,role,full_name`);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile || !profile.tenant_id) return json({ error: "perfil não encontrado" }, 403);

    const body = await req.json().catch(() => ({ action: "status" }));
    const { action } = body;

    const tenants = await supabaseFetch(
      `tenants?id=eq.${profile.tenant_id}&select=id,company_name,whatsapp_instance_name,spc_serasa_ativo,whatsapp_canal`
    );
    const tenant = Array.isArray(tenants) ? tenants[0] : null;
    if (!tenant) return json({ error: "ótica não encontrada" }, 404);

    const usaMeta = tenant.whatsapp_canal === "meta";

    // ---------- STATUS ----------
    if (action === "status") {
      if (usaMeta) {
        const cred = await credenciaisMeta(tenant.id);
        if (!cred) return json({ connected: false, instance: null, canal: "meta" });
        const r = await fetch(`${META_GRAPH_BASE}/${cred.phoneId}?fields=display_phone_number,verified_name`, {
          headers: { Authorization: `Bearer ${cred.token}` },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          return json({ connected: false, instance: cred.phoneId, canal: "meta", error: data?.error?.message || "credenciais inválidas" });
        }
        return json({ connected: true, instance: cred.phoneId, canal: "meta", numero: data?.display_phone_number, nome_verificado: data?.verified_name });
      }
      if (!tenant.whatsapp_instance_name) {
        return json({ connected: false, instance: null, canal: "evolution" });
      }
      const r = await evolutionFetch(`/instance/connectionState/${tenant.whatsapp_instance_name}`, "GET");
      const state = r.data?.instance?.state || r.data?.state;
      return json({ connected: state === "open", instance: tenant.whatsapp_instance_name, canal: "evolution", state: state || "desconhecido" });
    }

    // ---------- CHECK_NUMBER ----------
    if (action === "check_number") {
      const numero = String(body.phone || "").replace(/\D/g, "");
      if (!numero || numero.length < 10) {
        return json({ checked: false, reason: "numero_invalido" });
      }
      if (usaMeta) {
        // A Meta Cloud API oficial NAO tem um endpoint pra "perguntar antes"
        // se um numero tem WhatsApp — isso so existia no Evolution/Baileys.
        return json({ checked: true, exists: true, aviso: "Meta Cloud API não permite checar previamente; validade só é confirmada no envio." });
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
    // dias. Qualquer usuario logado do tenant pode disparar; nao exige ser
    // master, pois e uma acao operacional do dia a dia). ----------
    if (action === "send_collection") {
      const numero = String(body.phone || "").replace(/\D/g, "");
      if (!numero) return json({ ok: false, error: "cliente sem WhatsApp cadastrado" }, 400);

      let canalInfo: CanalInfo;
      if (usaMeta) {
        const cred = await credenciaisMeta(tenant.id);
        if (!cred) return json({ ok: false, error: "WhatsApp Business API não configurado nesta ótica" }, 400);
        canalInfo = { canal: "meta", phoneId: cred.phoneId, token: cred.token };
      } else {
        if (!tenant.whatsapp_instance_name) return json({ ok: false, error: "WhatsApp nao conectado nesta ótica" }, 400);
        canalInfo = { canal: "evolution", instance: tenant.whatsapp_instance_name };
      }

      const nome = String(body.customer_name || "cliente");
      const valor = Number(body.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const venc = body.due_date ? new Date(body.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "";
      const loja = tenant.company_name || "nossa loja";

      // dividaAntiga: o botao manual detectou (no frontend) que essa parcela
      // faz parte de um debito com mais de 1 ano do MESMO cliente. Nesse caso
      // o valor/venc recebidos ja vem consolidados (soma de todas as parcelas
      // antigas do cliente, vencimento mais antigo entre elas) e a
      // mensagem/registro usam o mesmo padrao da Secao 6 de
      // send-whatsapp-triggers/index.ts (aviso_negativacao /
      // negociacao_debito_antigo), em vez do texto/modelo generico de
      // cobranca de uma parcela so.
      const dividaAntiga = body.divida_antiga === true;
      const PRAZO_NEGATIVACAO_DIAS = 10;
      let texto: string;
      let templateName: string;
      let templateParams: string[];
      let triggerType = "cobranca_manual";
      let referenceId = String(body.parcela_id);

      if (dividaAntiga) {
        const qtd = Number(body.qtd_parcelas || 1);
        const parcelasTxt = qtd === 1 ? "1 parcela" : `${qtd} parcelas`;
        triggerType = tenant.spc_serasa_ativo ? "aviso_negativacao" : "negociacao_debito_antigo";
        referenceId = String(body.customer_id || body.parcela_id);
        if (tenant.spc_serasa_ativo) {
          texto = `Prezado(a) ${nome}, a ${loja} informa que consta em nosso sistema um débito em aberto de ${parcelasTxt} (a mais antiga vencida em ${venc}), totalizando ${valor}. Solicitamos a regularização no prazo de ${PRAZO_NEGATIVACAO_DIAS} dias corridos a partir desta mensagem. Caso o pagamento não seja identificado até essa data, seu nome será incluído nos órgãos de proteção ao crédito (SPC/Serasa), conforme previsto em contrato e na legislação vigente. Para negociar ou tirar dúvidas, entre em contato conosco.`;
          templateName = TEMPLATE_AVISO_NEGATIVACAO;
          templateParams = [nome, loja, parcelasTxt, venc, valor, String(PRAZO_NEGATIVACAO_DIAS)];
        } else {
          texto = `Olá, ${nome}! Aqui é da ${loja}. Identificamos que seu débito conosco está em aberto há mais de um ano (${parcelasTxt}, a mais antiga vencida em ${venc}), totalizando ${valor}. Gostaríamos muito de resolver isso da melhor forma pra você — temos condições especiais de parcelamento pra regularizar. Pode nos chamar aqui mesmo ou ligar na loja pra conversarmos?`;
          templateName = TEMPLATE_NEGOCIACAO_DEBITO_ANTIGO;
          templateParams = [nome, loja, parcelasTxt, venc, valor];
        }
      } else {
        texto = `Olá, ${nome}. Este é um lembrete importante da ${loja}: identificamos uma parcela em atraso no valor de ${valor}, com vencimento em ${venc}. Pedimos que regularize o quanto antes para evitar transtornos. Qualquer dúvida ou para negociar, estamos à disposição por aqui.`;
        templateName = TEMPLATE_COBRANCA_ATRASO;
        templateParams = [nome, loja, valor, venc];
      }

      const numeroCompleto = numero.startsWith("55") ? numero : `55${numero}`;
      const r = await enviarMensagem(canalInfo, numeroCompleto, { texto, templateName, templateParams });

      // Registra no mesmo log das cobrancas automaticas, marcado como manual,
      // para a tela de controle mostrar um historico unico por parcela. Usa
      // upsert (on_conflict) em vez de insert simples: se essa mesma parcela
      // ja foi cobrada manualmente antes, atualiza a data e o resultado em
      // vez de tentar criar um segundo registro, que erraria contra a regra
      // de unicidade (tenant_id, trigger_type, reference_id).
      if (body.parcela_id || referenceId) {
        await supabaseFetch("whatsapp_triggers_log?on_conflict=tenant_id,trigger_type,reference_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            tenant_id: tenant.id,
            trigger_type: triggerType,
            reference_id: referenceId,
            customer_id: body.customer_id || null,
            phone: numeroCompleto,
            success: r.ok,
            error_message: r.ok ? null : r.error,
            sent_at: new Date().toISOString(),
          }),
        });
      }

      if (!r.ok) return json({ ok: false, error: `Falha ao enviar: ${r.error}` }, 500);
      return json({ ok: true });
    }

    if (action === "log_manual_local") {
      // Registra que o usuario clicou no botao de abrir o WhatsApp Web/app
      // manualmente (nao via robo). Identico nos dois canais — nao depende
      // de Evolution nem de Meta.
      if (!body.parcela_id) return json({ ok: false, error: "parcela_id obrigatorio" }, 400);
      const numero = String(body.phone || "").replace(/\D/g, "");
      const logResult = await supabaseFetch("whatsapp_triggers_log?on_conflict=tenant_id,trigger_type,reference_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          tenant_id: tenant.id,
          trigger_type: body.trigger_type || "cobranca_manual_local",
          reference_id: String(body.reference_id || body.parcela_id),
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
      if (usaMeta) {
        // Nao existe QR Code no canal Meta — a "conexao" e o Phone ID +
        // Token (secret global) estarem validos. So confirmamos que
        // funcionam de verdade, chamando a Graph API.
        const cred = await credenciaisMeta(tenant.id);
        if (!cred) {
          return json({ error: "Cadastre o Phone ID em Configuração > Integrações antes de conectar", qrcode: null }, 400);
        }
        const r = await fetch(`${META_GRAPH_BASE}/${cred.phoneId}?fields=display_phone_number,verified_name`, {
          headers: { Authorization: `Bearer ${cred.token}` },
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          return json({ error: data?.error?.message || "credenciais inválidas", qrcode: null }, 400);
        }
        return json({ instance: cred.phoneId, qrcode: null, numero: data?.display_phone_number, ja_conectado: true });
      }

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
      if (usaMeta) {
        return json({ error: "Não há sessão para desconectar. Para desativar, remova o Phone ID em Configuração > Integrações." }, 400);
      }
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
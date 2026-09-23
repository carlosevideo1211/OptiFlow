import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

// ---------- EVOLUTION / BAILEYS (canal nao-oficial, mais barato) ----------
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") || "https://evolution.visionproerp.com.br";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

// ---------- META CLOUD API (canal oficial, premium) ----------
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

// Token de acesso da Meta Cloud API. MORA SÓ AQUI, como secret do backend —
// nunca em store_settings nem em nenhuma tela de tenant (mesmo motivo
// explicado em whatsapp-manage/index.ts: e o MESMO token pra todos os
// tenants no canal Meta, entao deixa-lo numa tabela visivel por tenant seria
// um vazamento entre inquilinos).
const META_WHATSAPP_TOKEN = Deno.env.get("META_WHATSAPP_TOKEN") || "";

// Nomes dos modelos (templates) cadastrados no WhatsApp Manager da Meta.
// IMPORTANTE: trocar pelos nomes EXATOS que ficaram registrados depois da
// aprovacao, se forem diferentes dos sugeridos em modelos_whatsapp_meta.md.
const TEMPLATE_ANIVERSARIO = "aniversario";
const TEMPLATE_VENCIMENTO_PROXIMO = "vencimento_proximo";
const TEMPLATE_VENCIMENTO_HOJE = "vencimento_hoje";
const TEMPLATE_VENCIMENTO_ATRASO5 = "vencimento_atraso5";
const TEMPLATE_POS_VENDA = "pos_venda";
const TEMPLATE_ADAPTACAO_LENTE = "adaptacao_lente";
const TEMPLATE_COBRANCA_ATRASO = "cobranca_atraso";
const TEMPLATE_AVISO_NEGATIVACAO = "aviso_negativacao";
const TEMPLATE_NEGOCIACAO_DEBITO_ANTIGO = "negociacao_debito_antigo";

// ---------- Dois canais, um tipo comum ----------
// Qual canal cada otica usa fica em tenants.whatsapp_canal ('evolution' ou
// 'meta'), controlado so pelo Carlos (master do sistema). Ver migration
// whatsapp_canal.sql.
type CanalInfo =
  | { canal: "evolution"; instance: string }
  | { canal: "meta"; phoneId: string; token: string };

// Limite total por execucao, somando TODOS os tenants (dos dois canais)
// juntos - protege contra o timeout de 150s do Supabase.
const LIMITE_GLOBAL_POR_EXECUCAO = 8;

// Limite por tenant, DENTRO de cada execucao - impede que um tenant com fila
// grande consuma sozinho toda a cota global.
const LIMITE_POR_TENANT_POR_EXECUCAO = 3;

// Limite total por DIA, por tenant, somando todas as execucoes do cron (a
// cada 15 min, ate 96x por dia). No canal Evolution isso tambem protege
// contra bloqueio (WhatsApp identificando o numero como automatizado); no
// canal Meta o risco de bloqueio nao existe, mas o limite continua valendo
// para controlar custo e nao incomodar cliente com volume alto num so dia.
const LIMITE_DIARIO_POR_TENANT = 30;

// O delay entre mensagens e a principal protecao anti-bloqueio do canal
// Evolution/Baileys — no canal Meta oficial esse risco nao existe, entao o
// delay pode ser bem mais curto (so para nao disparar tudo de uma vez).
function delayAleatorio(canal: "evolution" | "meta"): Promise<void> {
  const [minMs, maxMs] = canal === "meta" ? [2000, 4000] : [5000, 10000];
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWhatsAppMessageEvolution(instanceName: string, phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const number = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    const res = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Manda uma mensagem de MODELO (template) pela Meta Cloud API. Diferente do
// Evolution/Baileys, a Meta NAO deixa mandar texto livre quando e a loja que
// inicia a conversa — so mensagens de template pre-aprovadas. "params"
// preenche {{1}}, {{2}}, {{3}}... do corpo do modelo, NA ORDEM em que
// aparecem no texto aprovado.
async function sendWhatsAppTemplateMeta(
  phoneId: string,
  metaToken: string,
  phone: string,
  templateName: string,
  params: string[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const to = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    const res = await fetch(`${META_GRAPH_BASE}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${metaToken}` },
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
// modelo para Meta) e manda pelo canal certo.
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

async function supabaseFetch(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  return res.json();
}

async function supabaseRpc(fnName: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return res.json();
}

async function logTrigger(tenantId: string, triggerType: string, referenceId: string, customerId: string | null, phone: string, success: boolean, errorMessage?: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_triggers_log`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      trigger_type: triggerType,
      reference_id: referenceId,
      customer_id: customerId,
      phone,
      success,
      error_message: errorMessage || null,
    }),
  });
}

async function jaEnviado(tenantId: string, triggerType: string, referenceId: string): Promise<boolean> {
  const rows = await supabaseFetch(
    `whatsapp_triggers_log?tenant_id=eq.${tenantId}&trigger_type=eq.${triggerType}&reference_id=eq.${encodeURIComponent(referenceId)}&success=eq.true&select=id&limit=1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function podeReenviar(tenantId: string, triggerType: string, referenceId: string, intervaloDias: number): Promise<boolean> {
  const rows = await supabaseFetch(
    `whatsapp_triggers_log?tenant_id=eq.${tenantId}&trigger_type=eq.${triggerType}&reference_id=eq.${encodeURIComponent(referenceId)}&success=eq.true&select=sent_at&order=sent_at.desc&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) return true;
  const ultimoEnvio = new Date(rows[0].sent_at).getTime();
  const diasPassados = (Date.now() - ultimoEnvio) / 86400000;
  return diasPassados >= intervaloDias;
}

async function enviosHojeDoTenant(tenantId: string, inicioHojeIso: string): Promise<number> {
  const rows = await supabaseFetch(
    `whatsapp_triggers_log?tenant_id=eq.${tenantId}&success=eq.true&sent_at=gte.${inicioHojeIso}&select=id`
  );
  return Array.isArray(rows) ? rows.length : 0;
}

function fmtData(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  // Achado 1 da auditoria: este servidor roda em UTC, entao "new Date()"
  // direto adianta a data (e, perto da virada do ano, ate o ano) a partir de
  // ~20h no horario de Manaus (UTC-4, sem horario de verao desde 2019) — o
  // que fazia esta function selecionar a parcela ERRADA pra avisar "vence
  // hoje"/"5 dias antes"/"atrasada" nesse intervalo da noite. Ajustamos pelo
  // offset ANTES de formatar qualquer data, e usamos os getters UTC (que
  // passam a refletir o relogio de Manaus) daqui pra baixo.
  const MANAUS_OFFSET_MS = 4 * 60 * 60 * 1000;
  const hoje = new Date(Date.now() - MANAUS_OFFSET_MS);
  const hojeStr = hoje.toISOString().split("T")[0];
  const em5dias = new Date(Date.now() + 5 * 86400000 - MANAUS_OFFSET_MS).toISOString().split("T")[0];
  const menos5dias = new Date(Date.now() - 5 * 86400000 - MANAUS_OFFSET_MS).toISOString().split("T")[0];
  const menos7dias = new Date(Date.now() - 7 * 86400000 - MANAUS_OFFSET_MS).toISOString().split("T")[0];
  const menos15dias = new Date(Date.now() - 15 * 86400000 - MANAUS_OFFSET_MS).toISOString().split("T")[0];
  const menos30dias = new Date(Date.now() - 30 * 86400000 - MANAUS_OFFSET_MS).toISOString().split("T")[0];
  const menos365dias = new Date(Date.now() - 365 * 86400000 - MANAUS_OFFSET_MS).toISOString().split("T")[0];
  const LIMITE_COBRANCA_POR_EXECUCAO = 50;

  // Para debitos com mais de 1 ano, consolida tudo num unico aviso por
  // CLIENTE (nao por parcela), com o valor total (parcelas + juros). O tom
  // do aviso depende de o tenant ter cadastro ativo no SPC/Serasa (campo
  // tenants.spc_serasa_ativo): quem tem cadastro recebe uma notificacao
  // formal com prazo (exigencia legal — CDC / Sumula 359 STJ — de avisar
  // previamente antes de negativar); quem nao tem, recebe um convite a
  // negociar, sem ameacar uma negativacao que a loja nao teria como
  // executar de fato.
  const JUROS_DIA_ATRASO = 0.07; // deve ficar igual a JUROS_DIA em src/pages/crediario/crediarioTypes.ts
  const PRAZO_NEGATIVACAO_DIAS = 10;
  const resultado = {
    aniversario: 0,
    vencimento: 0,
    vencimento_dia: 0,
    vencimento_atraso5: 0,
    pos_venda: 0,
    adaptacao: 0,
    cobranca_atraso: 0,
    aviso_negativacao: 0,
    negociacao_debito_antigo: 0,
    erros: [] as string[],
    enviados_total: 0,
    limite_global_atingido: false,
    tenants_limitados: [] as string[],
    tenants_sem_credencial: [] as string[],
  };

  // Mesma formula usada no frontend (crediarioTypes.ts calcJuros): R$0,07 por
  // dia de atraso, a partir do vencimento. Mantida aqui separada (nao e
  // possivel importar do frontend dentro da Edge Function).
  function calcJurosServer(dueDateStr: string, hojeRef: Date): number {
    const venc = new Date(dueDateStr + "T00:00:00Z");
    const dias = Math.floor((hojeRef.getTime() - venc.getTime()) / 86400000);
    if (dias <= 0) return 0;
    return Math.round(dias * JUROS_DIA_ATRASO * 100) / 100;
  }

  let enviosNestaExecucao = 0;

  try {
    // Busca todos os tenants com o canal escolhido, mais o mapa de Phone IDs
    // (store_settings, usado so pelos tenants no canal 'meta' — o Token e
    // sempre o secret global META_WHATSAPP_TOKEN).
    const tenants = await supabaseFetch(`tenants?select=id,company_name,whatsapp_instance_name,spc_serasa_ativo,whatsapp_canal`);
    const settingsRows = await supabaseFetch(`store_settings?select=tenant_id,wa_phone_id`);
    const phoneIdPorTenant: Record<string, string> = {};
    if (Array.isArray(settingsRows)) {
      for (const s of settingsRows) {
        if (s.wa_phone_id) phoneIdPorTenant[s.tenant_id] = s.wa_phone_id;
      }
    }

    for (const tenant of tenants) {
      if (enviosNestaExecucao >= LIMITE_GLOBAL_POR_EXECUCAO) {
        resultado.limite_global_atingido = true;
        break;
      }

      // Resolve o canal deste tenant. 'evolution' e o padrao (compatibilidade
      // com tenants existentes, coluna adicionada com DEFAULT 'evolution').
      let canalInfo: CanalInfo | null = null;
      if (tenant.whatsapp_canal === "meta") {
        const phoneId = phoneIdPorTenant[tenant.id];
        if (META_WHATSAPP_TOKEN && phoneId) {
          canalInfo = { canal: "meta", phoneId, token: META_WHATSAPP_TOKEN };
        }
      } else if (tenant.whatsapp_instance_name) {
        canalInfo = { canal: "evolution", instance: tenant.whatsapp_instance_name };
      }
      if (!canalInfo) {
        resultado.tenants_sem_credencial.push(tenant.id);
        continue;
      }

      const loja = tenant.company_name || "sua ótica";

      // Checa o limite diario deste tenant ANTES de comecar a processar seus
      // gatilhos — protege mesmo quando o cron ja rodou varias vezes hoje.
      const inicioHoje = new Date(hojeStr + "T00:00:00-04:00");
      const jaEnviouHoje = await enviosHojeDoTenant(tenant.id, inicioHoje.toISOString());
      if (jaEnviouHoje >= LIMITE_DIARIO_POR_TENANT) {
        if (!resultado.tenants_limitados.includes(tenant.id)) resultado.tenants_limitados.push(tenant.id + ":limite_diario");
        continue;
      }

      // Contador PRÓPRIO deste tenant, dentro desta execução.
      let enviosTenantAtual = 0;
      function podeEnviarMais(): boolean {
        if (enviosNestaExecucao >= LIMITE_GLOBAL_POR_EXECUCAO) {
          resultado.limite_global_atingido = true;
          return false;
        }
        if (enviosTenantAtual >= LIMITE_POR_TENANT_POR_EXECUCAO) {
          if (!resultado.tenants_limitados.includes(tenant.id)) resultado.tenants_limitados.push(tenant.id);
          return false;
        }
        if (jaEnviouHoje + enviosTenantAtual >= LIMITE_DIARIO_POR_TENANT) {
          if (!resultado.tenants_limitados.includes(tenant.id + ":limite_diario")) resultado.tenants_limitados.push(tenant.id + ":limite_diario");
          return false;
        }
        return true;
      }
      function registrarEnvio() {
        enviosNestaExecucao++;
        enviosTenantAtual++;
        resultado.enviados_total++;
      }

      // ---------- 1) ANIVERSÁRIO ----------
      const aniversariantes = await supabaseRpc("customers_aniversariantes_hoje", { p_tenant_id: tenant.id });
      const optOutAniv = new Set<string>();
      if (Array.isArray(aniversariantes) && aniversariantes.length > 0) {
        const idsAniv = [...new Set(aniversariantes.map((c: any) => c.id))].join(",");
        const optOutRows = await supabaseFetch(`customers?id=in.(${idsAniv})&whatsapp_opt_out=eq.true&select=id`);
        if (Array.isArray(optOutRows)) optOutRows.forEach((r: any) => optOutAniv.add(r.id));
      }
      for (const c of aniversariantes) {
        if (!podeEnviarMais()) break;
        if (optOutAniv.has(c.id)) continue;
        const telefone = c.whatsapp || c.phone;
        if (!telefone) continue;
        const refId = `${c.id}:${hoje.getUTCFullYear()}`;
        if (await jaEnviado(tenant.id, "aniversario", refId)) continue;

        const texto = `Olá, ${c.name}! 🎉 A equipe da ${loja} deseja um feliz aniversário! Que seu dia seja repleto de alegria. Um abraço da nossa equipe!`;
        const r = await enviarMensagem(canalInfo, telefone, { texto, templateName: TEMPLATE_ANIVERSARIO, templateParams: [c.name, loja] });
        await logTrigger(tenant.id, "aniversario", refId, c.id, telefone, r.ok, r.error);
        registrarEnvio();
        if (r.ok) resultado.aniversario++; else resultado.erros.push(`aniversario ${c.id}: ${r.error}`);
        await delayAleatorio(canalInfo.canal);
      }

      // ---------- 2) VENCIMENTO DE PARCELA (5 dias antes) ----------
      if (podeEnviarMais()) {
        const parcelas = await supabaseFetch(
          `crediario_parcelas?tenant_id=eq.${tenant.id}&due_date=eq.${em5dias}&status=eq.pendente&select=id,crediario_id,due_date,amount`
        );
        if (Array.isArray(parcelas) && parcelas.length > 0) {
          const credIds = [...new Set(parcelas.map((p: any) => p.crediario_id))].join(",");
          const creditos = await supabaseFetch(`crediario?id=in.(${credIds})&select=id,customer_id,customer_name`);
          const credMap: Record<string, any> = {};
          for (const c of creditos) credMap[c.id] = c;

          const custIds = [...new Set(creditos.map((c: any) => c.customer_id).filter(Boolean))].join(",");
          const clientesMap: Record<string, any> = {};
          if (custIds) {
            const clientesCred = await supabaseFetch(`customers?id=in.(${custIds})&select=id,whatsapp,phone,whatsapp_opt_out`);
            for (const c of clientesCred) clientesMap[c.id] = c;
          }

          for (const p of parcelas) {
            if (!podeEnviarMais()) break;
            const cred = credMap[p.crediario_id];
            if (!cred) continue;
            const clienteInfo = clientesMap[cred.customer_id];
            if (clienteInfo?.whatsapp_opt_out) continue;
            const telefone = clienteInfo?.whatsapp || clienteInfo?.phone;
            if (!telefone) continue;
            const refId = String(p.id);
            if (await jaEnviado(tenant.id, "vencimento", refId)) continue;

            const valor = Number(p.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const data = fmtData(p.due_date);
            const texto = `Olá, ${cred.customer_name}! Passando para lembrar: sua parcela de ${valor} do crediário na ${loja} vence em ${data}. Qualquer dúvida, é só chamar por aqui!`;
            const r = await enviarMensagem(canalInfo, telefone, {
              texto,
              templateName: TEMPLATE_VENCIMENTO_PROXIMO,
              templateParams: [cred.customer_name, valor, loja, data],
            });
            await logTrigger(tenant.id, "vencimento", refId, cred.customer_id, telefone, r.ok, r.error);
            registrarEnvio();
            if (r.ok) resultado.vencimento++; else resultado.erros.push(`vencimento ${p.id}: ${r.error}`);
            await delayAleatorio(canalInfo.canal);
          }
        }
      }

      // ---------- 2b) VENCIMENTO NO DIA (dia do vencimento) ----------
      if (podeEnviarMais()) {
        const parcelasHoje = await supabaseFetch(
          `crediario_parcelas?tenant_id=eq.${tenant.id}&due_date=eq.${hojeStr}&status=eq.pendente&select=id,crediario_id,due_date,amount`
        );
        if (Array.isArray(parcelasHoje) && parcelasHoje.length > 0) {
          const credIdsH = [...new Set(parcelasHoje.map((p: any) => p.crediario_id))].join(",");
          const creditosH = await supabaseFetch(`crediario?id=in.(${credIdsH})&select=id,customer_id,customer_name`);
          const credMapH: Record<string, any> = {};
          for (const c of creditosH) credMapH[c.id] = c;

          const custIdsH = [...new Set(creditosH.map((c: any) => c.customer_id).filter(Boolean))].join(",");
          const clientesMapH: Record<string, any> = {};
          if (custIdsH) {
            const clientesCredH = await supabaseFetch(`customers?id=in.(${custIdsH})&select=id,whatsapp,phone,whatsapp_opt_out`);
            for (const c of clientesCredH) clientesMapH[c.id] = c;
          }

          for (const p of parcelasHoje) {
            if (!podeEnviarMais()) break;
            const cred = credMapH[p.crediario_id];
            if (!cred) continue;
            const clienteInfo = clientesMapH[cred.customer_id];
            if (clienteInfo?.whatsapp_opt_out) continue;
            const telefone = clienteInfo?.whatsapp || clienteInfo?.phone;
            if (!telefone) continue;
            const refId = String(p.id);
            if (await jaEnviado(tenant.id, "vencimento_dia", refId)) continue;

            const valor = Number(p.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const data = fmtData(p.due_date);
            const texto = `Olá, ${cred.customer_name}! Sua parcela de ${valor} do crediário na ${loja} vence hoje (${data}). Qualquer dúvida, é só chamar por aqui!`;
            const r = await enviarMensagem(canalInfo, telefone, {
              texto,
              templateName: TEMPLATE_VENCIMENTO_HOJE,
              templateParams: [cred.customer_name, valor, loja, data],
            });
            await logTrigger(tenant.id, "vencimento_dia", refId, cred.customer_id, telefone, r.ok, r.error);
            registrarEnvio();
            if (r.ok) resultado.vencimento_dia++; else resultado.erros.push(`vencimento_dia ${p.id}: ${r.error}`);
            await delayAleatorio(canalInfo.canal);
          }
        }
      }

      // ---------- 2c) VENCIMENTO + 5 DIAS (parcela venceu há 5 dias) ----------
      if (podeEnviarMais()) {
        const parcelas5d = await supabaseFetch(
          `crediario_parcelas?tenant_id=eq.${tenant.id}&due_date=eq.${menos5dias}&status=eq.pendente&select=id,crediario_id,due_date,amount`
        );
        if (Array.isArray(parcelas5d) && parcelas5d.length > 0) {
          const credIds5 = [...new Set(parcelas5d.map((p: any) => p.crediario_id))].join(",");
          const creditos5 = await supabaseFetch(`crediario?id=in.(${credIds5})&select=id,customer_id,customer_name`);
          const credMap5: Record<string, any> = {};
          for (const c of creditos5) credMap5[c.id] = c;

          const custIds5 = [...new Set(creditos5.map((c: any) => c.customer_id).filter(Boolean))].join(",");
          const clientesMap5: Record<string, any> = {};
          if (custIds5) {
            const clientesCred5 = await supabaseFetch(`customers?id=in.(${custIds5})&select=id,whatsapp,phone,whatsapp_opt_out`);
            for (const c of clientesCred5) clientesMap5[c.id] = c;
          }

          for (const p of parcelas5d) {
            if (!podeEnviarMais()) break;
            const cred = credMap5[p.crediario_id];
            if (!cred) continue;
            const clienteInfo = clientesMap5[cred.customer_id];
            if (clienteInfo?.whatsapp_opt_out) continue;
            const telefone = clienteInfo?.whatsapp || clienteInfo?.phone;
            if (!telefone) continue;
            const refId = String(p.id);
            if (await jaEnviado(tenant.id, "vencimento_atraso5", refId)) continue;

            const valor = Number(p.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const data = fmtData(p.due_date);
            const texto = `Olá, ${cred.customer_name}. Notamos que sua parcela de ${valor} do crediário na ${loja}, com vencimento em ${data}, ainda está em aberto. Se já pagou, desconsidere esta mensagem. Qualquer dúvida ou para negociar, estamos à disposição!`;
            const r = await enviarMensagem(canalInfo, telefone, {
              texto,
              templateName: TEMPLATE_VENCIMENTO_ATRASO5,
              templateParams: [cred.customer_name, valor, loja, data],
            });
            await logTrigger(tenant.id, "vencimento_atraso5", refId, cred.customer_id, telefone, r.ok, r.error);
            registrarEnvio();
            if (r.ok) resultado.vencimento_atraso5++; else resultado.erros.push(`vencimento_atraso5 ${p.id}: ${r.error}`);
            await delayAleatorio(canalInfo.canal);
          }
        }
      }

      // ---------- 3) PÓS-VENDA (7 dias após entrega) ----------
      if (podeEnviarMais()) {
        const posVenda = await supabaseFetch(
          `service_orders?tenant_id=eq.${tenant.id}&status=eq.entregue&delivery_date=eq.${menos7dias}&select=id,customer_id,customer_name,delivery_date&customer_id=not.is.null`
        );
        for (const os of posVenda) {
          if (!podeEnviarMais()) break;
          const cliente = await supabaseFetch(`customers?id=eq.${os.customer_id}&select=whatsapp,phone,whatsapp_opt_out`);
          if (cliente?.[0]?.whatsapp_opt_out) continue;
          const telefone = cliente?.[0]?.whatsapp || cliente?.[0]?.phone;
          if (!telefone) continue;
          const refId = String(os.id);
          if (await jaEnviado(tenant.id, "pos_venda", refId)) continue;

          const texto = `Olá, ${os.customer_name}! Aqui é da ${loja}. Já faz uma semana que você retirou seus óculos — está tudo certinho? Se tiver qualquer ajuste a fazer, é só nos chamar!`;
          const r = await enviarMensagem(canalInfo, telefone, { texto, templateName: TEMPLATE_POS_VENDA, templateParams: [os.customer_name, loja] });
          await logTrigger(tenant.id, "pos_venda", refId, os.customer_id, telefone, r.ok, r.error);
          registrarEnvio();
          if (r.ok) resultado.pos_venda++; else resultado.erros.push(`pos_venda ${os.id}: ${r.error}`);
          await delayAleatorio(canalInfo.canal);
        }
      }

      // ---------- 4) ADAPTAÇÃO (15 dias após entrega, multifocal/bifocal) ----------
      if (podeEnviarMais()) {
        const adaptacao = await supabaseFetch(
          `service_orders?tenant_id=eq.${tenant.id}&status=eq.entregue&delivery_date=eq.${menos15dias}&tipo_lente=in.(Multifocal,Bifocal)&select=id,customer_id,customer_name,tipo_lente&customer_id=not.is.null`
        );
        for (const os of adaptacao) {
          if (!podeEnviarMais()) break;
          const cliente = await supabaseFetch(`customers?id=eq.${os.customer_id}&select=whatsapp,phone,whatsapp_opt_out`);
          if (cliente?.[0]?.whatsapp_opt_out) continue;
          const telefone = cliente?.[0]?.whatsapp || cliente?.[0]?.phone;
          if (!telefone) continue;
          const refId = String(os.id);
          if (await jaEnviado(tenant.id, "adaptacao", refId)) continue;

          const tipoLower = String(os.tipo_lente).toLowerCase();
          const texto = `Olá, ${os.customer_name}! Aqui é da ${loja}. Já se passaram 15 dias desde que você retirou sua lente ${tipoLower} — como está a adaptação? Se estiver sentindo alguma dificuldade, passa aqui na loja que ajudamos com o ajuste!`;
          const r = await enviarMensagem(canalInfo, telefone, {
            texto,
            templateName: TEMPLATE_ADAPTACAO_LENTE,
            templateParams: [os.customer_name, loja, tipoLower],
          });
          await logTrigger(tenant.id, "adaptacao", refId, os.customer_id, telefone, r.ok, r.error);
          registrarEnvio();
          if (r.ok) resultado.adaptacao++; else resultado.erros.push(`adaptacao ${os.id}: ${r.error}`);
          await delayAleatorio(canalInfo.canal);
        }
      }

      // ---------- 5) COBRANÇA DE ATRASO ----------
      if (podeEnviarMais()) {
        const atrasadas = await supabaseFetch(
          `crediario_parcelas?tenant_id=eq.${tenant.id}&due_date=lt.${menos30dias}&due_date=gte.${menos365dias}&status=eq.pendente&select=id,crediario_id,due_date,amount&order=due_date.asc&limit=${LIMITE_COBRANCA_POR_EXECUCAO}`
        );
        if (Array.isArray(atrasadas) && atrasadas.length > 0) {
          const credIds2 = [...new Set(atrasadas.map((p: any) => p.crediario_id))].join(",");
          const creditos2 = await supabaseFetch(`crediario?id=in.(${credIds2})&select=id,customer_id,customer_name`);
          const credMap2: Record<string, any> = {};
          for (const c of creditos2) credMap2[c.id] = c;

          const custIds2 = [...new Set(creditos2.map((c: any) => c.customer_id).filter(Boolean))].join(",");
          const clientesMap2: Record<string, any> = {};
          if (custIds2) {
            const clientesCred2 = await supabaseFetch(`customers?id=in.(${custIds2})&select=id,whatsapp,phone,whatsapp_opt_out`);
            for (const c of clientesCred2) clientesMap2[c.id] = c;
          }

          for (const p of atrasadas) {
            if (!podeEnviarMais()) break;
            const cred = credMap2[p.crediario_id];
            if (!cred) continue;
            const clienteInfo = clientesMap2[cred.customer_id];
            if (clienteInfo?.whatsapp_opt_out) continue;
            const telefone = clienteInfo?.whatsapp || clienteInfo?.phone;
            if (!telefone) continue;
            const refId = String(p.id);
            if (!(await podeReenviar(tenant.id, "cobranca_atraso", refId, 7))) continue;

            const valor = Number(p.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const data = fmtData(p.due_date);
            const texto = `Olá, ${cred.customer_name}. Este é um lembrete importante da ${loja}: identificamos uma parcela em atraso no valor de ${valor}, com vencimento em ${data}. Pedimos que regularize o quanto antes para evitar transtornos. Se você já efetuou o pagamento, por favor desconsidere esta mensagem ou nos avise por aqui para regularizarmos seu cadastro. Qualquer dúvida ou para negociar, estamos à disposição.`;
            // Ordem dos parametros do modelo Meta e nome, loja, valor, data —
            // diferente da ordem usada em vencimento_proximo (nome, valor,
            // loja, data). Ver nota em modelos_whatsapp_meta.md.
            const r = await enviarMensagem(canalInfo, telefone, {
              texto,
              templateName: TEMPLATE_COBRANCA_ATRASO,
              templateParams: [cred.customer_name, loja, valor, data],
            });
            await logTrigger(tenant.id, "cobranca_atraso", refId, cred.customer_id, telefone, r.ok, r.error);
            registrarEnvio();
            if (r.ok) resultado.cobranca_atraso++; else resultado.erros.push(`cobranca_atraso ${p.id}: ${r.error}`);
            await delayAleatorio(canalInfo.canal);
          }
        }
      }

      // ---------- 6) DÍVIDA COM MAIS DE 1 ANO (aviso único e consolidado por CLIENTE) ----------
      if (podeEnviarMais()) {
        const antigas = await supabaseFetch(
          `crediario_parcelas?tenant_id=eq.${tenant.id}&due_date=lt.${menos365dias}&status=eq.pendente&select=id,crediario_id,due_date,amount&order=due_date.asc&limit=${LIMITE_COBRANCA_POR_EXECUCAO}`
        );
        if (Array.isArray(antigas) && antigas.length > 0) {
          const credIds3 = [...new Set(antigas.map((p: any) => p.crediario_id))].join(",");
          const creditos3 = await supabaseFetch(`crediario?id=in.(${credIds3})&select=id,customer_id,customer_name`);
          const credMap3: Record<string, any> = {};
          for (const c of creditos3) credMap3[c.id] = c;

          const custIds3 = [...new Set(creditos3.map((c: any) => c.customer_id).filter(Boolean))].join(",");
          const clientesMap3: Record<string, any> = {};
          if (custIds3) {
            const clientesCred3 = await supabaseFetch(`customers?id=in.(${custIds3})&select=id,whatsapp,phone,whatsapp_opt_out`);
            for (const c of clientesCred3) clientesMap3[c.id] = c;
          }

          // Agrupa as parcelas antigas por CLIENTE (nao por parcela) — um
          // cliente com 10 parcelas atrasadas ha mais de um ano recebe UMA
          // mensagem com o total, nao dez.
          const porCliente: Record<string, { customer_name: string; total: number; qtdParcelas: number; maisAntiga: string }> = {};
          for (const p of antigas) {
            const cred = credMap3[p.crediario_id];
            if (!cred || !cred.customer_id) continue;
            const juros = calcJurosServer(p.due_date, hoje);
            const valorComJuros = Number(p.amount || 0) + juros;
            const atual = porCliente[cred.customer_id];
            if (!atual) {
              porCliente[cred.customer_id] = { customer_name: cred.customer_name, total: valorComJuros, qtdParcelas: 1, maisAntiga: p.due_date };
            } else {
              atual.total += valorComJuros;
              atual.qtdParcelas += 1;
              if (p.due_date < atual.maisAntiga) atual.maisAntiga = p.due_date;
            }
          }

          for (const customerId of Object.keys(porCliente)) {
            if (!podeEnviarMais()) break;
            const clienteInfo = clientesMap3[customerId];
            if (clienteInfo?.whatsapp_opt_out) continue;
            const telefone = clienteInfo?.whatsapp || clienteInfo?.phone;
            if (!telefone) continue;

            const info = porCliente[customerId];
            // Um unico aviso por cliente (nao por parcela, nem periodico) — o
            // refId e o proprio customerId.
            const triggerType = tenant.spc_serasa_ativo ? "aviso_negativacao" : "negociacao_debito_antigo";
            if (await jaEnviado(tenant.id, triggerType, customerId)) continue;

            const valorFmt = info.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const dataFmt = fmtData(info.maisAntiga);
            const parcelasTxt = info.qtdParcelas === 1 ? "1 parcela" : `${info.qtdParcelas} parcelas`;

            const texto = tenant.spc_serasa_ativo
              ? `Prezado(a) ${info.customer_name}, a ${loja} informa que consta em nosso sistema um débito em aberto de ${parcelasTxt} (a mais antiga vencida em ${dataFmt}), totalizando ${valorFmt}. Solicitamos a regularização no prazo de ${PRAZO_NEGATIVACAO_DIAS} dias corridos a partir desta mensagem. Caso o pagamento não seja identificado até essa data, seu nome será incluído nos órgãos de proteção ao crédito (SPC/Serasa), conforme previsto em contrato e na legislação vigente. Para negociar ou tirar dúvidas, entre em contato conosco.`
              : `Olá, ${info.customer_name}! Aqui é da ${loja}. Identificamos que seu débito conosco está em aberto há mais de um ano (${parcelasTxt}, a mais antiga vencida em ${dataFmt}), totalizando ${valorFmt}. Gostaríamos muito de resolver isso da melhor forma pra você — temos condições especiais de parcelamento pra regularizar. Pode nos chamar aqui mesmo ou ligar na loja pra conversarmos?`;

            const templateName = tenant.spc_serasa_ativo ? TEMPLATE_AVISO_NEGATIVACAO : TEMPLATE_NEGOCIACAO_DEBITO_ANTIGO;
            const templateParams = tenant.spc_serasa_ativo
              ? [info.customer_name, loja, parcelasTxt, dataFmt, valorFmt, String(PRAZO_NEGATIVACAO_DIAS)]
              : [info.customer_name, loja, parcelasTxt, dataFmt, valorFmt];

            const r = await enviarMensagem(canalInfo, telefone, { texto, templateName, templateParams });
            await logTrigger(tenant.id, triggerType, customerId, customerId, telefone, r.ok, r.error);
            registrarEnvio();
            if (r.ok) {
              if (triggerType === "aviso_negativacao") resultado.aviso_negativacao++; else resultado.negociacao_debito_antigo++;
            } else {
              resultado.erros.push(`${triggerType} ${customerId}: ${r.error}`);
            }
            await delayAleatorio(canalInfo.canal);
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, ...resultado, tenants_processados: tenants.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") || "https://evolution.visionproerp.com.br";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

// Limite total por execucao, somando TODOS os tenants juntos - protege
// contra o timeout de 150s do Supabase.
const LIMITE_GLOBAL_POR_EXECUCAO = 15;

// Limite por tenant, DENTRO de cada execucao - impede que um tenant com
// fila grande (ex: muitas parcelas atrasadas antigas) consuma sozinho
// toda a cota global e deixe os outros tenants sem receber nada naquele
// ciclo de 15 minutos.
const LIMITE_POR_TENANT_POR_EXECUCAO = 5;

function delayAleatorio(minMs = 2000, maxMs = 4000): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWhatsAppMessage(instanceName: string, phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const number = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    const res = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
      },
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

async function supabaseFetch(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
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

function fmtData(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

serve(async (req) => {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const hoje = new Date();
  const em5dias = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
  const menos7dias = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const menos15dias = new Date(Date.now() - 15 * 86400000).toISOString().split("T")[0];
  const menos30dias = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const menos365dias = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
  const LIMITE_COBRANCA_POR_EXECUCAO = 50;
  const resultado = { aniversario: 0, vencimento: 0, pos_venda: 0, adaptacao: 0, cobranca_atraso: 0, erros: [] as string[], enviados_total: 0, limite_global_atingido: false, tenants_limitados: [] as string[] };

  let enviosNestaExecucao = 0;

  try {
    const tenants = await supabaseFetch(`tenants?whatsapp_instance_name=not.is.null&select=id,company_name,whatsapp_instance_name`);

    for (const tenant of tenants) {
      if (enviosNestaExecucao >= LIMITE_GLOBAL_POR_EXECUCAO) {
        resultado.limite_global_atingido = true;
        break;
      }
      const instance = tenant.whatsapp_instance_name;
      const loja = tenant.company_name || "sua ótica";

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
        return true;
      }
      function registrarEnvio() {
        enviosNestaExecucao++;
        enviosTenantAtual++;
        resultado.enviados_total++;
      }

      // ---------- 1) ANIVERSÁRIO ----------
      const aniversariantes = await supabaseRpc("customers_aniversariantes_hoje", { p_tenant_id: tenant.id });
      for (const c of aniversariantes) {
        if (!podeEnviarMais()) break;
        const telefone = c.whatsapp || c.phone;
        if (!telefone) continue;
        const refId = `${c.id}:${hoje.getFullYear()}`;
        if (await jaEnviado(tenant.id, "aniversario", refId)) continue;

        const texto = `Olá, ${c.name}! 🎉 A equipe da ${loja} deseja um feliz aniversário! Que seu dia seja repleto de alegria. Um abraço da nossa equipe!`;
        const r = await sendWhatsAppMessage(instance, telefone, texto);
        await logTrigger(tenant.id, "aniversario", refId, c.id, telefone, r.ok, r.error);
        registrarEnvio();
        if (r.ok) resultado.aniversario++; else resultado.erros.push(`aniversario ${c.id}: ${r.error}`);
        await delayAleatorio();
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
            const clientesCred = await supabaseFetch(`customers?id=in.(${custIds})&select=id,whatsapp,phone`);
            for (const c of clientesCred) clientesMap[c.id] = c;
          }

          for (const p of parcelas) {
            if (!podeEnviarMais()) break;
            const cred = credMap[p.crediario_id];
            if (!cred) continue;
            const clienteInfo = clientesMap[cred.customer_id];
            const telefone = clienteInfo?.whatsapp || clienteInfo?.phone;
            if (!telefone) continue;
            const refId = String(p.id);
            if (await jaEnviado(tenant.id, "vencimento", refId)) continue;

            const valor = Number(p.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const texto = `Olá, ${cred.customer_name}! Passando para lembrar: sua parcela de ${valor} do crediário na ${loja} vence em ${fmtData(p.due_date)}. Qualquer dúvida, é só chamar por aqui!`;
            const r = await sendWhatsAppMessage(instance, telefone, texto);
            await logTrigger(tenant.id, "vencimento", refId, cred.customer_id, telefone, r.ok, r.error);
            registrarEnvio();
            if (r.ok) resultado.vencimento++; else resultado.erros.push(`vencimento ${p.id}: ${r.error}`);
            await delayAleatorio();
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
          const cliente = await supabaseFetch(`customers?id=eq.${os.customer_id}&select=whatsapp,phone`);
          const telefone = cliente?.[0]?.whatsapp || cliente?.[0]?.phone;
          if (!telefone) continue;
          const refId = String(os.id);
          if (await jaEnviado(tenant.id, "pos_venda", refId)) continue;

          const texto = `Olá, ${os.customer_name}! Aqui é da ${loja}. Já faz uma semana que você retirou seus óculos — está tudo certinho? Se tiver qualquer ajuste a fazer, é só nos chamar!`;
          const r = await sendWhatsAppMessage(instance, telefone, texto);
          await logTrigger(tenant.id, "pos_venda", refId, os.customer_id, telefone, r.ok, r.error);
          registrarEnvio();
          if (r.ok) resultado.pos_venda++; else resultado.erros.push(`pos_venda ${os.id}: ${r.error}`);
          await delayAleatorio();
        }
      }

      // ---------- 4) ADAPTAÇÃO (15 dias após entrega, multifocal/bifocal) ----------
      if (podeEnviarMais()) {
        const adaptacao = await supabaseFetch(
          `service_orders?tenant_id=eq.${tenant.id}&status=eq.entregue&delivery_date=eq.${menos15dias}&tipo_lente=in.(Multifocal,Bifocal)&select=id,customer_id,customer_name,tipo_lente&customer_id=not.is.null`
        );
        for (const os of adaptacao) {
          if (!podeEnviarMais()) break;
          const cliente = await supabaseFetch(`customers?id=eq.${os.customer_id}&select=whatsapp,phone`);
          const telefone = cliente?.[0]?.whatsapp || cliente?.[0]?.phone;
          if (!telefone) continue;
          const refId = String(os.id);
          if (await jaEnviado(tenant.id, "adaptacao", refId)) continue;

          const texto = `Olá, ${os.customer_name}! Aqui é da ${loja}. Já se passaram 15 dias desde que você retirou sua lente ${os.tipo_lente.toLowerCase()} — como está a adaptação? Se estiver sentindo alguma dificuldade, passa aqui na loja que ajudamos com o ajuste!`;
          const r = await sendWhatsAppMessage(instance, telefone, texto);
          await logTrigger(tenant.id, "adaptacao", refId, os.customer_id, telefone, r.ok, r.error);
          registrarEnvio();
          if (r.ok) resultado.adaptacao++; else resultado.erros.push(`adaptacao ${os.id}: ${r.error}`);
          await delayAleatorio();
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
            const clientesCred2 = await supabaseFetch(`customers?id=in.(${custIds2})&select=id,whatsapp,phone`);
            for (const c of clientesCred2) clientesMap2[c.id] = c;
          }

          for (const p of atrasadas) {
            if (!podeEnviarMais()) break;
            const cred = credMap2[p.crediario_id];
            if (!cred) continue;
            const clienteInfo = clientesMap2[cred.customer_id];
            const telefone = clienteInfo?.whatsapp || clienteInfo?.phone;
            if (!telefone) continue;
            const refId = String(p.id);
            if (!(await podeReenviar(tenant.id, "cobranca_atraso", refId, 7))) continue;

            const valor = Number(p.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const texto = `Olá, ${cred.customer_name}. Este é um lembrete importante da ${loja}: identificamos uma parcela em atraso no valor de ${valor}, com vencimento em ${fmtData(p.due_date)}. Pedimos que regularize o quanto antes para evitar transtornos. Se você já efetuou o pagamento, por favor desconsidere esta mensagem ou nos avise por aqui para regularizarmos seu cadastro. Qualquer dúvida ou para negociar, estamos à disposição.`;
            const r = await sendWhatsAppMessage(instance, telefone, texto);
            await logTrigger(tenant.id, "cobranca_atraso", refId, cred.customer_id, telefone, r.ok, r.error);
            registrarEnvio();
            if (r.ok) resultado.cobranca_atraso++; else resultado.erros.push(`cobranca_atraso ${p.id}: ${r.error}`);
            await delayAleatorio();
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
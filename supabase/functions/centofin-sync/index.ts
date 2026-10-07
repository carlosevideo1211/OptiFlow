// Integracao OptiFlow -> Centofin (MEI / Empresas), mao unica.
// Chamada pelo pg_cron a cada 15 min (header x-cron-secret). Para cada loja com
// store_settings.centofin_ativo e centofin_chave, manda ao Centofin tudo desde
// centofin_desde (padrao: dia 1 do mes atual):
//   - lancamentos: financial_transactions PAGAS sem parcela (vendas, entradas, despesas)
//     + cada parcela de carne PAGA no periodo (entrada "Parcela n/N - Cliente");
//   - parcelas: os carnes criados no periodo, com vencimento e baixa.
// O Centofin grava pelo id (reenviar nao duplica) e apaga o que sumiu daqui.
// Teste sem enviar: ?simular=1&tenant=<id>  |  so uma loja: ?tenant=<id>
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

// Datas no horario de Manaus (UTC-4, sem horario de verao).
function diaManaus(ts: string | null): string {
  if (!ts) return "";
  return new Date(new Date(ts).getTime() - 4 * 3600e3).toISOString().slice(0, 10);
}
function inicioDoMesManaus(): string {
  return diaManaus(new Date().toISOString()).slice(0, 8) + "01";
}

async function todas(caminho: string): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
      headers: { ...H, Range: `${de}-${de + 999}`, "Range-Unit": "items" },
    });
    if (!r.ok) throw new Error(`${caminho.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const lote = await r.json();
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

async function montar(tenant: string, desde: string) {
  const desdeUTC = `${desde}T04:00:00Z`;
  const ft = await todas(
    `financial_transactions?select=id,type,description,category,amount,paid_at,due_date,payment_method` +
      `&tenant_id=eq.${tenant}&status=eq.pago&crediario_parcela_id=is.null` +
      `&or=(paid_at.gte.${desdeUTC},and(paid_at.is.null,due_date.gte.${desde}))`,
  );
  const CARNE = `crediario(id,customer_id,customer_name,installments,status,created_at,customers(phone,whatsapp))`;
  const pagas = await todas(
    `crediario_parcelas?select=id,installment_number,amount,paid_amount,paid_at,due_date,payment_method,status,` +
      `${CARNE}&tenant_id=eq.${tenant}&paid_at=gte.${desdeUTC}`,
  );
  const carnes = await todas(
    `crediario?select=id,customer_id,customer_name,installments,status,created_at,customers(phone,whatsapp),` +
      `crediario_parcelas(id,installment_number,amount,due_date,paid_at,status)` +
      `&tenant_id=eq.${tenant}&created_at=gte.${desdeUTC}`,
  );
  // Parcelas em aberto de carnês antigos: as que vencem daqui pra frente e as atrasadas de até 1 ano
  // (dívida real dos clientes; as mais antigas que isso ficam de fora).
  const umAnoAtras = new Date(Date.now() - 365 * 864e5 - 4 * 3600e3).toISOString().slice(0, 10);
  const abertas = await todas(
    `crediario_parcelas?select=id,installment_number,amount,due_date,paid_at,status,${CARNE}` +
      `&tenant_id=eq.${tenant}&status=eq.pendente&due_date=gte.${umAnoAtras}`,
  );

  const lancamentos: any[] = [];
  for (const f of ft) {
    const valor = Number(f.amount || 0);
    if (valor <= 0) continue;
    const saida = String(f.type || "").toLowerCase().startsWith("desp");
    lancamentos.push({
      ext_id: `ft:${f.id}`, tipo: saida ? "saida" : "entrada", valor,
      data: diaManaus(f.paid_at) || f.due_date, descricao: f.description || "",
      categoria: saida ? (f.category || "Outros") : "Vendas", forma: f.payment_method || "",
    });
  }
  for (const p of pagas) {
    if (p.status === "cancelado" || !p.paid_at) continue;
    const valor = Number(p.paid_amount ?? p.amount ?? 0);
    if (valor <= 0) continue;
    const c = p.crediario || {};
    lancamentos.push({
      ext_id: `parcpg:${p.id}`, tipo: "entrada", valor, data: diaManaus(p.paid_at),
      descricao: `Parcela ${p.installment_number}/${c.installments || "?"} · ${c.customer_name || "Cliente"}`,
      categoria: "Pagamento de carnê", forma: p.payment_method || "",
    });
  }
  const parcelas: any[] = [];
  const vistas = new Set<string>();
  const addParcela = (p: any, c: any) => {
    if (!c || c.status === "cancelado" || p.status === "cancelado" || vistas.has(p.id) || !p.due_date) return;
    vistas.add(p.id);
    parcelas.push({
      ext_id: p.id, grupo: c.id, cliente_ext: c.customer_id || c.customer_name, cliente_nome: c.customer_name || "Cliente",
      telefone: (c.customers && (c.customers.whatsapp || c.customers.phone)) || "",
      numero: p.installment_number, total_parcelas: c.installments || (c.crediario_parcelas || []).length || 1,
      valor: Number(p.amount || 0), vencimento: p.due_date, pago_em: diaManaus(p.paid_at),
      venda_data: diaManaus(c.created_at),  // data da venda: base do regime de competência no Simples
      descricao: "Carnê (OptiFlow)",
    });
  };
  for (const c of carnes) for (const p of c.crediario_parcelas || []) addParcela(p, c);
  for (const p of abertas) addParcela(p, p.crediario);
  for (const p of pagas) addParcela(p, p.crediario);  // pagas no período, mesmo de carnê antigo
  return { desde, lancamentos, parcelas };
}

serve(async (req) => {
  const segredo = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || segredo !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Nao autorizado" }), { status: 401 });
  }
  const url = new URL(req.url);
  const soTenant = url.searchParams.get("tenant");
  const simular = url.searchParams.get("simular") === "1";
  let lojas = await todas(
    `store_settings?select=tenant_id,centofin_chave,centofin_desde,centofin_url&centofin_ativo=eq.true&centofin_chave=not.is.null`,
  );
  if (soTenant) lojas = lojas.filter((l) => l.tenant_id === soTenant);
  if (simular && soTenant && !lojas.length) lojas = [{ tenant_id: soTenant }];  // ver o que iria, antes de ligar
  const resultado: any[] = [];
  for (const loja of lojas) {
    const desde = loja.centofin_desde || inicioDoMesManaus();
    let status = "";
    try {
      const dados = await montar(loja.tenant_id, desde);
      if (simular) {
        resultado.push({ tenant: loja.tenant_id, desde, lancamentos: dados.lancamentos.length,
          parcelas: dados.parcelas.length, total_entradas: dados.lancamentos.filter((l) => l.tipo === "entrada")
            .reduce((a, l) => a + l.valor, 0) });
        continue;
      }
      const r = await fetch(`${(loja.centofin_url || "https://mei.centofin.com.br").replace(/\/$/, "")}/api/integracao/optiflow/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${loja.centofin_chave}` },
        body: JSON.stringify(dados),
        signal: AbortSignal.timeout(25000),
      });
      const txt = await r.text();
      status = r.ok ? `ok: ${txt.slice(0, 300)}` : `erro ${r.status}: ${txt.slice(0, 300)}`;
    } catch (e) {
      status = `erro: ${String(e).slice(0, 300)}`;
    }
    if (!simular) {
      await fetch(`${SUPABASE_URL}/rest/v1/store_settings?tenant_id=eq.${loja.tenant_id}`, {
        method: "PATCH",
        headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ centofin_ultimo_envio: new Date().toISOString(), centofin_ultimo_status: status }),
      });
      resultado.push({ tenant: loja.tenant_id, status });
    }
  }
  return new Response(JSON.stringify({ lojas: resultado }), { headers: { "Content-Type": "application/json" } });
});

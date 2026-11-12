// Relatorios automaticos da cobranca nova (11/11/2026) para o Carlos: resumo no WhatsApp oficial (modelo aviso_sistema,
// via vigia-cobranca?acao=avisar) e o relatorio completo por e-mail. So com o x-cron-secret.
//   ?tipo=mensal  -> mes anterior (pg_cron dia 6 de dez/2026 a mar/2027, 9h de Manaus)
//   ?tipo=feirao  -> fechamento do Feirao Limpa Nome (pg_cron 02/01/2027)
//   &simular=1    -> so devolve o texto, nao manda    &mes=2026-11 -> escolhe o mes do mensal
// Loja: as que estao com a cobranca nova ligada (tenants.cobranca_nova) - hoje so a Castanho.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

async function db(path: string, init?: RequestInit) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const brl = (v: unknown) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "-");
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o, null, 1), { status, headers: { "Content-Type": "application/json" } });

function mensal(r: any, nomeMes: string) {
  const m = r.medida, ret = r.retorno, f = r.feirao || {}, v = r.vigia || {};
  const d = r.divida_hoje || {};
  const resumo = [
    `📊 Relatório da cobrança de ${nomeMes} (${r.loja}):`,
    `Pagas até 5 dias após o vencimento: ${pct(m.pagas, m.base)} (outras óticas ${pct(m.pagas_outras, m.base_outras)}; meta 60%)`,
    `Retorno da cobrança de atraso: ${pct(ret.pagaram, ret.cobrados)} (outras ${pct(ret.pagaram_outras, ret.cobrados_outras)}; meta 15%)`,
    `Recuperado (atraso de 30+ dias): ${brl(r.recuperado_total)}`,
    `Feirão: ${f.fechados || 0} acordos (meta 30), ${brl(f.recebido)} recebidos (meta R$ 5 mil)`,
    `Robô parado sem aviso: ${v.dias_robo_parado || 0} dia(s); avisos de 2+ mensagens no dia: ${v.avisos_trava || 0}`,
  ];
  const completo = [
    `RELATÓRIO DA COBRANÇA — ${nomeMes.toUpperCase()} — ${r.loja}`,
    `Período: ${r.ini} a ${r.fim}. Comparação com ${r.outras_lojas} outras óticas do OptiFlow, somadas.`,
    "",
    "1) MEDIDA PRINCIPAL — das parcelas em aberto na véspera do vencimento, quantas foram pagas até 5 dias depois",
    `   ${r.loja}: ${pct(m.pagas, m.base)} (${m.pagas} de ${m.base})   |   outras óticas: ${pct(m.pagas_outras, m.base_outras)} (${m.pagas_outras} de ${m.base_outras})   |   meta fev/2027: 60%`,
    "",
    "2) RETORNO DA COBRANÇA DE ATRASO — clientes cobrados no mês (30+ dias) que pagaram alguma parcela depois",
    `   ${r.loja}: ${pct(ret.pagaram, ret.cobrados)} (${ret.pagaram} de ${ret.cobrados})   |   outras óticas: ${pct(ret.pagaram_outras, ret.cobrados_outras)}   |   meta: 15%`,
    "",
    `3) RECUPERADO NO MÊS (pago com mais de 30 dias de atraso): ${brl(r.recuperado_total)}`,
    ...(r.recuperado || []).map((x: any) => `   ${x.faixa}${x.faixa.includes("ano") ? "" : " dias"}: ${brl(x.valor)} (${x.qtd} parcelas)`),
    "",
    "4) FEIRÃO LIMPA NOME (acumulado)",
    `   Ofertas enviadas: ${f.ofertas || 0} (não entregues por telefone: ${f.nao_entregues || 0}; sem resposta há 3+ dias: ${f.sem_resposta_3d || 0})`,
    `   Acordos fechados: ${f.fechados || 0} (meta 30) — esperando Pix: ${f.esperando_pix || 0}`,
    `   Recebido: ${brl(f.recebido)} (meta R$ 5.000) — à vista ${brl(f.recebido_vista)}, parcelados ${brl(f.recebido_parcelado)} de ${brl(f.valor_parcelado)}`,
    "",
    "5) DÍVIDA VENCIDA EM ABERTO HOJE",
    `   1-30 dias ${brl(d["1-30"])} · 31-90 ${brl(d["31-90"])} · 91-365 ${brl(d["91-365"])} · +1 ano ${brl(d["+1 ano"])}`,
    "",
    "6) VIGIA",
    `   Dias com o robô parado: ${v.dias_robo_parado || 0} (meta 0) · avisos de cliente com 2+ mensagens no dia: ${v.avisos_trava || 0} (meta 0)`,
    `   Avisos de "PAGUEI" esperando a loja há 2+ dias: ${v.avisos_paguei_parado || 0} (meta 0) · avisos de WhatsApp de loja caído: ${v.avisos_whatsapp_caiu || 0}`,
    "",
    "Painel completo: OptiFlow > Crediário > Resultado da cobrança. Decisão sobre o sistema para o público: 05/03/2027.",
  ];
  return { resumo: resumo.join("\n"), completo: completo.join("\n") };
}

function feirao(r: any) {
  const f = r.feirao || {};
  const grupos = (f.por_grupo || []).map((g: any) => `${g.grupo}: ${g.ofertas} ofertas, ${g.fechados} acordos, ${brl(g.recebido)}`);
  const tipos = Object.entries(f.fechados_tipo || {}).map(([t, n]) => `${n} ${t === "vista" ? "à vista" : t === "entrada" ? "com entrada" : "sem entrada"}`).join(", ");
  const resumo = [
    `🎄 Fechamento do Feirão Limpa Nome (${r.loja}):`,
    `${f.fechados || 0} acordos fechados (meta 30)${tipos ? ": " + tipos : ""}`,
    `Recebido: ${brl(f.recebido)} (meta R$ 5 mil) — à vista ${brl(f.recebido_vista)}, parcelados ${brl(f.recebido_parcelado)}`,
    `Ainda a receber dos parcelados: ${brl(Number(f.valor_parcelado || 0) - Number(f.recebido_parcelado || 0))}`,
    `${f.ofertas || 0} ofertas enviadas; ${f.nao_entregues || 0} não chegaram (telefone)`,
  ];
  const completo = [
    `FECHAMENTO DO FEIRÃO LIMPA NOME — ${r.loja}`, "",
    `Ofertas enviadas: ${f.ofertas || 0} · não entregues (telefone sem WhatsApp): ${f.nao_entregues || 0} · sem resposta: ${f.esperando_escolha || 0}`,
    `Acordos fechados: ${f.fechados || 0} (meta 30)${tipos ? " — " + tipos : ""} · ainda esperando Pix: ${f.esperando_pix || 0}`,
    `Dívida negociada: ${brl(f.divida_negociada)} · valor dos acordos: ${brl(f.valor_acordos)}`,
    `Recebido: ${brl(f.recebido)} (meta R$ 5.000)`,
    `   à vista: ${brl(f.recebido_vista)}`,
    `   parcelados: ${brl(f.recebido_parcelado)} recebidos de ${brl(f.valor_parcelado)} combinados`,
    "", "Por grupo:", ...grupos.map((g: string) => "   " + g), "",
    `Retorno da cobrança de atraso no período: ${pct(r.retorno.pagaram, r.retorno.cobrados)} (outras óticas ${pct(r.retorno.pagaram_outras, r.retorno.cobrados_outras)})`,
  ];
  return { resumo: resumo.join("\n"), completo: completo.join("\n") };
}

serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Nao autorizado" }, 401);
  const u = new URL(req.url);
  const tipo = u.searchParams.get("tipo") || "mensal";
  const simular = u.searchParams.get("simular") === "1";
  try {
    const hoje = new Date(Date.now() - 4 * 3600e3); // Manaus
    let ini: string, fim: string, nomeMes = "";
    if (tipo === "feirao") { ini = "2026-11-11"; fim = "2026-12-31"; }
    else {
      const escolhido = u.searchParams.get("mes"); // AAAA-MM
      const ref = escolhido ? new Date(escolhido + "-15T12:00:00Z") : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 15));
      const y = ref.getUTCFullYear(), m = ref.getUTCMonth();
      ini = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      fim = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
      nomeMes = `${MESES[m]}/${y}`;
    }
    // O agendamento do pg_cron repete todo ano: so vale no periodo do teste (Feirao em jan/2027; mensal ate mar/2027).
    const hj = hoje.toISOString().slice(0, 10);
    if (!simular && !u.searchParams.get("mes") && (tipo === "feirao" ? hj.slice(0, 7) !== "2027-01" : hj > "2027-03-31")) {
      return json({ ok: true, fora_do_periodo: true, hoje: hj });
    }
    const lojas = await db("tenants?cobranca_nova=eq.true&select=id,company_name");
    const saida: unknown[] = [];
    for (const l of lojas || []) {
      const r = await db("rpc/cobranca_relatorio", { method: "POST", body: JSON.stringify({ p_tenant: l.id, p_ini: ini, p_fim: fim }) });
      const t = tipo === "feirao" ? feirao(r) : mensal(r, nomeMes);
      let envio: unknown = null;
      if (!simular) {
        const e = await fetch(`${SUPABASE_URL}/functions/v1/vigia-cobranca?acao=avisar`, {
          method: "POST", headers: { "x-cron-secret": CRON_SECRET, "Content-Type": "application/json" },
          body: JSON.stringify({ texto: t.resumo, completo: t.completo }),
        });
        envio = await e.json().catch(() => ({ status: e.status }));
      }
      saida.push({ loja: l.company_name, periodo: `${ini} a ${fim}`, ...t, envio });
    }
    return json({ ok: true, tipo, simular, lojas: saida });
  } catch (e) {
    return json({ ok: false, erro: String(e) }, 500);
  }
});

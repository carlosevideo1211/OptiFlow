import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = "https://fkwamdnstrbvgheosalz.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ---------- Focus NFe ----------
// Base da API muda so pelo ambiente (Homologacao/Producao) escolhido em
// fiscal_config.ambiente ('2' = Homologacao, '1' = Producao — mesmos
// valores que a aba "Configuração Fiscal" da tela de Nota Fiscal ja usa).
// Confirmado na documentacao oficial (doc.focusnfe.com.br/reference/ambiente):
//   Homologacao: https://homologacao.focusnfe.com.br/v2
//   Producao:    https://api.focusnfe.com.br/v2
function focusBaseUrl(ambiente: string | undefined): string {
  return ambiente === "1" ? "https://api.focusnfe.com.br/v2" : "https://homologacao.focusnfe.com.br/v2";
}

// Autenticacao da Focus NFe: HTTP Basic Auth, token da EMPRESA (gerado no
// painel da Focus NFe pra aquele CNPJ especifico) como usuario, senha em
// branco. Confirmado em doc.focusnfe.com.br/reference/autenticacao.
function focusAuthHeader(token: string): string {
  return `Basic ${btoa(`${token}:`)}`;
}

// Nomes dos campos conferidos em 23/09/2026 contra o exemplo oficial de NFC-e
// da Focus NFe (focusnfe.com.br/exemplos-de-codigos/python). O primeiro teste
// em Homologacao falhou com "Erro na validacao do Schema XML" porque o NCM
// ia no campo "ncm" — o nome certo e "codigo_ncm".
type ItemFocus = {
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  cfop: string;
  codigo_ncm: string;
  valor_desconto?: string;
  unidade_comercial: string;
  quantidade_comercial: string;
  valor_unitario_comercial: string;
  valor_bruto: string;
  unidade_tributavel: string;
  quantidade_tributavel: string;
  valor_unitario_tributavel: string;
  icms_origem: string;
  icms_situacao_tributaria: string;
  pis_situacao_tributaria: string;
  cofins_situacao_tributaria: string;
};

// Codigos de forma de pagamento da tabela oficial da NF-e/NFC-e (mesma
// tabela usada por todo emissor fiscal no Brasil, nao especifica da Focus).
// Valores de payment_method sao os de PAGAMENTOS em src/pages/vendas/vendasTypes.ts.
function codigoFormaPagamento(paymentMethod: string): string {
  const mapa: Record<string, string> = {
    dinheiro: "01",
    avista: "01",
    credito: "03",
    cartao_credito: "03",
    debito: "04",
    cartao_debito: "04",
    // Crediario proprio da loja = "05" (Credito Loja) na tabela oficial.
    crediario: "05",
    boleto: "15",
    pix: "17",
    transferencia: "18",
  };
  // "99" (Outros) exige descricao do meio de pagamento no XML; por isso so
  // cai aqui algo realmente desconhecido, e mandamos a descricao junto.
  return mapa[paymentMethod] || "99";
}

function formaPagamentoFocus(codigo: string, valor: number, descricaoOutros: string) {
  const f: Record<string, string> = { forma_pagamento: codigo, valor_pagamento: valor.toFixed(2) };
  // Cartao em NFC-e exige o grupo do cartao; "2" = maquininha nao integrada ao sistema.
  if (codigo === "03" || codigo === "04") f.tipo_integracao = "2";
  if (codigo === "99") f.descricao_pagamento = descricaoOutros.slice(0, 60) || "Outros";
  return f;
}

// Em Homologacao a SEFAZ exige esses textos na descricao do 1o item e no nome
// do destinatario (senao rejeita a nota).
const TEXTO_HOMOLOGACAO = "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
const NOME_HOMOLOGACAO = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(cpf[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

// A Focus devolve {mensagem, erros:[{codigo, mensagem, campo}]}. Guardamos tudo
// junto pra aparecer na tela e dar pra corrigir sem adivinhar.
function mensagemDeErro(data: any, fallback: string): string {
  const base = data?.mensagem_sefaz || data?.mensagem || fallback;
  if (Array.isArray(data?.erros) && data.erros.length) {
    const detalhes = data.erros
      .map((e: any) => [e?.campo, e?.mensagem].filter(Boolean).join(": "))
      .filter(Boolean)
      .join(" | ");
    if (detalhes) return `${base} — ${detalhes}`.slice(0, 1000);
  }
  return String(base).slice(0, 1000);
}

// Data de emissao no horario de Manaus (UTC-4, sem horario de verao desde
// 2019 — mesma logica ja usada em send-whatsapp-triggers/index.ts e na tela
// manual de NF-e).
function dataEmissaoManaus(): string {
  const now = new Date();
  const manaus = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return manaus.toISOString().replace(/\.\d+Z$/, "-04:00");
}

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

// Config fiscal + credencial da Focus NFe desta otica. So devolve algo
// quando a emissao automatica estiver LIGADA e o token ja tiver sido
// cadastrado — os dois sao setados so por SQL direto pelo Carlos (ver
// migration_focus_nfe.sql), nunca por uma tela.
async function configFiscal(tenantId: string): Promise<any | null> {
  const rows = await supabaseFetch(`fiscal_config?tenant_id=eq.${tenantId}&select=*`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row || null;
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

    const profiles = await supabaseFetch(`user_profiles?id=eq.${userId}&select=id,tenant_id,role`);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile || !profile.tenant_id) return json({ error: "perfil não encontrado" }, 403);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ---------- EMITIR: chamada pelo botao "Emitir NFC-e" de cada venda em
    // VendasPage.tsx (nem toda venda leva nota — o operador escolhe). Erros de
    // emissao voltam como resposta normal (nao HTTP 500), pro frontend avisar. ----------
    if (action === "emitir") {
      const saleId = String(body.sale_id || "");
      if (!saleId) return json({ error: "sale_id obrigatório" }, 400);

      const sales = await supabaseFetch(`sales?id=eq.${saleId}&select=*`);
      const sale = Array.isArray(sales) ? sales[0] : null;
      if (!sale) return json({ error: "venda não encontrada" }, 404);
      if (sale.tenant_id !== profile.tenant_id) return json({ error: "venda não pertence a esta ótica" }, 403);

      // Idempotencia: nota ja autorizada (ou ainda em processamento) nao e
      // emitida de novo. Tentativa anterior com erro pode ser refeita, com uma
      // referencia nova na Focus (a antiga fica registrada como historico).
      const existentes = await supabaseFetch(
        `nfe?sale_id=eq.${saleId}&origem=eq.automatica&select=*&order=created_at.desc`
      );
      const tentativas = Array.isArray(existentes) ? existentes : [];
      const ultima = tentativas[0];
      if (ultima && ultima.status !== "erro") {
        return json({ skipped: false, success: true, ja_existia: true, status: ultima.status, danfe_url: ultima.danfe_url, nfe_id: ultima.id });
      }

      const config = await configFiscal(profile.tenant_id);
      // A coluna ainda se chama emissao_automatica_ativa por historico, mas hoje
      // significa "integracao com a Focus NFe ligada nesta otica".
      if (!config || !config.focus_nfe_token || !config.emissao_automatica_ativa) {
        return json({ skipped: false, success: false, error: "Emissão de NFC-e pela Focus NFe não está ativada nesta ótica" });
      }
      if (!config.cnpj) {
        return json({ skipped: false, success: false, error: "CNPJ não configurado em Configuração Fiscal" });
      }

      const itensRaw = await supabaseFetch(`sale_items?sale_id=eq.${saleId}&select=*`);
      const itens = Array.isArray(itensRaw) ? itensRaw : [];
      if (itens.length === 0) {
        return json({ skipped: false, success: false, error: "venda sem itens" });
      }

      const homologacao = config.ambiente !== "1";

      let clienteCpf = "";
      if (sale.customer_id) {
        const custs = await supabaseFetch(`customers?id=eq.${sale.customer_id}&select=cpf`);
        const cust = Array.isArray(custs) ? custs[0] : null;
        clienteCpf = (cust?.cpf || "").replace(/\D/g, "");
        // CPF com digito errado faz a SEFAZ rejeitar a nota inteira; nesse caso
        // a nota sai sem CPF (consumidor nao identificado), que e permitido na NFC-e.
        if (!cpfValido(clienteCpf)) clienteCpf = "";
      }

      // Valores da nota: soma dos itens menos o desconto da venda. NAO usar
      // sale.total direto — nesta base ele e o SALDO DEVEDOR (ja sem desconto
      // e sem entrada), ver CLAUDE.md "Layout - Aba Vendas e OS".
      const somaItens = Math.round(itens.reduce((s: number, it: any) => s + Number(it.total || 0), 0) * 100) / 100;
      const desconto = Math.min(Math.max(Number(sale.discount || 0), 0), somaItens);
      const totalNota = Math.round((somaItens - desconto) * 100) / 100;

      // O desconto do cabecalho precisa estar distribuido nos itens (a soma
      // tem que bater), proporcional ao valor de cada um.
      let descontoRestante = desconto;
      const itemsFocus: ItemFocus[] = itens.map((item: any, i: number) => {
        const bruto = Number(item.total || 0);
        const qtd = Number(item.quantity || 1);
        let descItem = 0;
        if (desconto > 0) {
          descItem = i === itens.length - 1
            ? Math.round(descontoRestante * 100) / 100
            : Math.round((desconto * bruto / somaItens) * 100) / 100;
          descontoRestante -= descItem;
        }
        const unit = qtd > 0 ? bruto / qtd : bruto;
        const it: ItemFocus = {
          numero_item: i + 1,
          codigo_produto: String(item.product_id || `ITEM${i + 1}`).slice(0, 60),
          descricao: homologacao && i === 0 ? TEXTO_HOMOLOGACAO : String(item.description || "Produto").slice(0, 120),
          cfop: "5102",
          // NCM padrao de artigos de optica (armacoes/lentes/oculos). Se a
          // otica vender outras categorias com NCM diferente, isso precisa
          // virar um campo por produto no futuro.
          codigo_ncm: "90049000",
          unidade_comercial: "UN",
          quantidade_comercial: qtd.toFixed(4),
          valor_unitario_comercial: unit.toFixed(10),
          valor_bruto: bruto.toFixed(2),
          unidade_tributavel: "UN",
          quantidade_tributavel: qtd.toFixed(4),
          valor_unitario_tributavel: unit.toFixed(10),
          icms_origem: "0",
          // CSOSN 400 = Simples Nacional, nao tributado pelo ICMS. Confirmar
          // com o contador antes de ligar em Producao.
          icms_situacao_tributaria: config.regime_tributario === "3" ? "40" : "400",
          pis_situacao_tributaria: "07",
          cofins_situacao_tributaria: "07",
        };
        if (descItem > 0) it.valor_desconto = descItem.toFixed(2);
        return it;
      });

      // Pagamentos: no crediario com entrada, a entrada entra como dinheiro
      // (a venda nao guarda a forma da entrada) e o restante como Credito Loja.
      const codigoPrincipal = codigoFormaPagamento(sale.payment_method);
      const entrada = Math.min(Math.max(Number(sale.entrada || 0), 0), totalNota);
      const formas = [];
      if (entrada > 0 && entrada < totalNota) {
        formas.push(formaPagamentoFocus("01", entrada, ""));
        formas.push(formaPagamentoFocus(codigoPrincipal, Math.round((totalNota - entrada) * 100) / 100, sale.payment_method));
      } else {
        formas.push(formaPagamentoFocus(codigoPrincipal, totalNota, sale.payment_method));
      }

      const payload: Record<string, unknown> = {
        natureza_operacao: "Venda ao Consumidor",
        data_emissao: dataEmissaoManaus(),
        cnpj_emitente: config.cnpj.replace(/\D/g, ""),
        presenca_comprador: "1",
        consumidor_final: "1",
        finalidade_emissao: "1",
        modalidade_frete: "9",
        local_destino: "1",
        indicador_inscricao_estadual_destinatario: "9",
        informacoes_adicionais_contribuinte: `Venda OptiFlow #${String(sale.sale_number || "").padStart(4, "0")}`,
        valor_produtos: somaItens.toFixed(2),
        valor_desconto: desconto.toFixed(2),
        valor_total: totalNota.toFixed(2),
        items: itemsFocus,
        formas_pagamento: formas,
      };
      if (clienteCpf) {
        payload.cpf_destinatario = clienteCpf;
        payload.nome_destinatario = homologacao ? NOME_HOMOLOGACAO : String(sale.customer_name || "").slice(0, 60);
      }

      const valorTotal = totalNota;
      // Cada tentativa precisa de uma referencia nova na Focus.
      const ref = (tentativas.length ? `optiflow-${saleId}-${tentativas.length + 1}` : `optiflow-${saleId}`).slice(0, 60);
      const base = focusBaseUrl(config.ambiente);

      let focusRes: Response;
      try {
        focusRes = await fetch(`${base}/nfce?ref=${encodeURIComponent(ref)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: focusAuthHeader(config.focus_nfe_token),
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        return json({ skipped: false, success: false, error: `Falha de rede ao chamar a Focus NFe: ${String(err)}` });
      }

      const data = await focusRes.json().catch(() => ({}));
      const statusFocus = data?.status || (focusRes.ok ? "processando_autorizacao" : "erro");
      const mensagemErro = !focusRes.ok
        ? mensagemDeErro(data, `Erro HTTP ${focusRes.status} da Focus NFe`)
        : statusFocus === "erro_autorizacao"
        ? mensagemDeErro(data, "Rejeitado pela SEFAZ")
        : null;

      const statusInterno = statusFocus === "autorizado" ? "autorizado" : mensagemErro ? "erro" : "gerado";

      const inserted = await supabaseFetch("nfe?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([
          {
            tenant_id: profile.tenant_id,
            sale_id: saleId,
            numero: Number(data?.numero) || 0,
            serie: data?.serie || config.serie_nfe || "1",
            status: statusInterno,
            natureza_operacao: "Venda de mercadoria",
            data_emissao: new Date().toISOString().slice(0, 10),
            cliente_nome: sale.customer_name || "Consumidor",
            cliente_cpf_cnpj: clienteCpf || null,
            cliente_endereco: null,
            total_produtos: somaItens,
            total_desconto: desconto,
            total_nota: valorTotal,
            xml_gerado: null,
            observacoes: `Emitida automaticamente via Focus NFe (ref ${ref})`,
            origem: "automatica",
            focus_ref: ref,
            focus_status: statusFocus,
            chave_nfe: data?.chave_nfe || null,
            danfe_url: data?.caminho_danfe || data?.url_danfe || null,
            xml_url: data?.caminho_xml_nota_fiscal || null,
            erro_mensagem: mensagemErro,
          },
        ]),
      });
      const nfeRow = Array.isArray(inserted) ? inserted[0] : null;

      if (mensagemErro) {
        return json({ skipped: false, success: false, error: mensagemErro, nfe_id: nfeRow?.id, focus_status: statusFocus });
      }
      return json({
        skipped: false,
        success: true,
        status: statusInterno,
        focus_status: statusFocus,
        danfe_url: nfeRow?.danfe_url || null,
        nfe_id: nfeRow?.id,
      });
    }

    // ---------- STATUS: re-consulta uma nota que ficou "processando" (raro
    // em NFC-e, que normalmente responde na hora — serve de rede de
    // seguranca pra contingencia). Botao "Verificar status" no NfePage.tsx. ----------
    if (action === "status") {
      const nfeId = String(body.nfe_id || "");
      if (!nfeId) return json({ error: "nfe_id obrigatório" }, 400);

      const notas = await supabaseFetch(`nfe?id=eq.${nfeId}&select=*`);
      const nota = Array.isArray(notas) ? notas[0] : null;
      if (!nota || nota.tenant_id !== profile.tenant_id) return json({ error: "nota não encontrada" }, 404);
      if (!nota.focus_ref) return json({ error: "nota não foi emitida via Focus NFe" }, 400);

      const config = await configFiscal(profile.tenant_id);
      if (!config?.focus_nfe_token) return json({ error: "token da Focus NFe não configurado" }, 400);

      const base = focusBaseUrl(config.ambiente);
      const r = await fetch(`${base}/nfce/${encodeURIComponent(nota.focus_ref)}`, {
        headers: { Authorization: focusAuthHeader(config.focus_nfe_token) },
      });
      const data = await r.json().catch(() => ({}));
      const statusFocus = data?.status || nota.focus_status;
      const mensagemErro = statusFocus === "erro_autorizacao" ? mensagemDeErro(data, nota.erro_mensagem || "Rejeitado pela SEFAZ") : null;
      const statusInterno = statusFocus === "autorizado" ? "autorizado" : mensagemErro ? "erro" : "gerado";

      await supabaseFetch(`nfe?id=eq.${nfeId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: statusInterno,
          focus_status: statusFocus,
          chave_nfe: data?.chave_nfe || nota.chave_nfe,
          danfe_url: data?.caminho_danfe || data?.url_danfe || nota.danfe_url,
          numero: Number(data?.numero) || nota.numero,
          erro_mensagem: mensagemErro,
        }),
      });

      return json({ status: statusInterno, focus_status: statusFocus, danfe_url: data?.caminho_danfe || data?.url_danfe || nota.danfe_url, erro_mensagem: mensagemErro });
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
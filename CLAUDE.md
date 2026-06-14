# OptiFlow - Contexto do Projeto

## Visao Geral
Sistema SaaS multi-tenant para oticas (gestao de clientes, vendas, OS, crediario, estoque, financeiro).
- Frontend: React + TypeScript + Vite
- Backend: Supabase (Postgres + Auth + Storage + Edge Functions)
- Repo: https://github.com/carlosevideo1211/OptiFlow.git
- Tenant principal de testes: Otica Evangelista Castanho (tenant_id: 2ca58112-4498-4dfa-b6d1-550630d5c4a4)
- Usuario master: Carlos Video (dono da Otica Evangelista Castanho)

## Convencoes Importantes

### Multi-tenant
- TODA query no banco deve filtrar por .eq(tenant_id, tenantId).
- tenantId vem do AuthContext (useAuth()), via effectiveTenantId.
- AuthContext usa admin_viewing_tenant no localStorage SOMENTE quando user.role === system_admin.
  Para qualquer outro role, esse valor e limpo automaticamente do localStorage no login (evita
  vazamento de tenant_id entre sessoes de Admin e usuarios normais).

### Listagens sem limite (IMPORTANTE)
- O Supabase/PostgREST tem limite padrao de 1000 linhas por consulta.
- Para QUALQUER lista que pode crescer (clientes, produtos, vendas, OS, crediario, etc),
  use a funcao fetchAllRows em src/lib/fetchAll.ts:

  import { fetchAllRows } from '../lib/fetchAll';

  const data = await fetchAllRows<Tipo>((from, to) =>
    supabase.from(tabela).select(*).eq(tenant_id, tenantId).order(campo).range(from, to)
  );

  Ja aplicado em: ClientesPage, ProdutosPage, VendasPage (produtos e clientes),
  OrdemServicoPage (OS, produtos, clientes), CrediarioPage (crediario e clientes),
  AgendaPage (clientes), NovaConsultaModal (clientes), RelatoriosPage (vendas, clientes,
  OS, financeiro, itens de venda).
- Queries com { count: exact, head: true } (so contagem) NAO sao afetadas pelo limite.
- Pendente/baixo risco: DashboardPage salesHistory (vendas do periodo do grafico) -
  so seria um problema com mais de 1000 vendas em um unico mes.

## Layout - Aba Vendas e OS (Detalhes do Cliente)
- total na tabela sales/service_orders representa o SALDO DEVEDOR (ja com desconto e entrada
  subtraidos), nao o valor bruto do produto.
- Na OS, o calculo de totalCalculado em OrdemServicoPage.tsx e:
  Math.max(0, totalItens - discount - entrada).

## Carne / Canhoto (VendasPage.tsx)
- Cada canhoto (parcela do crediario) mostra: Vencimento -> Valor Cobrado -> Nome do Cliente -> QR Code (centralizado).
- Campo "Valor Recebido" foi removido do canhoto e substituido pelo nome do cliente.
- O nome do cliente aparece em class=sig (estilizado com font-size:11px, fontWeight:700, color:#000).

## Anexar Receitas (ClientesPage.tsx)
- Botao de clipe (Paperclip) nas Acoes da lista de clientes, ao lado do WhatsApp.
- Modal "Receitas Medicas" com upload de PDF/imagem.
- Tabela: customer_attachments (id, tenant_id, customer_id, file_name, file_path, created_at).
- Bucket Supabase Storage: attachments (publico).
- RLS de customer_attachments e storage.objects (bucket attachments) DESABILITADO/com policy
  allow_all para evitar erros 400 no upload.
- Nome de arquivo e sanitizado (safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,_)) antes do upload.
- Modal usa ReactDOM.createPortal para document.getElementById(modal-root) || document.body
  (existe um <div id="modal-root"> no index.html, separado do <div id="root">), para o
  overlay escuro cobrir TODA a tela (incluindo sidebar). Ao abrir, adiciona classe modal-open
  no .app-layout (CSS: .app-layout.modal-open { overflow: visible !important; }) e
  document.body.style.overflow=hidden / document.documentElement.style.overflow=hidden.
  Ao fechar, reverte tudo.

## Integracao Asaas (cobranca por inquilino)
- Cada inquilino configura sua PROPRIA chave Asaas em Configuracoes -> Integracoes
  (campos: asaas_key, asaas_env [sandbox|production], asaas_enabled na tabela store_settings).
- A Edge Function supabase/functions/create-boleto/index.ts recebe asaas_key e asaas_env
  no body da requisicao (enviados pelo frontend a partir de storeSettings), com fallback para
  variaveis de ambiente do servidor (ASAAS_API_KEY/ASAAS_ENV) se o inquilino nao configurar.
- Se nenhuma chave estiver disponivel, a function lanca erro pedindo para configurar em
  Configuracoes > Integracoes.
- Apos editar a function, fazer deploy: npx supabase functions deploy create-boleto.

## Financeiro - Crediario
- Ao finalizar uma venda no crediario (VendasPage.tsx), o sistema lanca em financial_transactions:
  1. A entrada (se houver) como status: pago.
  2. Cada parcela do crediario como status: pendente, categoria Crediario, com
     due_date da parcela - isso alimenta a aba "Contas a Receber" do Financeiro.

## Importacao de Dados (ImportacaoPage.tsx)
- Aba Clientes usa insert() simples (NAO usar upsert com onConflict - causa falha silenciosa).
- CPF vazio e permitido: indice unico customers_tenant_cpf_unique e PARCIAL
  (WHERE cpf IS NOT NULL AND cpf != ), entao multiplos clientes sem CPF nao conflitam.
- tenantId deve vir SEMPRE de useAuth() (nunca usar fallback hardcoded de tenant_id).

## Workflow de Edicao (Windows/PowerShell)
- O usuario edita arquivos via scripts Python embutidos em heredocs do PowerShell
  (@"..."@ | Out-File ... ; python script.py), pois nao tem o Claude Code com edicao direta.
- Apos editar, sempre rodar: npm run build 2>&1 | Select-String "error" | Select-Object -First 3
  para verificar erros de TypeScript antes de testar no navegador.
- Para ver mudancas no navegador: npm run dev (se nao estiver rodando) + Ctrl+Shift+R.
- ATENCAO: dentro de heredocs do PowerShell com aspas duplas (@"..."@), NAO usar backtick (`),
  pois PowerShell interpreta como escape (ex: `u vira erro de unicode). Usar heredoc de aspas
  simples (@'...'@) para conteudo com backtick, ou evitar backtick.
- Cuidado com escaping: strings com aspas dentro de heredocs as vezes precisam de regex (re.sub)
  com \s* no lugar de espacos literais, pois a formatacao do codigo tem espacamento irregular.

## Historico de Correcoes Aplicadas
1. Layout Vendas/OS com Desconto, Entrada e Total separados (saldo devedor correto).
2. Canhoto do carne com nome do cliente, QR code centralizado.
3. Modal "Anexar Receitas" com upload para Supabase Storage.
4. Chave Asaas configuravel por inquilino (Configuracoes > Integracoes).
5. CPF vazio nao bloqueia novo cadastro de cliente.
6. Parcelas do crediario aparecem em Financeiro > Contas a Receber.
7. Correcao do tenant_id na importacao (AuthContext limpa admin_viewing_tenant para nao-admins).
8. Importacao de clientes usa insert simples (sem upsert com onConflict).
9. Remocao do limite de 1000 registros em todas as listagens (fetchAllRows).

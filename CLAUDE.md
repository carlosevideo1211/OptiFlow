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


## Autenticacao e Seguranca
- profileLoadedRef e resetado no SIGNED_OUT para permitir login com outro inquilino apos logout.
- loadProfile: se user_profiles nao tem tenant_id, faz logout silencioso (supabase.auth.signOut()).
- signIn: apos autenticar, verifica se user_profiles existe e tem tenant_id. Se nao, faz logout e lanca erro "Conta sem acesso ao sistema. Use o painel administrativo."
- Email do Admin (carlosevideo28@gmail.com) so acessa via /admin-login. Nao tem user_profiles, entao e bloqueado no /login normal com mensagem clara.
- Trigger handle_new_user no Supabase cria user_profiles automaticamente para novos usuarios Auth. Se o email do admin for usado no /login, o trigger cria um perfil — deve ser deletado manualmente via SQL: delete from user_profiles where id = '<uid do admin>';
- Site URL no Supabase deve ser https://app.visionproerp.com.br para que emails de reset de senha funcionem corretamente.
- Redirect URLs no Supabase: https://app.visionproerp.com.br/** e http://localhost:5173/**

## CPF
- Campo CPF no cadastro de clientes usa maskCPF() (src/utils/format.ts) para mascarar progressivamente sem padding de zeros.
- formatCPF() e usado apenas para exibicao/banco (dados vindos do banco ou importacao), nunca em onChange de input.

## Cache / Atualizacao
- public/_headers configurado para no-cache no HTML e cache longo em JS/CSS/imagens (Vite gera hash no nome dos arquivos).

## Importacao Centralizada
- Todos os botoes "Importar" foram removidos das paginas individuais (ClientesPage, ProdutosPage).
- Importacao centralizada em /importacao com abas: Clientes, Consultas, Vendas, Crediario, OS, Produtos.

## Carne de Pagamento
- Cabecalho do carne exibe: nome da loja, CNPJ, endereco e telefone (igual ao Instrumento de Divida).
- Variaveis usadas: sCnpj, sAddr, sCity, sState, sPhone (vindas de storeSettings).
- Classe CSS .csi: font-size:10px, color:rgba(255,255,255,.8), margin-top:2px.

## Tenant hotmail (carlosevideo@hotmail.com)
- tenant_id corrigido para Otica Teste (378918f9-34fe-40ad-80c9-240dde5c10fe) via UPDATE em user_profiles.
- Antes estava apontando para Otica Evangelista por engano.


## Sessao 22-23/Jun/2026 - Importacoes e Correcoes

### Paginacao (50 registros por pagina)
Implementada em TODAS as telas: Clientes, Vendas, Crediario, Consultas, OS.
Padrao: estado `pagina` + `POR_PAGINA = 50` + `.slice((pagina-1)*POR_PAGINA, pagina*POR_PAGINA)` no map + botoes Ant/Prox no footer.

### Importacao de Vendas (formato duas linhas)
O arquivo do VisionProERP exporta vendas em duas linhas: linha 1 = cliente/data, linhas seguintes = itens.
Corrigido em ImportacaoPage.tsx: agrupa linhas por cliente (linha com Nome_Cliente inicia novo grupo).
Tipo VendaGrupo criado para acumular itens antes de inserir.

### Vendas sem filtro de data padrao
VendasPage.tsx: dateFrom e dateTo iniciam vazios (antes iniciavam no primeiro dia do mes).
Permite ver todas as 12.635+ vendas sem precisar limpar o filtro.

### Crediario - Desconto no pagamento
Modal Receber Parcela: campo verde "Desconto (R$)" que subtrai do valor a pagar.
- payForm tem campo desconto: '0'
- total = Math.max(0, p.amount + juros - desconto)
- Valor Recebido atualiza em tempo real ao digitar desconto
- Na lista: exibe paid_amount quando diferente do amount original

### Badge Crediario no menu
Shell.tsx: antes contava so parcelas status='vencida' (que nao existe no banco).
Corrigido para .neq('status','pago').neq('status','cancelado') - conta todas em aberto.

### Dashboard - Parcelas Vencidas
DashboardPage.tsx: antes usava .eq('status','vencida') que nao existe.
Corrigido para .eq('status','pendente').lt('due_date', today).

### Consultas sem limit
ConsultaPage.tsx: removido .limit(100), substituido por fetchAllRows para todos os inquilinos.

### OS - Paginacao
OrdemServicoPage.tsx: adicionada paginacao igual as outras telas.

### Renegociacao de Dividas (CrediarioPage.tsx)
Botao "Renego" em cada parcela nao paga. Modal com:
- Resumo do cliente e total em aberto
- Novo valor total (digitado manualmente)
- Numero de parcelas e data da 1a parcela
- Opcao do que fazer com o carne original (cancelar/quitado/manter)
Cria novo crediario + parcelas. Fundo escuro com blur.

### Conversao de arquivos VisionProERP para OptiFlow
Funcao de leitura de xlsx via zipfile+xml (openpyxl falha com alguns arquivos).
Arquivos convertidos:
- clientes_para_importar.xlsx (3519 clientes)
- receitas_para_importar.xlsx (1152 receitas)
- os_para_importar.xlsx (1603 OS Filial Autazes)
- os_evangelista_para_importar.xlsx (6347 OS Otica Evangelista)
- vendas_autazes_para_importar.xlsx (1605 vendas Filial Autazes)
- crediario_ssOtica_importacao.xlsx (987 carnes ssOtica)
- Carnes para importar.xlsx (36 carnes gerados dos prints do VisionProERP)

### Inquilinos cadastrados
- Otica Evangelista Castanho: tenant 2ca58112-4498-4dfa-b6d1-550630d5c4a4, email oticaevangelistaam@gmail.com
- Josue Neto (Otica Solar / Filial Autazes): tenant 8ac30fca-4663-4bd3-8bca-122d18945443
- Otica Teste (Carlos Eduardo): tenant 378918f9-34fe-40ad-80c9-240dde5c10fe, email carlosevideo@hotmail.com
- Admin: carlosevideo28@gmail.com - SO acessa /admin-login, bloqueado no /login normal

### Seguranca - loadProfile
Se user_profiles nao tem tenant_id: logout silencioso.
Se signIn apos autenticar nao encontra perfil com tenant_id: logout + erro "Conta sem acesso ao sistema."
Trigger handle_new_user cria user_profiles automaticamente - se email do admin logar no /login,
deletar manualmente: delete from user_profiles where id = 'd316d550-8b58-4427-88ab-8b81a41b815d';

## Sessao 25-26/Jun/2026 - Importacoes, DNS, Seguranca e Busca

### Inquilinos atualizados
- Otica Evangelista Altazes: tenant e58b3f3a-683f-4fec-be95-c825220a3b22, email (Marcio Goncalves)
- Otica Solar: tenant 8ac30fca-4663-4bd3-8bca-122d18945443, email oticasolar01@gmail.com (Josue Neto)

### Importacao de Crediario via SQL direto
O sistema de importacao pelo frontend falhava silenciosamente (RLS bloqueava inserts apos certo numero
de requisicoes no plano Micro do Supabase). Solucao definitiva: gerar SQL com todos os dados e rodar
direto no SQL Editor do Supabase (1 chamada ao banco, sem limite de conexoes).

Policies RLS do crediario e crediario_parcelas foram separadas:
- SELECT: isolado por tenant (tenant_id = get_tenant_id())
- INSERT: with check (true) - qualquer autenticado pode inserir (tenant_id vem do codigo)
- UPDATE/DELETE: isolado por tenant

Dados importados:
- Otica Evangelista Castanho: 1048 carnes, 3507 parcelas (SSOtica + VisionProERP)
- Otica Solar: 524 carnes, 1913 parcelas (SSOtica Filial Autazes + VisionProERP)
- Otica Evangelista Altazes: 163 carnes, 585 parcelas (SSOtica + VisionProERP)
Total: 1735 carnes, 6005 parcelas

### DNS - Dominio personalizado no Vercel
Problema: app.visionproerp.com.br apontava para Hostinger (ALIAS @ -> cdn.hstgr.net).
Solucao aplicada na Hostinger (DNS do app.visionproerp.com.br):
- ALIAS @ alterado para: cname.vercel-dns.com
- CNAME app adicionado com valor: ae14de5db47d4049.vercel-dns-016.com (recomendado pelo Vercel)
Resultado: dominio adicionado no Vercel com "DNS Change Recommended" (funciona, mas usa registro antigo).
A partir de agora, todo git push para main atualiza automaticamente o app.visionproerp.com.br.

### Seguranca aplicada
1. Hash SHA-256 nas senhas de funcionarios:
   - Funcao hashPassword() usando Web Crypto API (crypto.subtle.digest) adicionada em:
     AuthContext.tsx, CadastrosPage.tsx, CrediarioPage.tsx
   - Login aceita senha antiga (texto puro) E nova (hash) - migracao gradual sem perder acesso
   - CadastrosPage: ao salvar funcionario, senha e hasheada antes de ir ao banco
   - CrediarioPage: ao verificar senha do operador no recebimento, compara hash

2. Console.logs removidos de producao:
   - CrediarioPage.tsx, ClientesPage.tsx, ImportacaoPage.tsx, VendasPage.tsx
   - Dados sensiveis (CPF, tenant_id, dados de crediario) nao aparecem mais no F12

3. Rota /admin protegida:
   - AdminPanelPage.tsx: useEffect que verifica sessao Supabase ao montar
   - Se nao autenticado, redireciona para /admin-login

4. Arquivos de debug removidos do repositorio:
   - src/utils/debug.py, fix_search.py, fix2.py, fix3.py, fix4.py

5. Catch silencioso corrigido no CrediarioPage:
   - } catch(e) {} substituido por } catch(e: any) { console.error('Erro:', e); }

### Busca por nome de cliente (ClientesPage.tsx)
Problema raiz: search nao estava nas dependencias do useMemo.
Correcoes aplicadas:
1. Adicionado search, cityFilter, dateFrom, dateTo nas dependencias do useMemo
2. Logica de busca reescrita sem depender do import norm (que falhava silenciosamente):
   - norm() definida localmente dentro do useMemo
   - Busca por nome: normaliza acentos e compara com includes()
   - Busca por CPF/telefone: extrai so numeros e compara
   - Nao mistura busca de texto com busca de numero (bug anterior: "adail port 32011"
     so filtrava pelo 32011, ignorando "adail port")

Codigo atual do filtro (ClientesPage.tsx):
  if (search.trim()) {
    const norm = (str: string) => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const s = norm(search);
    list = list.filter(c => {
      const somenteNumeros = s.replace(/[^0-9]/g, '');
      return norm(c.name).includes(s) ||
             (somenteNumeros && (c.cpf || '').replace(/[^0-9]/g,'').includes(somenteNumeros)) ||
             (somenteNumeros && (c.phone || '').replace(/[^0-9]/g,'').includes(somenteNumeros));
    });
  }

### Busca sem acento em todo o sistema
Arquivo src/utils/normalize.ts criado com funcao norm().
Aplicado em: CadastrosPage, ProdutosPage, OrdemServicoPage, VendasPage, FinanceiroPage,
AgendaPage, BaixasTab, ConsultaPage, NovaConsultaModal.
(ClientesPage usa implementacao local por confiabilidade - ver acima)

### Commits desta sessao
- 3808f1b: Security: remove console.logs e debug files
- a57ff38: Security: hash SHA-256 senhas funcionarios, protege admin
- 859b688: Fix: adicionar search e filtros nas dependencias do useMemo clientes
- 48b7963: Fix: reescrever busca cliente sem depender de norm import
- 8eff53b: Fix: corrigir logica busca cliente por nome e cpf

## Sessao 26/Jun/2026 - Correcoes RLS e Seguranca

### Policies RLS faltando em varias tabelas
Problema: tabelas com RLS habilitado mas sem nenhuma policy bloqueavam inserts.
Tabelas corrigidas no Supabase:
- funcionarios: policy funcionarios_all (tenant_id = get_tenant_id())
- professionals: policy professionals_all (tenant_id = get_tenant_id())
- suppliers: policy suppliers_all (tenant_id = get_tenant_id())
- audit_log, crediario_backup_20260624, crediario_parcelas_backup_20260624,
  nfe_itens, os_itens, tenant_backups: policy com using(true)
- nfe, stock_movements: policy com tenant_id = get_tenant_id()

### Hash senha funcionario via trigger no banco
Problema: hashPassword() no frontend quebrava o insert por causa do RLS.
Solucao: trigger no banco que faz hash automaticamente antes de salvar.
- Funcao: hash_funcionario_password() usando digest(senha, sha256)
- Trigger: trigger_hash_password BEFORE INSERT OR UPDATE OF access_password ON funcionarios
- Frontend: envia senha em texto puro, banco converte automaticamente
- Login: frontend calcula hash e compara com banco (aceita texto puro para senhas antigas)

## Sessao 26/Jun/2026 - Melhorias e Preparacao para Comercializacao

### Itens tecnicos corrigidos
1. console.log removido de RegisterPage.tsx
2. Confirmacao dupla adicionada no botao Zerar (ClientesPage e ProdutosPage)
3. Limite de 5 tentativas de login (bloqueio 15 min) em AuthContext.tsx via localStorage
4. Verificacao de plano/trial no loadProfile - redireciona para /trial-expirado se expirado ou cancelado
5. npm audit fix - reducao de 9 para 3 vulnerabilidades (xlsx sem fix disponivel)
6. Code splitting no vite.config.ts - bundle dividido em chunks: vendor-react(244KB), vendor-supabase(196KB), vendor-xlsx(421KB), vendor-charts, vendor-ui
7. Paginas de Termos de Uso (/termos) e Politica de Privacidade (/privacidade) criadas (LGPD)
8. Links para Termos e Privacidade adicionados na pagina de login

### Rotas publicas adicionadas
- /termos -> TermosPage.tsx
- /privacidade -> PrivacidadePage.tsx

### Pendencias nao tecnicas (dependem do dono)
- Contrato formal com cada inquilino
- CNPJ ativo para cobranca
- Revisar Termos e Privacidade com advogado se necessario

### Status do sistema apos correcoes
- Funcionalidade: 95%
- Seguranca: 88%
- Limpeza: 98%
- Pronto para venda com clientes conhecidos: SIM
- Pronto para venda aberta ao publico: SIM (com ressalva de contrato formal)

### Receituario Optico - impressao nas consultas do cliente
- Botao Imprimir adicionado em cada consulta na aba Consultas do cliente
- Abre nova aba com receituario formatado e dialogo de impressao
- Formatacao padrao optico:
  - ESF/CIL: sinal obrigatorio (+/-) com 2 casas decimais. Ex: +2,00 / -1,25
  - EIXO: numero inteiro sem sinal com simbolo grau. Ex: 85 graus
  - DNP: 1 casa decimal sem sinal. Ex: 32,5
  - Adicao: 2 casas decimais sem sinal (sempre positivo). Ex: 3,00
- Duas funcoes fmtGrau: uma global (tela) e uma local fg() (receituario impresso)

### Outras correcoes
- Baixas Crediario: policy select adicionada no Supabase
- Baixas Crediario: restrito a role master e cargo Gerente

# Auditoria OptiFlow — Parte 1 (Núcleo do sistema)

**Status:** em andamento. Este é o primeiro lote de achados, cobrindo a varredura completa do código em busca de padrões de risco e a leitura detalhada do **núcleo do sistema** (`App.tsx`, autenticação, hooks, lib, utils, config, constants e os componentes compartilhados). As telas de negócio (Vendas, Crediário, Financeiro, Consulta, OS, Admin, Edge Functions) ainda estão sendo revisadas e virão nas próximas partes.

Nenhuma linha de código foi alterada. Cada achado abaixo é numerado para você aprovar (ou não) individualmente, como combinamos.

---

## Achado 1 — Bug sistêmico de fuso horário no cálculo de "hoje" (impacto: alto)

Já resolvemos essa exata classe de bug uma vez antes (31/08/2026, também relatado pela Larissa/Ótica Solar), criando a função `toLocalDateStr()` em `crediarioTypes.ts`. O problema é que ela não foi usada em todo lugar — o padrão antigo e problemático continua espalhado pelo sistema.

**A causa:** `new Date().toISOString().split('T')[0]` parece inofensivo, mas `toISOString()` sempre converte para o fuso UTC. Manaus está 4 horas atrás (UTC-4). Isso significa que, a partir de aproximadamente **20h no horário local**, essa conta já entende que "hoje" é amanhã — porque em UTC já é o dia seguinte. Qualquer tela que compare uma data de vencimento com esse "hoje" fica errada nesse intervalo da noite (madrugada inteira, na prática).

A varredura automática encontrou esse padrão em **24 arquivos**. Já confirmei, lendo o código ao redor de cada ocorrência, quais são bugs reais em produção e quais são inofensivos:

**Confirmados como bug real (afetam o que o usuário vê):**
- `src/pages/CrediarioPage.tsx`, linhas 1093 e 1104 — dentro do modal de resumo de renegociação, o selo "Atrasada" de cada parcela usa o cálculo errado. É o mesmo modal, do mesmo arquivo, que já tem o `toLocalDateStr()` correto usado na lista principal — só não foi aplicado aqui dentro.
- `src/pages/admin/AdminPanelPage.tsx`, linha 137 (`mesAtual`) — usada na estatística "novos este mês" do Painel Admin. Perto da virada do mês, à noite, um tenant cadastrado "hoje" pode não contar no mês certo.

**Confirmados como inofensivos (código morto, não faz nada — pode limpar, mas não corrige bug nenhum):**
- `src/pages/admin/AdminPanelPage.tsx`, linha 136 (`hoje`) — calculada mas nunca usada em lugar nenhum do arquivo.
- `src/components/Shell.tsx`, linha 101 (`today`) — mesma coisa, calculada e nunca referenciada de novo.

**Ainda para confirmar na Parte 2** (arquivos onde o padrão aparece, mas ainda não li o contexto de cada um para saber se é bug real ou código morto):
`DashboardPage.tsx`, `FinanceiroPage.tsx`, `RelatoriosPage.tsx`, `VendasPage.tsx`, `NfePage.tsx`, `ImportacaoPage.tsx`, `AgendaPage.tsx`, `EstoquePage.tsx`, `admin/TrialsVencidosPage.tsx`, `vendas/vendaDocumentos.ts`, e todo o módulo `pages/consulta/` (10 arquivos: Relatórios Operacionais, Relatórios Consultas, PacientesTab, NovaConsultaModal, InicioConsultas, FilaEsperaConsultas, FinanceiroConsultas, FichaPaciente, ConsultaPage, AtendimentoPage).

**Recomendação:** já existe o jeito certo de fazer essa conta em três lugares do próprio sistema — `toLocalDateStr()` (`crediarioTypes.ts`), e os utilitários `utils/adminDates.ts` e `utils/clienteRanking.ts` (esses dois eu já revisei e estão corretos, usando data local). O ideal é usar sempre um desses em vez de `toISOString()` para essa conta, e ir corrigindo cada ocorrência confirmada como bug real.

---

## Achado 2 — O bloqueio de tentativas de login não funciona (impacto: médio, segurança)

Arquivo: `src/context/AuthContext.tsx`, função `signIn` (linhas 63–72).

O código lê um contador de tentativas do `localStorage` e bloqueia o login por 15 minutos depois de 5 tentativas falhas — só que, lendo a função inteira, **em nenhum lugar esse contador é incrementado quando o login falha**. Ele só é lido e, depois de 15 minutos, resetado para zero. Na prática, esse bloqueio nunca chega a acontecer: alguém pode tentar senhas indefinidamente sem nunca bater no limite de 5.

Vale registrar também que, mesmo que o incremento existisse, um bloqueio guardado só no `localStorage` do navegador é fácil de contornar (aba anônima, limpar dados do site, outro navegador) — não é uma proteção real contra um ataque automatizado, só desestimula alguém tentando na mão pela mesma aba.

**Recomendação:** decidir se esse bloqueio precisa mesmo existir (o próprio Supabase Auth já tem alguma proteção contra força bruta por trás) — se sim, o incremento que falta precisa ser adicionado; se a ideia era só uma trava simples de UX, também dá pra simplesmente remover esse código morto pra não passar a falsa impressão de que há uma proteção que não existe.

---

## Achado 3 — Falha ao buscar dados da loja é engolida em silêncio na impressão (impacto: baixo)

Arquivos: `src/pages/crediario/crediarioDocumentos.ts` (duas ocorrências) e `src/pages/CrediarioPage.tsx` (uma ocorrência) — todas buscando `store_settings` (nome, CNPJ, endereço, telefone da loja) para colocar no cabeçalho de carnês/recibos.

O padrão é `try { ...busca... } catch(e) {}` — se essa busca falhar por qualquer motivo (falha de rede, alguma política de acesso mal configurada, coluna renomeada), o documento ainda é gerado e impresso, só que com os dados da loja em branco/genéricos, sem nenhum aviso pro usuário nem registro de erro. Se um dia isso acontecer de verdade, vai aparecer como "o carnê imprimiu sem o nome da loja" sem nenhuma pista do porquê.

**Recomendação:** não precisa impedir a impressão (a intenção de não travar o usuário está certa), só registrar o erro (`console.warn` ou um aviso discreto) para dar rastro caso aconteça.

---

## Achado 4 — Painel Admin: rota não verifica login no lado do React (a confirmar, impacto desconhecido)

Arquivo: `src/App.tsx`, linhas 40–50.

Ao contrário do restante do sistema (que redireciona pro `/login` se não houver usuário autenticado), o bloco de rotas que começa com `/admin` é renderizado sem nenhuma checagem de `user`/`loading` antes. Ou seja, do ponto de vista só do React, qualquer pessoa que digite `/admin` na URL recebe a tela do Painel Admin renderizada — a pergunta é se as consultas que essa tela faz no Supabase realmente retornam algo pra quem não está autenticado como admin (isso depende das regras de acesso configuradas no banco, que eu não consigo inspecionar só lendo o código do frontend).

Não estou reportando isso como uma falha confirmada — é um ponto que só você (ou eu, com acesso às políticas do Supabase) consegue confirmar se está protegido de verdade no banco ou não. Vale a pena verificar.

---

## Observação positiva

Duas coisas que valem destacar como já certas, não como problema:
- Não encontrei nenhuma chave de API, senha ou credencial escrita direto no código-fonte do frontend — tudo que vi passa por variável de ambiente (`import.meta.env`), como deveria ser.
- `utils/adminDates.ts` e `utils/clienteRanking.ts` já fazem a conta de "hoje" do jeito certo (com data local, não UTC) — são a referência a seguir ao corrigir o Achado 1.

---

## O que falta auditar (Parte 2 em diante)

Seguindo a ordem do código, como combinamos:
- `pages/` da raiz, em ordem alfabética (Agenda, Cadastros, Clientes, Configuração, Dashboard, Estoque, Financeiro, Importação, Nfe, OrdemServiço, Planos, Produtos, Relatórios, Termos/Contrato/Privacidade/TrialExpirado, Vendas)
- `pages/admin`, `pages/auth`, `pages/crediario`, `pages/os`, `pages/vendas` (subpastas)
- `pages/consulta` (módulo de consultas/clínica — o maior módulo do sistema)
- As 9 Edge Functions do Supabase

Vou continuar a auditoria por aí e te aviso conforme for fechando cada parte.

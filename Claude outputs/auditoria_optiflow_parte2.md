# Auditoria OptiFlow — Parte 2 (Telas de negócio, primeira leva)

Continuação da Parte 1. Cobre as telas de nível raiz revisadas até agora: Agenda, Configuração, Produtos, Dashboard, Financeiro, Contrato/Termos/Privacidade/Trial-Expirado/Planos, Baixas. Ainda faltam: Relatórios, Nfe, Importação, Cadastros, Clientes, Ordem de Serviço (essas quatro últimas são as maiores do sistema) — vêm na Parte 3.

Nenhuma linha de código foi alterada.

---

## Achado 1 (continuação) — Novas confirmações do bug de fuso horário

O Achado 1 da Parte 1 (uso de `toISOString()` para calcular "hoje", que erra a partir de ~20h no horário de Manaus) apareceu em mais lugares — dois deles muito relevantes:

**`src/pages/FinanceiroPage.tsx` — a tela principal do Financeiro (impacto: alto)**

Essa é a tela mais afetada encontrada até agora: o `hoje` calculado errado é usado em **6 lugares diferentes** do arquivo (linhas 60, 69, 193, 208, 384, 443) para decidir se uma conta a pagar/receber está "vencida" — no card de resumo, nos selos de "Vencida" na lista, e nos badges dentro das linhas da tabela. E o `mesAtual` (linha 61) é usado para somar receita e despesa do mês (linhas 64, 65, 113).

Na prática: toda noite, a partir de aproximadamente 20h, qualquer conta com vencimento **hoje** passa a aparecer como **vencida** na tela de Financeiro — mesmo sem ter vencido de verdade — e isso se reflete em todo canto da tela (contador, selos, lista). Essa é exatamente o tipo de tela e de sintoma que a Larissa relatou.

**`src/pages/DashboardPage.tsx` — o painel inicial (impacto: alto)**

O card "Parcelas Vencidas" do Dashboard (linha 61) conta `crediario_parcelas` com `due_date < hoje` usando o mesmo cálculo errado — ou seja, à noite, uma parcela que vence **hoje** já entra na contagem de vencidas antes da hora. O mesmo `hoje` errado também afeta a "Receita Hoje" (linha 60, mostra vendas de um dia errado à noite) e "Consultas Hoje" (linha 62). E o `mesAtual` (usado para destacar o mês corrente no gráfico de faturamento, linha 329) também sofre o mesmo problema perto da virada do mês.

**`src/pages/AgendaPage.tsx` — a agenda de consultas (impacto: médio)**

A coluna "Hoje" destacada no calendário semanal e a data padrão ao abrir "Novo Agendamento" (linhas 48, 56, 89) usam o mesmo cálculo. À noite, quem abre a agenda vê o destaque de "hoje" na coluna errada, e um novo agendamento criado sem trocar a data manualmente cai no dia seguinte por engano.

Isso reforça o que já víamos na Parte 1: esse não é um bug isolado de uma tela, é um padrão usado errado em várias partes do sistema, e a tela de Financeiro (a mais crítica das encontradas até agora) tem a maior concentração de ocorrências.

---

## Achado 6 — Contrato do inquilino mostra plano e valor errados (impacto: alto)

Arquivo: `src/pages/ContratoPage.tsx`, linhas 35–40 e 61.

Essa tela é usada de verdade — tem um botão "Contrato" no Painel Admin (`AdminPanelPage.tsx`, linha 760) que abre `/contrato/:tenantId` para gerar o contrato de um inquilino específico.

O problema: os planos que essa tela reconhece são `trial`, `basico` (R$ 89), `profissional` (R$ 149) e `clinica` (R$ 249) — um modelo de 3 planos que não existe mais. A fonte única e atual de planos (`src/constants/planos.ts`, que o próprio comentário do arquivo diz ter sido centralizada **exatamente para evitar esse tipo de inconsistência**) só tem dois: Plano Ótica (R$ 99,99) e Plano Consultório (R$ 49,99). Os valores reais de `tenants.plan` hoje em dia também incluem coisas como `assinatura_pix_automatico` (visto em `PlanosPage.tsx`).

Na prática: ao gerar o contrato de um inquilino que não está mais em `trial`, o texto do contrato (`generateContractHtml`) cai no `||` de fallback e mostra o **valor cru do campo** (ex: "assinatura_pix_automatico") como nome do plano, e **R$ 0,00** como valor contratado — num documento que é assinado digitalmente e teria peso de contrato.

**`src/pages/TrialExpiredPage.tsx`** tem o mesmo problema de fundo (mostra os mesmos 3 planos antigos, Básico/Profissional/Clínica) — mas essa tela não é mais usada: a rota `/trial-expirado` continua registrada em `App.tsx`, porém nada no sistema redireciona mais para lá (o próprio código de `AuthContext.tsx` comenta que isso foi trocado para mandar direto pra `/planos`). Confirmei que não haveria nenhum jeito de chegar nela durante o uso normal do sistema — só ficaria exposta se alguém digitasse a URL na mão. Vale mencionar porque, além de mostrar preço desatualizado, os botões "Assinar agora" dela nem têm ação nenhuma (não fazem nada ao clicar) — mas por ser uma tela órfã, não classifiquei como achado prioritário, só registro para uma limpeza futura.

**Recomendação:** atualizar `ContratoPage.tsx` para usar `constants/planos.ts` como fonte do nome/valor do plano (igual `PlanosPage.tsx` já faz), e decidir se `TrialExpiredPage.tsx`/rota `/trial-expirado` ainda tem alguma utilidade ou pode ser removida.

---

## Achado 7 — `ConfiguracaoPage.tsx` usa `.single()` em vez de `.maybeSingle()` (impacto: muito baixo)

Linha 38: a busca de `store_settings` ao abrir a tela usa `.single()`. Para um inquilino novo que ainda não salvou nenhuma configuração, essa busca retorna 0 linhas, e `.single()` gera um erro de banco (ignorado pelo código, que só olha `data` e segue com o formulário vazio — não trava a tela, só registra um erro desnecessário toda vez que um inquilino novo abre essa página pela primeira vez). Mesmo padrão problemático do `AdminPanelPage.tsx`/`ContratoPage.tsx`, que já usam `.maybeSingle()` corretamente. Simples de padronizar, não é urgente.

---

## Revisado nesta parte sem problemas encontrados

`BaixasTab.tsx`, `TermosPage.tsx`, `PrivacidadePage.tsx`, `PlanosPage.tsx`, `ProdutosPage.tsx` — lidos por completo, sem achados relevantes além do já reportado.

---

## Ainda faltam auditar

- `pages/`: RelatoriosPage, NfePage, ImportacaoPage, CadastrosPage, ClientesPage, OrdemServicoPage (as maiores do sistema)
- `pages/admin`, `pages/auth`, `pages/crediario` (restante), `pages/os`, `pages/vendas` (subpastas)
- `pages/consulta` (módulo de consultas/clínica)
- As 9 Edge Functions do Supabase

Continuando na mesma ordem.

# Auditoria Completa do OptiFlow — Relatório Final Consolidado

Este documento junta todos os achados das 6 partes da auditoria (núcleo do sistema, todas as telas de nível raiz, subpastas de admin/auth/crediário/OS/vendas, módulo de Consulta e as 9 Edge Functions do Supabase) numa lista única, organizada por prioridade. Cada achado tem o mesmo número que já usei nas partes anteriores, para facilitar a referência cruzada.

Como combinado: nenhuma linha de código foi alterada em nenhuma etapa desta auditoria. Esta é a lista para você decidir o que corrigir e em que ordem — eu vou uma por uma conforme você for aprovando.

Metodologia, resumida: li o sistema inteiro na ordem em que está organizado no código — núcleo (autenticação, rotas, utilitários), depois cada tela em `pages/`, depois as subpastas, depois o módulo de Consulta (o maior, com 22 arquivos) e por fim as Edge Functions. Usei varreduras automáticas para achar padrões de risco em 100% dos arquivos (o bug de fuso horário, blocos de erro engolidos em silêncio, chaves/credenciais expostas) e depois li manualmente o contexto de cada ocorrência para separar bug real de código inofensivo. Nos módulos maiores (Clientes, Cadastros, Ordem de Serviço, e os 12 arquivos do módulo de Consulta que não caíram em nenhuma varredura) o nível de detalhe foi um pouco menor do que nos arquivos centrais — registro isso para você saber onde a leitura foi mais e menos profunda.

---

## Prioridade 1 — Segurança (verificar e corrigir primeiro)

Estes quatro achados são sobre **quem consegue acessar ou fazer o quê** no sistema — diferente dos outros, que são sobre informação errada sendo mostrada. Coloquei em primeiro porque o potencial de dano, se alguém realmente explorar, é maior do que os outros achados, mesmo que a chance de alguém tentar seja baixa.

**Achado 10 (Parte 6) — a function `whatsapp-manage` não confere a assinatura do token de login.** Ela decodifica o token localmente e confia em quem ele diz ser, sem perguntar pro Supabase se aquele token é autêntico. Isso permitiria, em teoria, disparar cobranças por WhatsApp em nome de uma ótica (ou até desconectar o WhatsApp dela) sem ter uma conta de verdade no sistema — só um token forjado com o formato certo. É o achado que eu classificaria como mais grave desta auditoria. Correção: trocar a decodificação manual pela mesma checagem que as outras 4 functions já fazem (perguntar pro Supabase se o token é válido).

**Achado 8 (Parte 4) — as telas do Painel Admin (`/admin`, `/admin/lixeira`, `/admin/trials-vencidos`) só checam se existe alguém logado, não se é você.** Qualquer usuário autenticado no sistema (o dono ou funcionário de qualquer ótica cliente) que digitasse esses endereços na barra do navegador passaria por essa checagem. A partir daí, essas telas tentam carregar a lista de todas as óticas clientes (e a Lixeira tem um botão de apagar um tenant inteiro e definitivamente). **O quanto isso é perigoso de verdade depende das regras de acesso (RLS) que você configurou no Supabase para a tabela `tenants`** — se elas já restringem isso a um usuário administrador de verdade, o pior que acontece é a tela vir vazia. Vale a pena conferir isso no painel do Supabase, e também adicionar a checagem de identidade que falta no código (comparar o e-mail/papel do usuário, não só se ele está logado).

**Achado 11 (Parte 6) — a function `create-boleto` aceita a chave da Asaas usada direto do que foi enviado na requisição, sem checar se pertence a quem está chamando.** Menos grave que os dois acima (exige já ter a chave de alguém em mãos), mas o ideal é a função buscar a chave salva do próprio tenant do usuário logado, do jeito que `create-asaas-subscription` já faz certo.

**Achado 2 (Parte 1) — o bloqueio de tentativas de login (5 tentativas erradas = 15 min de bloqueio) não funciona de verdade: o contador nunca é incrementado.** Menor gravidade que os outros três (o próprio Supabase Auth provavelmente já tem alguma proteção por trás), mas vale decidir se corrige o contador ou remove esse código morto.

---

## Prioridade 2 — O bug de fuso horário (o achado de maior volume, provavelmente ligado ao que a Larissa reportou)

**Achado 1**, encontrado ao longo de todas as 6 partes. A causa é sempre a mesma: usar `new Date().toISOString()` (que converte pra UTC) para calcular "hoje", quando o certo é usar hora local. Manaus está 4h atrás de UTC, então a partir de aproximadamente **20h**, todo cálculo feito assim já está um dia adiantado — e some só depois da meia-noite.

Isso já tinha sido corrigido uma vez, no arquivo `crediarioTypes.ts` (função `toLocalDateStr()`, 31/08/2026, também por relato da Larissa/Ótica Solar) — mas o padrão errado continuou sendo usado em muitos outros lugares que já existiam antes dessa correção, ou foram escritos depois sem reaproveitar ela.

**Onde tem efeito real e visível (recomendo corrigir todos juntos, é a mesma correção repetida):**
- `CrediarioPage.tsx` — selo "Atrasada" no resumo de renegociação (o mesmo arquivo que já tem a correção certa em outro lugar)
- `FinanceiroPage.tsx` — tela principal do Financeiro, 6 pontos diferentes (contador, selos, lista)
- `DashboardPage.tsx` — cards "Parcelas Vencidas", "Receita Hoje", "Consultas Hoje", e o destaque do mês atual no gráfico
- `AdminPanelPage.tsx` — estatística de "novos tenants este mês"
- `RelatoriosPage.tsx` — os botões de período (Hoje/Semana/Mês/Ano) podem mostrar zero vendas à noite, e o relatório de crediário classifica parcelas erradas
- `FilaEsperaConsultas.tsx` — a própria consulta ao banco busca a data errada (não é só exibição)
- `InicioConsultas.tsx` — painel inicial do módulo de Consulta (mesmos tipos de card do Dashboard principal)
- `FinanceiroConsultas.tsx` — financeiro do módulo de Consulta, mesmo problema do Financeiro principal
- `FichaPaciente.tsx` — parcelas vencidas de um paciente específico
- `ConsultaPage.tsx` — card "Hoje" na lista de consultas
- `RelatoriosConsultas.tsx` — mesmo problema de `RelatoriosPage.tsx`
- `supabase/functions/send-whatsapp-triggers/index.ts` — o cron que manda WhatsApp automático de vencimento/cobrança pros clientes finais; à noite pode selecionar a parcela errada pra avisar

**Onde o efeito é mais leve (só preenche errado um valor padrão de formulário, fácil de perceber e corrigir na hora):**
- `AgendaPage.tsx` — destaque de "hoje" no calendário e data padrão de novo agendamento
- `NfePage.tsx` — data de emissão padrão de NF-e nova
- `ImportacaoPage.tsx` — data usada só quando uma linha da planilha importada não tem data preenchida
- `admin/TrialsVencidosPage.tsx` — reativar trial por "+14 dias" pode dar 15 em vez de 14
- `RelatoriosOperacionais.tsx` — início de uma janela de "últimos 12 meses" (1 dia de diferença não muda quase nada num relatório desse tamanho)
- `NovaConsultaModal.tsx`, `PacientesTab.tsx` — data padrão de formulário

**Confirmado como código morto, sem efeito nenhum (só limpeza, se quiser):**
- `AdminPanelPage.tsx` (variável `hoje`, calculada e nunca usada) e `Shell.tsx` (variável `today`, idem).

**Recomendação:** é a mesma correção technique em todos os lugares (trocar `new Date().toISOString().split('T')[0]` por uma função que respeita o horário local, como o `toLocalDateStr()` que já existe em `crediarioTypes.ts` ou o padrão já certo em `utils/adminDates.ts`/`utils/clienteRanking.ts`) — dá pra fazer tudo de uma vez, arquivo por arquivo, começando pelos de maior impacto (Financeiro, Dashboard, Fila de Espera) e descendo pelos de menor impacto.

---

## Prioridade 3 — Outros achados de alto impacto

**Achado 9 (Parte 4) — o carnê de venda (`vendas/vendaDocumentos.ts`) fabrica datas de vencimento inventadas quando a busca das parcelas reais vem vazia.** É exatamente o mesmo bug que já corrigimos em `crediarioDocumentos.ts` (commit "Corrige impressao de carne com datas fabricadas..."), só que naquele arquivo é usado para reimprimir depois, na tela de Crediário — este aqui é usado na hora da venda, em Vendas/PDV, e não recebeu a mesma correção. Recomendo aplicar a correção idêntica.

**Achado 6 (Partes 2 e 6) — três problemas juntos em "planos/contrato":**
1. `ContratoPage.tsx` (usada de verdade, tem um botão no Painel Admin) mostra plano e valor **errados** ao gerar o contrato de um inquilino — reconhece só um modelo antigo de 3 planos que não existe mais, então o contrato sai com "R$ 0,00" pra qualquer tenant no modelo atual.
2. `supabase/functions/check-trial/index.ts` manda o e-mail de "seu trial está acabando" sempre para o **seu próprio e-mail**, nunca para o cliente — ou seja, esse aviso nunca chegou de verdade em nenhuma ótica.
3. Encontrei ao todo **4 conjuntos diferentes** de nomes/valores de planos espalhados pelo código (a fonte oficial em `constants/planos.ts`, e três variações antigas em `ContratoPage.tsx`/`TrialExpiredPage.tsx`, no e-mail de `check-trial`, e na function `create-checkout`, que parece não estar mais em uso).

---

## Prioridade 4 — Baixo impacto / limpeza (podem esperar)

- **Achado 3** — busca de dados da loja para impressão engole erro em silêncio (`crediarioDocumentos.ts` x2, `CrediarioPage.tsx`).
- **Achado 7** — várias telas usam `.single()` em vez de `.maybeSingle()` na mesma busca de `store_settings` (`ConfiguracaoPage.tsx`, `OrdemServicoPage.tsx`, `RelatoriosPage.tsx`) — gera um erro desnecessário (mas inofensivo) pra tenant novo sem configuração salva ainda.
- **Achado 5** — as duas variáveis mortas do bug de data (`AdminPanelPage.tsx`, `Shell.tsx`), sem efeito nenhum.
- **Achado 4** — checagem do Painel Admin em `App.tsx` (absorvido pelo Achado 8 acima, mesma causa).
- **Observação (Parte 6)** — `create-checkout` e `stripe-webhook` (Edge Functions) parecem ser do fluxo antigo via Stripe, substituído pelo Pix Automático via Asaas — nada no sistema as chama mais. Candidatas a remoção, se confirmado que não são mais necessárias.
- **Observação (Parte 6)** — `send-email` aceita qualquer destinatário/assunto/corpo de qualquer usuário autenticado — como o cadastro é auto-serviço (`/registro`, sem aprovação prévia), tecnicamente qualquer pessoa que criar uma conta grátis de 14 dias poderia usar essa function pra mandar e-mail arbitrário através do seu domínio/conta no Resend. Baixa prioridade porque exige já ter uma conta e não é o tipo de abuso mais provável, mas registro como ponto de atenção.

---

## Como quer seguir?

Essa é a lista completa. Como você pediu, não mexi em nada — é sua vez de dizer por onde começar. Minha sugestão seria: **Prioridade 1 primeiro** (são poucos arquivos, e o Achado 8 principalmente depende de você conferir as regras do Supabase, o que eu não consigo fazer sozinho), depois o **Achado 1** de uma vez só (é uma correção repetida, dá pra fazer em lote), e o resto na ordem que fizer mais sentido pra você.

Me diga quais achados quer que eu corrija e eu vou implementando um por um, com aprovação sua a cada um.

# Auditoria OptiFlow — Parte 3 (fechamento das telas de nível raiz)

Fecha a revisão de `pages/` (nível raiz). Faltam agora as subpastas (`admin`, `auth`, `crediario`, `os`, `vendas`), o módulo de Consulta e as Edge Functions — seguem nas próximas partes.

Nenhuma linha de código foi alterada.

---

## Achado 1 (continuação) — mais duas confirmações, uma delas com efeito visível forte

**`src/pages/RelatoriosPage.tsx` (impacto: alto)**

Essa tela tem duas versões do mesmo problema:

1. Os botões de período rápido ("Hoje", "Semana", "Mês", "Ano" — função `getRange()`, linhas 65–70) usam `new Date().toISOString()` para decidir o intervalo de datas. À noite, clicar em **"Hoje"** busca vendas com a data de **amanhã** — como ainda não existe nenhuma venda registrada no futuro, a tela mostra **zero vendas**, parecendo que nada foi vendido no dia, quando na verdade só a busca está errada. O mesmo vale, de forma mais sutil, para "Semana", "Mês" e "Ano" (o último dia do intervalo fica um dia adiantado).
2. Dentro do "Relatório Resumido" gerado para impressão (`gerarResumido`, linha 233), o cruzamento com o crediário ("Recebido / A Receber / Vencido") classifica as parcelas usando esse mesmo `hoje` errado — um relatório impresso à noite pode mostrar como "vencido" uma parcela que só vence naquele mesmo dia.

**`src/pages/NfePage.tsx` e `src/pages/ImportacaoPage.tsx` (impacto: baixo)**

Aqui o padrão aparece só como **valor padrão de formulário**, não como comparação: em `NfePage.tsx` (linhas 86 e 315), a data de emissão de uma NF-e nova já vem preenchida com "hoje" — à noite, viria preenchida com a data de amanhã, e quem não reparar emite a nota com a data errada. Em `ImportacaoPage.tsx` (linha 162), é só o valor usado quando uma linha da planilha importada não tem data de consulta preenchida. Mantive esses dois como achados de baixa prioridade porque não travam nem corrompem nada — só preenchem errado um campo que dá pra corrigir na hora.

(Conferi também as outras ocorrências de `toISOString()` nesses dois arquivos, usadas para converter datas já escolhidas pelo usuário ou importadas da planilha — essas não têm o problema, porque não partem do "agora": são só conversões de uma data específica já definida.)

---

## Achado 7 (continuação) — mais um lugar com `.single()` em vez de `.maybeSingle()`

`src/pages/OrdemServicoPage.tsx`, linha 128 — mesma busca de `store_settings` para impressão, mesmo padrão de tolerar o erro em silêncio. É a quarta ocorrência desse mesmo detalhe (as outras três foram reportadas nas Partes 1 e 2). Não vou repetir isso a cada nova ocorrência — trato como parte do mesmo Achado 7, a corrigir de uma vez só em todos os lugares quando for a hora.

---

## `CadastrosPage.tsx`, `ClientesPage.tsx`, `OrdemServicoPage.tsx` — revisados, sem novos achados de peso

Essas são as três maiores telas do sistema (fora Crediário e Vendas, já revisadas antes). Não têm o bug de fuso horário (não usam esse padrão de data). Fiz uma varredura age direcionada a outros riscos (tratamento de erro, escopo por `tenant_id` nas consultas ao banco) e não encontrei nada que se destacasse além do que já está listado. A única observação é a mesma do Achado 7 acima (`OrdemServicoPage.tsx`, `.single()` na busca de `store_settings`).

Vale registrar uma limitação: dado o tamanho dessas telas, não reli **cada consulta ao banco linha por linha** para confirmar 100% que todas filtram por `tenant_id` — o padrão que vi consistentemente é buscar primeiro pela tabela principal já filtrada por `tenant_id`, e depois seguir por relações (`crediario_id`, `sale_id`, `os_id`) que já vieram de uma busca filtrada. Não vi nada fora desse padrão, mas registro que essa verificação não foi exaustiva linha a linha, dado o volume de código.

---

## Ainda faltam auditar

- `pages/admin`, `pages/auth`, `pages/crediario` (restante), `pages/os`, `pages/vendas` (subpastas)
- `pages/consulta` (módulo de consultas/clínica)
- As 9 Edge Functions do Supabase

Com isso fecho toda a `pages/` de nível raiz. Seguindo para as subpastas agora.

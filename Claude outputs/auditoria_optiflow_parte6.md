# Auditoria OptiFlow — Parte 6 (Edge Functions do Supabase)

Cobre as 9 Edge Functions (código que roda no servidor, fora do navegador): `asaas-subscription-webhook`, `check-trial`, `create-asaas-subscription`, `create-boleto`, `create-checkout`, `send-email`, `send-whatsapp-triggers`, `stripe-webhook`, `whatsapp-manage`. Com isso fecho a leitura de código de todo o sistema.

Nenhuma linha de código foi alterada. Esta parte tem o achado mais grave de toda a auditoria — Achado 10.

---

## Achado 10 — `whatsapp-manage` aceita qualquer token que "pareça" válido, sem checar a assinatura (impacto: alto — segurança)

Arquivo: `supabase/functions/whatsapp-manage/index.ts`, função `decodeJwtPayload` (linha 22) e seu uso na linha 58.

Todas as outras Edge Functions que precisam saber quem está chamando (`create-boleto`, `create-checkout`, `send-email`, `create-asaas-subscription`) fazem a coisa certa: pegam o token que veio no cabeçalho e perguntam pro próprio Supabase "esse token é válido, e de quem é?" (`fetch(.../auth/v1/user, ...)`), que confere a assinatura de verdade.

Esta função aqui faz diferente: ela **decodifica o token localmente** (`atob` + `JSON.parse` na parte do meio do JWT) e confia direto no campo `sub` (o ID do usuário) que estiver escrito ali — **sem nunca conferir se a assinatura do token é válida**. Um token JWT tem três partes separadas por ponto (cabeçalho.dados.assinatura); a assinatura é o que garante que aquele token foi realmente emitido pelo Supabase e não foi forjado. Aqui, a assinatura é ignorada por completo.

Na prática, isso significa que **não é preciso ter login nenhum de verdade** para usar esta função: basta montar um token no formato certo (três partes separadas por ponto, com a parte do meio contendo `{"sub":"<qualquer id>"}`) e mandar no cabeçalho `Authorization`. A função vai aceitar esse `sub` como se fosse um usuário legítimo e seguir em frente — incluindo as ações de **disparar cobrança por WhatsApp em nome da ótica** (`send_collection`) e, se o `sub` usado corresponder a um usuário com papel de "master", até **conectar/desconectar o WhatsApp da loja** (`connect`/`disconnect`).

O único obstáculo real para alguém explorar isso é **descobrir um ID de usuário válido** (`user_profiles.id`) — o que não deveria ser segredo, mas também não é trivialmente público; ainda assim, essa checagem deveria ser impossível de contornar independentemente disso.

**Recomendação:** trocar a decodificação manual por uma chamada real ao Supabase (`/auth/v1/user`, o mesmo padrão já usado nas outras 4 functions) para validar o token de verdade antes de confiar no `sub`.

---

## Achado 11 — `create-boleto` não confere se a chave Asaas usada pertence a quem está chamando (impacto: médio)

Arquivo: `supabase/functions/create-boleto/index.ts`.

Essa função gera boletos de verdade na Asaas (usada em `VendasPage.tsx` quando o cliente final escolhe pagar por boleto). Ela confere que existe um usuário autenticado — mas, diferente de `create-asaas-subscription` (que confere explicitamente se o `tenant_id` pedido é o mesmo do usuário logado, retornando 403 se não for), esta aqui aceita a chave da Asaas (`asaas_key`) e todos os dados do boleto **direto do corpo da requisição**, sem checar se pertencem ao tenant de quem está chamando. Qualquer usuário autenticado no sistema (de qualquer ótica) poderia, em teoria, chamar essa função passando a chave Asaas de outra conta (se de algum jeito tivesse acesso a ela) e gerar cobranças usando essa chave.

Isso é diferente e mais brando que o Achado 10 — aqui é preciso já ter a chave Asaas de alguém em mãos, então o risco real depende de essa chave nunca vazar por outro canal. Ainda assim, o ideal é a função buscar a chave salva em `store_settings` do PRÓPRIO tenant do usuário logado (do jeito que `create-asaas-subscription` já faz), em vez de aceitar ela vinda do cliente.

---

## Achado 1 (continuação, impacto: alto) — o cron de WhatsApp automático também sofre do bug de fuso horário

Arquivo: `supabase/functions/send-whatsapp-triggers/index.ts`, linhas 135–142.

Esta é a function que roda sozinha a cada 15 minutos e manda os WhatsApps automáticos de aniversário, vencimento de parcela (5 dias antes, no dia, e 5 dias depois) e cobrança de atraso. Ela calcula "hoje" e todas as janelas relativas (`em5dias`, `menos5dias`, `menos30dias` etc.) do mesmo jeito problemático — só que aqui quem roda é o servidor, não o navegador do usuário, então o efeito é um pouco diferente: entre aproximadamente 20h e meia-noite (horário de Manaus), a função já está calculando com base no dia seguinte.

O texto de cada mensagem sempre mostra a data certa da parcela (isso está correto, vem direto do banco) — o problema é **qual parcela é selecionada** para receber qual mensagem. Nesse intervalo da noite, uma parcela que vence amanhã pode receber o aviso "sua parcela vence hoje" um dia adiantado, e uma parcela que realmente vence hoje pode não ser pega pelo filtro daquele ciclo. Como é a mesma função que manda a cobrança de atraso pros clientes das óticas, esse é provavelmente o ponto de maior contato direto com o cliente final de todo esse bug — vale a pena tratar com prioridade alta junto dos outros pontos do Achado 1.

---

## Achado 6 (continuação) — o e-mail de trial expirando nunca chega no cliente, e mostra planos que não existem mais (impacto: alto)

Arquivo: `supabase/functions/check-trial/index.ts`, linha 58.

Esta function roda periodicamente e deveria avisar cada ótica, por e-mail, que o trial dela está acabando. Só que o campo de destinatário está assim:

```js
to: ["carlosevideo28@gmail.com"],
```

Ou seja, **todo aviso de "seu trial está acabando" é enviado para o seu próprio e-mail**, não para o e-mail da ótica (`tenant.email`, que já está disponível ali mesmo na função, buscado do banco). O texto do e-mail fala diretamente com o cliente ("Olá, [nome da ótica]! Seu trial expira em X dias...") mas quem recebe é sempre você. Ou seja, esse aviso automático por e-mail nunca chegou de verdade em nenhum cliente — o que pode ajudar a explicar conversões de trial mais baixas do que o esperado, já que ninguém está sendo lembrado por e-mail de que o teste está acabando.

Esse e-mail também lista "Plano Básico R$ 97/mês, Plano Pro R$ 147/mês, Plano Premium R$ 197/mês" — um terceiro conjunto de nomes/preços de planos, diferente tanto da fonte oficial (`constants/planos.ts`: Ótica R$ 99,99 / Consultório R$ 49,99) quanto do que aparece em `ContratoPage.tsx`/`TrialExpiredPage.tsx` (Básico R$89/Profissional R$149/Clínica R$249, ver Parte 2, Achado 6). Reforça que esse é um problema de repetir a mesma informação em vários lugares sem uma fonte única — já é a quarta variação de preços de planos encontrada na auditoria.

**Recomendação:** trocar `to: ["carlosevideo28@gmail.com"]` por `to: [tenant.email]`, e atualizar o texto do e-mail para os planos e valores atuais.

---

## Observação — duas Edge Functions parecem não ser mais usadas

`create-checkout` e `stripe-webhook` implementam o fluxo antigo de assinatura via Stripe. Conferi no restante do código: nada no frontend chama `create-checkout` (o Stripe foi substituído pelo Pix Automático via Asaas, como já indicavam comentários vistos em `AuthContext.tsx` e outros arquivos ao longo da auditoria), e `stripe-webhook` só é mencionado num comentário de `SuccessPage.tsx`, não chamado de fato. Não classifiquei isso como bug — só um lembrete de limpeza: se esse fluxo é mesmo coisa do passado, vale considerar remover as duas functions (e a `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` configuradas) para reduzir a superfície de coisas para manter e proteger.

---

## Revisado sem problemas — bem implementado

`asaas-subscription-webhook`: confere o token da Asaas corretamente, trata eventos duplicados (idempotência) e cobre bem os status de assinatura (ativado/cancelado/pagamento confirmado/atrasado).
`create-asaas-subscription`: confere autenticação E que o tenant pedido é do próprio usuário logado (o padrão que os Achados 10/11 mostram estar faltando em outros lugares) — trata erros da Asaas com cuidado (lê como texto antes de tentar JSON, evita crash em respostas vazias).
`stripe-webhook`: verifica a assinatura HMAC do Stripe corretamente, com checagem de validade por tempo — mesmo sendo código provavelmente não mais usado (ver observação acima), está bem implementado.
`whatsapp-manage`: fora do problema do Achado 10, a lógica de permissões (qualquer usuário pode consultar status/mandar cobrança manual, só o "master" pode conectar/desconectar) e o escopo por tenant do próprio usuário estão bem pensados.

---

Com isso, a leitura completa do código do sistema está concluída — núcleo, todas as telas, subpastas, módulo de Consulta e as 9 Edge Functions. Vou montar agora o relatório final consolidado, juntando todos os achados das 6 partes em uma lista única, por prioridade, para você decidir a ordem de correção.

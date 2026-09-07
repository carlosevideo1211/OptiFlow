# Auditoria OptiFlow — Parte 4 (Painel Admin, autenticação, subpastas)

Cobre `pages/admin`, `pages/auth`, `pages/os` e `pages/vendas`. Esta parte tem o achado mais sério da auditoria até agora — recomendo ler o Achado 8 com atenção.

Nenhuma linha de código foi alterada.

---

## Achado 8 — As telas do Painel Admin só checam se existe uma sessão logada, não se é você (impacto: potencialmente alto — precisa verificar no Supabase)

Arquivos: `src/pages/admin/AdminPanelPage.tsx` (linha 108), `src/pages/admin/LixeiraPage.tsx` (linha 36), `src/pages/admin/TrialsVencidosPage.tsx` (linha 38).

As três telas do Painel Admin fazem exatamente esta checagem antes de carregar:

```
supabase.auth.getSession().then(({ data: { session } }) => {
  if (!session) navigate('/admin-login');
  else load();
});
```

Repare no que ela pergunta: só **"existe alguém logado?"** — não **"é o Carlos?"**. A tela de login do admin (`AdminLoginPage.tsx`) até confere o e-mail contra `carlosevideo28@gmail.com` antes de tentar autenticar — mas isso protege só o formulário de login em si. Uma vez logado, **qualquer usuário autenticado no sistema** (o dono ou um funcionário de qualquer ótica cliente, por exemplo) que digitar `/admin`, `/admin/lixeira` ou `/admin/trials-vencidos` direto na barra de endereço passa por essa checagem sem problema, porque ele também tem uma sessão válida — só não é a sessão do Carlos.

A partir daí, essas telas tentam carregar (via `supabase.from('tenants').select('*')`) a lista de **todas as óticas clientes do sistema** — nome da empresa, e-mail, status, valor de mensalidade (MRR) — e a Lixeira ainda expõe um botão de **"Excluir Definitivamente"**, que apaga o tenant inteiro do banco (`supabase.from('tenants').delete()`).

**O que eu não consigo confirmar só lendo o código do frontend:** se isso é ou não um problema real depende inteiramente das regras de acesso (RLS) configuradas no Supabase para a tabela `tenants`. Se essas regras já restringem quem pode ler/apagar linhas dessa tabela a um papel de administrador específico, o pior que acontece é a tela tentar carregar e vir vazia/dar erro. Se as regras são mais abertas (permitem qualquer usuário autenticado consultar `tenants`, por exemplo porque em algum outro lugar do sistema um tenant precisa ler alguma coisa dessa tabela sobre si mesmo), qualquer cliente do sistema que soubesse digitar `/admin` na barra de endereço veria os dados de todos os outros clientes — e, no caso da Lixeira, poderia até apagar a conta de outro.

**Recomendação:** isso pede duas coisas, não uma só:
1. No código do frontend: as três telas deveriam checar não só "existe sessão", mas também se o e-mail (ou papel) da sessão é o seu — a mesma comparação que já existe em `AdminLoginPage.tsx`, só que reaplicada depois do login também.
2. No Supabase: vale a pena conferir as políticas de RLS da tabela `tenants` (e de qualquer outra tabela que essas telas leem/escrevem) para confirmar que só uma conta de administrador de verdade consegue ler ou apagar linhas de outros tenants — essa é a proteção que realmente importa, o código do React é só uma camada a mais.

Esse é o achado que mais me preocupa nesta auditoria até agora, então mando ele destacado mesmo sem poder confirmar 100% a gravidade sozinho.

---

## Achado 9 — Carnê de venda com datas fabricadas quando a busca vem vazia (impacto: alto — mesma classe de bug já corrigida uma vez)

Arquivo: `src/pages/vendas/vendaDocumentos.ts`, função `imprimirCarne` (linhas 59–82).

Este é o mesmo bug que já corrigimos juntos há pouco tempo em `crediarioDocumentos.ts` (commit "Corrige impressao de carne com datas fabricadas quando parcelas vem vazias") — só que aquele arquivo é usado para reimprimir o carnê depois, **na tela de Crediário**, e este aqui (`vendaDocumentos.ts`) é o gerador usado **na hora da venda, em Vendas/PDV**. A correção não chegou até aqui.

O trecho:
```js
const listaFinal = lista.length > 0 ? lista : Array.from({length: nP}, (_, i) => {
  const due = new Date(); due.setMonth(due.getMonth() + i);
  return { installment_number: i+1, amount: v.total/nP, due_date: due.toISOString().split('T')[0], id: String(i) };
});
```

Se a busca das parcelas reais (`crediario_parcelas`, logo após criar a venda) vier vazia por qualquer motivo — mais provável logo depois de criar a venda, se a busca rodar antes do banco terminar de gravar as parcelas —, em vez de avisar o erro, o carnê é impresso mesmo assim com datas de vencimento **inventadas** (hoje + 1 mês, hoje + 2 meses...) em vez das datas reais calculadas na venda. É exatamente o mesmo sintoma que motivou a correção anterior: um carnê entregue ao cliente com vencimentos que não têm nada a ver com o combinado.

**Recomendação:** aplicar a mesma correção já feita em `crediarioDocumentos.ts` aqui também — se `lista.length === 0`, avisar o vendedor e não gerar o carnê, em vez de fabricar datas.

---

## Achado 1 (continuação, baixa prioridade) — mais uma confirmação pontual

`src/pages/admin/TrialsVencidosPage.tsx`, função `reativarTrial` (linhas 76–77): ao reativar um trial por "+14 dias a partir de hoje", o cálculo usa `new Date()` (o momento atual) — se o Carlos reativar um trial à noite, o novo prazo pode sair um dia a mais do que os 14 dias pretendidos. Efeito mínimo (o cliente ganha um dia extra de trial de graça), não classifiquei como prioridade.

---

## Revisado nesta parte sem problemas encontrados

`AdminLoginPage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `ForgotPasswordPage.tsx`, `MedidasDigitaisModal.tsx`, `vendasTypes.ts` — lidos por completo. O fluxo de cadastro (`RegisterPage.tsx`) e login me pareceram bem cuidados (inclusive já checa e-mail duplicado antes de criar conta). Nenhum problema de correção encontrado nesses arquivos.

---

## Ainda faltam auditar

- `pages/consulta` (módulo de consultas/clínica — 10 arquivos, o maior módulo do sistema)
- As 9 Edge Functions do Supabase

Seguindo para o módulo de Consulta agora.

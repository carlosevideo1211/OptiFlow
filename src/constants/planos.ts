// Fonte unica dos dois planos reais do OptiFlow. Usado tanto na tela de
// login (pre-cadastro, painel de marketing) quanto na tela /planos
// (pos-login, tela de assinatura). Manter isso num lugar so evita o que
// aconteceu antes: o texto de planos ficar desatualizado numa tela e
// correto na outra (era o caso do banner antigo "Basico/Pro/Premium" na
// tela de login, que nao batia com os planos reais de /planos).
//
// Os mesmos valores (199.99 / 49.99) tambem existem em
// supabase/functions/create-asaas-subscription/index.ts (PLANO_OTICA_VALOR
// / PLANO_CONSULTORIO_VALOR) -- essa parte nao da pra compartilhar porque
// Edge Functions do Supabase nao importam arquivos do frontend. Se o preco
// mudar, precisa atualizar os dois lugares. O valor por inquilino ainda pode
// ser sobrescrito por tenants.valor_mensal_customizado (ver comentario na
// Edge Function).

export const PLANO_OTICA = {
  nome: 'Plano Otica',
  descricao: 'Tudo que sua otica precisa pra rodar no dia a dia',
  // Reajustado de 99.99 para 199.99 em 07/09/2026 (decisao do Carlos): o
  // plano passou a incluir WhatsApp Oficial (Meta) e Nota Fiscal automatica
  // como parte do pacote unico, em vez de add-ons separados. O valor pode
  // ser ajustado por inquilino (ver tenants.valor_mensal_customizado / tela
  // Admin > Editar Tenant) para quem nao quiser algum dos dois recursos.
  valor: 199.99,
  features: [
    'Usuarios ilimitados',
    'Clientes ilimitados',
    'Vendas / PDV',
    'Ordens de Servico',
    'Crediario',
    'Controle de estoque',
    'Consulta / Rx e Agenda',
    'Relatorios avancados',
    'WhatsApp Oficial via Meta (liberacao em breve)',
    'Emissao automatica de Nota Fiscal (liberacao em breve)',
    'Suporte por email',
  ],
};

export const PLANO_CONSULTORIO = {
  nome: 'Plano Consultorio',
  descricao: 'Consulta / Rx completa, sem os modulos de otica',
  valor: 49.99,
  features: [
    'Usuarios ilimitados',
    'Clientes ilimitados',
    'Consulta / Rx completa',
    'Agenda de atendimentos',
    'Receituario e atestados',
    'Suporte por email',
  ],
};

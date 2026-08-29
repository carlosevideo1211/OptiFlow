// Fonte unica dos dois planos reais do OptiFlow. Usado tanto na tela de
// login (pre-cadastro, painel de marketing) quanto na tela /planos
// (pos-login, tela de assinatura). Manter isso num lugar so evita o que
// aconteceu antes: o texto de planos ficar desatualizado numa tela e
// correto na outra (era o caso do banner antigo "Basico/Pro/Premium" na
// tela de login, que nao batia com os planos reais de /planos).
//
// Os mesmos valores (99.99 / 49.99) tambem existem em
// supabase/functions/create-asaas-subscription/index.ts (PLANO_OTICA_VALOR
// / PLANO_CONSULTORIO_VALOR) -- essa parte nao da pra compartilhar porque
// Edge Functions do Supabase nao importam arquivos do frontend. Se o preco
// mudar, precisa atualizar os dois lugares.

export const PLANO_OTICA = {
  nome: 'Plano Otica',
  descricao: 'Tudo que sua otica precisa pra rodar no dia a dia',
  valor: 99.99,
  features: [
    'Usuarios ilimitados',
    'Clientes ilimitados',
    'Vendas / PDV',
    'Ordens de Servico',
    'Crediario',
    'Controle de estoque',
    'Consulta / Rx e Agenda',
    'Relatorios avancados',
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

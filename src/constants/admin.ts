// E-mail do administrador do sistema (Carlos) — usado para reconhecer o
// dono da plataforma nas telas do Painel Admin. Pode ser sobrescrito por
// VITE_ADMIN_EMAIL sem precisar mexer no código (mesmo padrão já usado em
// context/AuthContext.tsx).
//
// IMPORTANTE: isto é só uma checagem no frontend, para esconder as telas de
// quem não deveria vê-las. A proteção que realmente importa são as regras de
// RLS configuradas no Supabase para a tabela `tenants` (e as demais lidas
// aqui) — sem RLS correto, alguém que soubesse forjar a sessão ainda
// conseguiria acessar os dados direto pela API, independente desta checagem.
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || 'carlosevideo28@gmail.com').toLowerCase();

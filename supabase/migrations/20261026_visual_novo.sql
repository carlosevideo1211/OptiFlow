-- 26/10/2026: interruptor por loja para o "visual novo" (menu enxuto e telas reorganizadas).
-- Liga primeiro so na Castanho (loja do Carlos) para testes; depois de aprovado, liga nas outras pelo Painel Admin.
alter table tenants add column if not exists visual_novo boolean not null default false;
update tenants set visual_novo = true where id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4';

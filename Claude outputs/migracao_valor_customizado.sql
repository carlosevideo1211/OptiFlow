-- OptiFlow — Migração: valor mensal personalizado por inquilino
-- Pedido do Carlos, 07/09/2026: o Plano Ótica passou de R$99,99 para
-- R$199,99 (agora incluindo WhatsApp Oficial e Nota Fiscal automática no
-- pacote). Este campo permite dar um valor diferente pra um inquilino
-- específico (ex: desconto pra quem não quiser Nota Fiscal), sem precisar
-- mexer em código — é só editar o tenant na tela Admin.
--
-- Execute este script no SQL Editor do Supabase (projeto optiflow) ANTES de
-- publicar o código atualizado (AdminPanelPage.tsx e a edge function
-- create-asaas-subscription). Sem esta coluna, o campo novo na tela Admin
-- não vai salvar nada.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS valor_mensal_customizado numeric;

-- Confirmação rápida (deve retornar 0 linhas logo após rodar a migração,
-- já que nenhum inquilino tem valor customizado ainda):
-- SELECT count(*) FROM tenants WHERE valor_mensal_customizado IS NOT NULL;

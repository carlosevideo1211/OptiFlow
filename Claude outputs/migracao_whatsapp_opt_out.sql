-- OptiFlow — Migração: opt-out de WhatsApp por cliente
-- Pedido da Larissa (Ótica Evangelista Castanho), 07/09/2026: permitir que o
-- vendedor desative (e reative) o recebimento de mensagens automáticas de
-- WhatsApp para um cliente específico, a critério do próprio cliente.
--
-- Execute este script no SQL Editor do Supabase (projeto optiflow) ANTES de
-- publicar o código atualizado (ClientesPage.tsx e a edge function
-- send-whatsapp-triggers). Sem esta coluna, o app não vai encontrar o campo
-- e as mensagens automáticas continuam sendo enviadas normalmente (o filtro
-- de opt-out simplesmente não vai bloquear nada até a coluna existir).

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_em timestamptz;

-- Confirmação rápida (deve retornar 0 linhas logo após rodar a migração,
-- já que nenhum cliente foi marcado ainda):
-- SELECT count(*) FROM customers WHERE whatsapp_opt_out = true;

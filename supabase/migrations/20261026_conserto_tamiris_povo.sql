-- 26/10/2026: caso Tamiris (Otica do Povo). A venda no crediario foi excluida para corrigir o nome, mas o carne ficou
-- vazio (gatilho de auditoria - ver 20261026_audit_delete_security_definer.sql) e o cadastro ficou inativo.
-- Arruma para a loja refazer a venda a partir do pedido #9285: cadastro ativo, pedido com o nome certo, carne vazio
-- cancelado (nao apagado).
begin;
update customers set active = true
 where id = '5269caf7-28ee-41e8-831a-2ac83686fa0b' and tenant_id = 'd28f9297-a890-466b-a108-d804b0f8bf97';
update service_orders set customer_name = 'TAMIRIS RAMOS DE CASTRO'
 where id = '2e48cbfb-891b-420a-a81a-97048a23b2ef' and tenant_id = 'd28f9297-a890-466b-a108-d804b0f8bf97';
update crediario set status = 'cancelado', notes = 'Carne vazio: venda excluida em 26/10/2026 (cancelado pelo suporte)'
 where id = '1027971c-e7d5-419c-bf59-9c98bae6d600'
   and not exists (select 1 from crediario_parcelas p where p.crediario_id = '1027971c-e7d5-419c-bf59-9c98bae6d600');
commit;

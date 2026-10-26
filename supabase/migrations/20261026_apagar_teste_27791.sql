-- 26/10/2026: apaga a venda de TESTE #27791 / pedido #9286 (cliente "TESTE - Carlos Eduardo dos Santos Video"),
-- feita no teste da Fase 7. Pedido do Carlos. Copia de seguranca em bkp_testes2_20261026_*.
begin;
create temp table _v as select * from sales
 where tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and sale_number = 27791
   and customer_id = '491a7f0e-0d91-4ff9-b6ab-bc4652be1da3';
create temp table _os as select * from service_orders
 where tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and os_number = 9286
   and customer_id = '491a7f0e-0d91-4ff9-b6ab-bc4652be1da3';

create table bkp_testes2_20261026_sales as select * from _v;
create table bkp_testes2_20261026_sale_items as select * from sale_items where sale_id in (select id from _v);
create table bkp_testes2_20261026_financial as select * from financial_transactions
 where tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and description in (select 'Venda #' || sale_number || ' — ' || customer_name from _v);
create table bkp_testes2_20261026_service_orders as select * from _os;
create table bkp_testes2_20261026_os_itens as select * from os_itens where os_id in (select id from _os);

update products p set stock = p.stock + x.qtd
  from (select product_id, sum(quantity) qtd from sale_items where sale_id in (select id from _v) and product_id is not null group by product_id) x
 where p.id = x.product_id;
delete from financial_transactions where id in (select id from bkp_testes2_20261026_financial);
delete from sale_items where sale_id in (select id from _v);
delete from sales where id in (select id from _v);
update service_orders set status = 'cancelada' where id in (select id from _os);
delete from os_itens where os_id in (select id from _os);
delete from service_orders where id in (select id from _os);
commit;

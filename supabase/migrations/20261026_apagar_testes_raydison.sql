-- 26/10/2026: apaga os lancamentos de TESTE feitos na Castanho com o cliente real raydison de souza grana
-- (vendas #27785-#27788, OS de teste #9281-#9283, carne de teste, saida de caixa e fechamento de caixa de teste).
-- O carne de teste gerou uma cobranca automatica real no WhatsApp do cliente. Pedido do Carlos: apagar tudo.
-- Copia de seguranca nas tabelas bkp_testes_20261026_*. A OS #9148 (orcamento REAL de 28/09) volta a orcamento.
begin;

create temp table _v as
  select s.* from sales s
   where s.tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and s.sale_number in (27785, 27786, 27787, 27788);
create temp table _os as
  select o.* from service_orders o
   where o.tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and o.os_number in (9281, 9282, 9283);
create temp table _cr as select c.* from crediario c where c.sale_id in (select id from _v);

-- copias de seguranca
create table bkp_testes_20261026_sales as select * from _v;
create table bkp_testes_20261026_sale_items as select * from sale_items where sale_id in (select id from _v);
create table bkp_testes_20261026_crediario as select * from _cr;
create table bkp_testes_20261026_crediario_parcelas as select * from crediario_parcelas where crediario_id in (select id from _cr);
create table bkp_testes_20261026_financial as
  select * from financial_transactions
   where tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and created_at >= '2026-10-26'
     and (description in (select 'Venda #' || sale_number || ' — ' || customer_name from _v)
          or description like 'Crediário Venda #27786 —%'
          or description = 'TESTE CLAUDE - saida de caixa');
create table bkp_testes_20261026_service_orders as
  select * from service_orders where tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and os_number in (9148, 9281, 9282, 9283);
create table bkp_testes_20261026_os_itens as select * from os_itens where os_id in (select id from _os);
create table bkp_testes_20261026_caixa_dia as
  select * from caixa_dia where tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and data = '2026-10-26';

-- 1) devolve o estoque dos itens vendidos (lentes por grau: o banco recalcula pela grade)
update products p set stock = p.stock + x.qtd
  from (select product_id, sum(quantity) qtd from sale_items where sale_id in (select id from _v) and product_id is not null group by product_id) x
 where p.id = x.product_id;

-- 2) financeiro, carne e parcelas
delete from financial_transactions where id in (select id from bkp_testes_20261026_financial);
delete from crediario_parcelas where crediario_id in (select id from _cr);
delete from crediario where id in (select id from _cr);

-- 3) vendas
delete from sale_items where sale_id in (select id from _v);
delete from sales where id in (select id from _v);

-- 4) OS de teste: cancela (o trigger devolve as lentes da grade) e apaga
update service_orders set status = 'cancelada' where id in (select id from _os);
delete from os_itens where os_id in (select id from _os);
delete from service_orders where id in (select id from _os);

-- 5) OS #9148 (orcamento real de 28/09): volta a orcamento, sem forma de pagamento (devolve as 2 lentes Vs Foto Ar)
update service_orders set status = 'orcamento', forma_pagamento = null
 where tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and os_number = 9148;

-- 6) fechamento de caixa de teste
delete from caixa_dia where tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and data = '2026-10-26';

commit;

-- 26/10/2026: carnes sem nenhuma parcela (sobras de vendas excluidas - o gatilho de auditoria barrava a exclusao do
-- carne) marcados como cancelados, com o OK do Carlos. Nada e apagado; status/notes antigos em bkp_carnes_vazios_20261026.
begin;
create table bkp_carnes_vazios_20261026 as
  select c.id, c.tenant_id, c.status, c.notes from crediario c
   where c.status <> 'cancelado' and not exists (select 1 from crediario_parcelas p where p.crediario_id = c.id);
update crediario c set status = 'cancelado',
       notes = coalesce(c.notes || ' | ', '') || 'Carne sem parcelas - cancelado em 26/10/2026'
  from bkp_carnes_vazios_20261026 b where b.id = c.id;
commit;

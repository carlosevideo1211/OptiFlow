-- 26/10/2026: na Castanho a importacao de receitas rodou duas vezes (22/06 e 23/06/2026) e cada consulta antiga ficou
-- duplicada. Aprovado pelo Carlos: apaga a copia de 23/06 que tem par identico em 22/06 (mesmo cliente, data e nome).
-- Copia integral em bkp_consultas_dup_20261026.
begin;
create table bkp_consultas_dup_20261026 as
  select b.* from consultations b
   where b.tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4' and b.status = 'concluida' and b.created_at::date = '2026-06-23'
     and exists (select 1 from consultations a
                  where a.tenant_id = b.tenant_id and a.status = 'concluida' and a.created_at::date = '2026-06-22'
                    and a.customer_id is not distinct from b.customer_id and a.date = b.date and a.customer_name = b.customer_name);
delete from consultations c using bkp_consultas_dup_20261026 b where c.id = b.id;
commit;

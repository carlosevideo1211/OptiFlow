-- 26/10/2026: a importacao de receitas de junho/2026 (status 'concluida', criadas em 22 e 23/06) gravou em "date" a
-- VALIDADE da receita (exame + 1 ano), nao a data do exame. Prova: em cada loja a grande maioria bate com uma venda do
-- mesmo cliente exatamente 1 ano antes (Castanho 11.513 x 170 na data gravada; Solar 576 x 12; Altazes 185 x 3), e a
-- maior data e jun/2027 (= importacao + 1 ano). Aprovado pelo Carlos: volta 1 ano nas 3 lojas. Copia em
-- bkp_consultas_datas_20261026 (id, date antiga).
begin;
create table if not exists bkp_consultas_datas_20261026 as
  select id, tenant_id, date from consultations
   where status = 'concluida' and created_at::date in ('2026-06-22', '2026-06-23');
update consultations c set date = (c.date - interval '1 year')::date
  from bkp_consultas_datas_20261026 b where b.id = c.id;
commit;

-- Lote pequeno de 11/06 (Castanho): so as consultas com data DEPOIS da propria importacao (impossivel para um exame).
begin;
insert into bkp_consultas_datas_20261026 (id, tenant_id, date)
  select id, tenant_id, date from consultations
   where status = 'concluida' and created_at::date = '2026-06-11' and date > created_at::date;
update consultations set date = (date - interval '1 year')::date
 where status = 'concluida' and created_at::date = '2026-06-11' and date > created_at::date;
commit;

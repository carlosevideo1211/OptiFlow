-- 26/10/2026 (teste do Carlos, venda #27785 / OS #9148 de 28/09): pedido aberto ANTES da contagem do estoque, mas vendido
-- depois, nao dava baixa da lente. Agora vale tambem a OS antiga que tem venda feita depois do inicio.
create or replace function sync_lentes_os(p_os uuid) returns void language plpgsql security definer set search_path = public as $$
declare
  m record; o record; it record; ol record; ini timestamptz;
  e numeric; c numeric; a numeric; q integer;
begin
  -- 1) desfaz o que esta OS já tinha tirado
  for m in select * from lentes_grade_mov where os_id = p_os and motivo = 'os' loop
    update lentes_grade set quantidade = quantidade - m.delta, updated_at = now()
     where tenant_id = m.tenant_id and product_id = m.product_id and esf = m.esf and cil = m.cil and adicao = m.adicao and olho = m.olho;
  end loop;
  delete from lentes_grade_mov where os_id = p_os and motivo = 'os';
  -- 2) refaz, se a OS existe, vale (não é orçamento/cancelada) e é de depois do início
  select * into o from service_orders where id = p_os;
  if not found or coalesce(o.status, '') in ('orcamento', 'cancelada', 'cancelado') then return; end if;
  select inicio into ini from lentes_grade_inicio where tenant_id = o.tenant_id;
  if ini is null then return; end if;
  if o.created_at < ini and not exists (select 1 from sales s where s.os_id = p_os and s.created_at >= ini) then return; end if;
  for it in select i.product_id, greatest(1, coalesce(i.quantidade, 1))::int as qtd, p.tipo
              from os_itens i join lentes_grade_produto p on p.product_id = i.product_id and p.tenant_id = o.tenant_id
             where i.os_id = p_os loop
    for ol in select * from (values ('R', o.od_esf, o.od_cil, o.od_adicao), ('L', o.oe_esf, o.oe_cil, o.oe_adicao)) v(lado, esf, cil, adicao) loop
      e := grau_num(ol.esf::text);
      if e is null then continue; end if;
      c := coalesce(grau_num(ol.cil::text), 0);
      if it.tipo = 'vs' then
        if c > 0 then e := e + c; c := -c; end if;   -- transposição para cilindro negativo
        a := 0;
      else
        c := 0; a := coalesce(grau_num(ol.adicao::text), 0);
      end if;
      q := it.qtd;
      insert into lentes_grade (tenant_id, product_id, esf, cil, adicao, olho, quantidade)
        values (o.tenant_id, it.product_id, e, c, a, case when it.tipo = 'mf' then ol.lado else '' end, -q)
        on conflict (tenant_id, product_id, esf, cil, adicao, olho) do update set quantidade = lentes_grade.quantidade - q, updated_at = now();
      insert into lentes_grade_mov (tenant_id, product_id, esf, cil, adicao, olho, delta, motivo, os_id, os_number)
        values (o.tenant_id, it.product_id, e, c, a, case when it.tipo = 'mf' then ol.lado else '' end, -q, 'os', p_os, o.os_number);
    end loop;
  end loop;
end $$;

create or replace function trg_lentes_os() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sync_lentes_os(coalesce(new.id, old.id));
  return null;
end $$;
create or replace function trg_lentes_os_itens() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sync_lentes_os(coalesce(new.os_id, old.os_id));
  if tg_op = 'UPDATE' and new.os_id is distinct from old.os_id then perform sync_lentes_os(old.os_id); end if;
  return null;
end $$;
drop trigger if exists lentes_os on service_orders;
create trigger lentes_os after insert or delete or update of status, od_esf, od_cil, od_adicao, oe_esf, oe_cil, oe_adicao
  on service_orders for each row execute function trg_lentes_os();
drop trigger if exists lentes_os_itens on os_itens;
create trigger lentes_os_itens after insert or update or delete on os_itens for each row execute function trg_lentes_os_itens();

-- Mais vendidas: conta as LENTES (1 por olho) das OS válidas no período, por produto e grau, mês a mês.
-- Usa todas as OS (inclusive as antigas) e todos os produtos da categoria "Lente de Grau".
create or replace function lentes_mais_vendidas(p_de date, p_ate date)
returns table (mes text, produto text, tipo text, esf numeric, cil numeric, adicao numeric, olho text, lentes bigint)
language sql stable security definer set search_path = public as $$
  with os as (
    select o.*, i.product_id, greatest(1, coalesce(i.quantidade, 1))::int qtd, p.name produto,
           coalesce(g.tipo, case when p.name ilike 'mf%' or p.name ilike '%progress%' or p.name ilike '%multifocal%' then 'mf'
                                 when p.name ilike 'bf%' then 'bf' else 'vs' end) tipo
      from service_orders o join os_itens i on i.os_id = o.id join products p on p.id = i.product_id
      left join lentes_grade_produto g on g.product_id = p.id and g.tenant_id = o.tenant_id
     where o.tenant_id = get_tenant_id() and p.category = 'Lente de Grau'
       and coalesce(o.status, '') not in ('orcamento', 'cancelada', 'cancelado')
       and (o.created_at at time zone 'America/Manaus')::date between p_de and p_ate),
  olhos as (
    select to_char(o.created_at at time zone 'America/Manaus', 'YYYY-MM') mes, o.produto, o.tipo, o.qtd, v.lado,
           grau_num(v.esf::text) e, coalesce(grau_num(v.cil::text), 0) c, coalesce(grau_num(v.adicao::text), 0) a
      from os o, lateral (values ('R', o.od_esf, o.od_cil, o.od_adicao), ('L', o.oe_esf, o.oe_cil, o.oe_adicao)) v(lado, esf, cil, adicao))
  select mes, produto, tipo,
         case when tipo = 'vs' and c > 0 then e + c else e end,
         case when tipo = 'vs' then (case when c > 0 then -c else c end) else 0 end,
         case when tipo = 'vs' then 0 else a end,
         case when tipo = 'vs' then '' else lado end,
         sum(qtd)
    from olhos where e is not null
   group by 1, 2, 3, 4, 5, 6, 7
$$;
-- acerta a OS #9148 (venda #27785)
select sync_lentes_os(id) from service_orders where os_number = 9148 and tenant_id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4';

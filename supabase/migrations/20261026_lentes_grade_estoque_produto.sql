-- 26/10/2026: para as lentes com estoque por grau, o estoque do PRODUTO (Produtos/Estoque) passa a ser sempre a soma
-- das casas de lentes_grade. Antes eram dois estoques soltos (ex.: Vs Foto Blu com 0 em Produtos e 1.119 no grau).
--  - toda mudança em lentes_grade recalcula products.stock daquele produto;
--  - qualquer outra alteração no stock desses produtos (baixa da venda no PDV, ajuste na tela Estoque) é desfeita:
--    quem manda é o estoque por grau (a baixa já sai da OS, pelo trigger sync_lentes_os).

-- Em Produtos a lente é vendida em PAR (preço do par): o estoque do produto = peças / 2 (arredonda para baixo).
create or replace function lentes_soma_produto(p uuid) returns integer language sql stable as $$
  select (coalesce(sum(greatest(quantidade, 0)), 0) / 2)::int from lentes_grade where product_id = p
$$;

create or replace function trg_lentes_grade_produto_stock() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update products set stock = lentes_soma_produto(coalesce(new.product_id, old.product_id))
   where id = coalesce(new.product_id, old.product_id);
  return null;
end $$;
drop trigger if exists lentes_grade_stock on lentes_grade;
create trigger lentes_grade_stock after insert or update of quantidade or delete on lentes_grade
  for each row execute function trg_lentes_grade_produto_stock();

create or replace function trg_products_stock_por_grau() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from lentes_grade_produto g where g.product_id = new.id) then
    new.stock := lentes_soma_produto(new.id);
  end if;
  return new;
end $$;
drop trigger if exists products_stock_por_grau on products;
create trigger products_stock_por_grau before insert or update of stock on products
  for each row execute function trg_products_stock_por_grau();

-- acerta agora os 4 produtos
update products p set stock = lentes_soma_produto(p.id) where exists (select 1 from lentes_grade_produto g where g.product_id = p.id);

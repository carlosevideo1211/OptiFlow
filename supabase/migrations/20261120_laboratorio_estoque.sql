-- Estoque do LABORATÓRIO por grau, dentro da conta da loja (20/11/2026, pedido do Carlos: "tudo num lugar só").
-- Fica SEPARADO do estoque da loja (lentes_grade): tabelas próprias, nada aqui mexe na baixa das OS nem no
-- products.stock. Só o dono (master) e o admin do sistema veem.
--   lab_produto: quais lentes o laboratório tem, o tipo (vs/mf) e o PREÇO DO PAR que o laboratório cobra da loja;
--   lab_grade:   quantidade de cada grau (VS por peça; MF por lado R/L);
--   lab_envios:  cada envio do laboratório para uma loja (número, loja, peças, valor);
--   lab_mov:     todo movimento (inicial, entrada de compra, envio, saída, contagem). O valor do par fica gravado no
--                movimento do envio: se o preço mudar depois, os relatórios antigos não mudam.
-- Envio para a Castanho (mesma conta): sai do laboratório e ENTRA no estoque da loja (lentes_grade) na mesma hora.
-- Envio para a Solar: só sai do laboratório (a Solar não tem estoque por grau).

create table if not exists lab_produto (
  tenant_id uuid not null, product_id uuid not null, tipo text not null check (tipo in ('vs','mf')),
  preco_par numeric(10,2) not null default 0, primary key (tenant_id, product_id));
create table if not exists lab_grade (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, product_id uuid not null,
  esf numeric(5,2) not null, cil numeric(5,2) not null default 0, adicao numeric(4,2) not null default 0,
  olho text not null default '', quantidade integer not null default 0, updated_at timestamptz default now(),
  unique (tenant_id, product_id, esf, cil, adicao, olho));
create table if not exists lab_envios (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, numero integer not null,
  loja text not null, loja_nome text not null, pecas integer not null default 0, valor numeric(12,2) not null default 0,
  obs text default '', desfeito boolean not null default false, created_at timestamptz default now(),
  unique (tenant_id, numero));
create table if not exists lab_mov (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, product_id uuid not null,
  esf numeric(5,2) not null, cil numeric(5,2) not null default 0, adicao numeric(4,2) not null default 0,
  olho text not null default '', delta integer not null, motivo text not null, envio_id uuid references lab_envios(id),
  loja text, valor_par numeric(10,2), obs text default '', created_at timestamptz default now());
create index if not exists idx_lab_mov_tenant on lab_mov (tenant_id, created_at);
create index if not exists idx_lab_mov_envio on lab_mov (envio_id);

-- Só o dono da conta (master) ou o admin do sistema.
create or replace function lab_pode() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_profiles where id = auth.uid() and role in ('master', 'system_admin'))
$$;

alter table lab_produto enable row level security;
alter table lab_grade enable row level security;
alter table lab_envios enable row level security;
alter table lab_mov enable row level security;
drop policy if exists lab_produto_all on lab_produto;
create policy lab_produto_all on lab_produto for all using (tenant_id = get_tenant_id() and lab_pode()) with check (tenant_id = get_tenant_id() and lab_pode());
drop policy if exists lab_grade_all on lab_grade;
create policy lab_grade_all on lab_grade for all using (tenant_id = get_tenant_id() and lab_pode()) with check (tenant_id = get_tenant_id() and lab_pode());
drop policy if exists lab_envios_sel on lab_envios;
create policy lab_envios_sel on lab_envios for select using (tenant_id = get_tenant_id() and lab_pode());
drop policy if exists lab_mov_all on lab_mov;
create policy lab_mov_all on lab_mov for all using (tenant_id = get_tenant_id() and lab_pode()) with check (tenant_id = get_tenant_id() and lab_pode());

-- Envio do laboratório para uma loja. p_itens: [{product_id, esf, cil, adicao, olho, qtd}] (qtd em PEÇAS).
-- Valor = peças x preço do par / 2 (VS: o par são 2 peças; MF: o par é R + L).
create or replace function lab_enviar(p_loja text, p_loja_nome text, p_itens jsonb, p_obs text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t uuid := get_tenant_id(); env uuid; num integer; it jsonb; q integer; pr record; tot_p integer := 0; tot_v numeric := 0;
  e numeric; c numeric; a numeric; o text;
begin
  if t is null or not lab_pode() then raise exception 'Só o dono da conta pode registrar envios do laboratório.'; end if;
  if p_loja not in ('castanho', 'solar') then raise exception 'Loja desconhecida: %', p_loja; end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then raise exception 'Nenhuma lente no envio.'; end if;
  perform pg_advisory_xact_lock(hashtext('lab_envio' || t::text));
  select coalesce(max(numero), 0) + 1 into num from lab_envios where tenant_id = t;
  insert into lab_envios (tenant_id, numero, loja, loja_nome, obs) values (t, num, p_loja, p_loja_nome, coalesce(p_obs, ''))
    returning id into env;
  for it in select * from jsonb_array_elements(p_itens) loop
    q := (it->>'qtd')::int;
    if q is null or q <= 0 then continue; end if;
    select * into pr from lab_produto where tenant_id = t and product_id = (it->>'product_id')::uuid;
    if not found then raise exception 'Lente fora do estoque do laboratório.'; end if;
    e := (it->>'esf')::numeric; c := coalesce((it->>'cil')::numeric, 0); a := coalesce((it->>'adicao')::numeric, 0);
    o := coalesce(it->>'olho', '');
    insert into lab_grade (tenant_id, product_id, esf, cil, adicao, olho, quantidade) values (t, pr.product_id, e, c, a, o, -q)
      on conflict (tenant_id, product_id, esf, cil, adicao, olho) do update set quantidade = lab_grade.quantidade - q, updated_at = now();
    insert into lab_mov (tenant_id, product_id, esf, cil, adicao, olho, delta, motivo, envio_id, loja, valor_par)
      values (t, pr.product_id, e, c, a, o, -q, 'envio', env, p_loja, pr.preco_par);
    if p_loja = 'castanho' and exists (select 1 from lentes_grade_produto g where g.tenant_id = t and g.product_id = pr.product_id) then
      insert into lentes_grade (tenant_id, product_id, esf, cil, adicao, olho, quantidade) values (t, pr.product_id, e, c, a, o, q)
        on conflict (tenant_id, product_id, esf, cil, adicao, olho) do update set quantidade = lentes_grade.quantidade + q, updated_at = now();
      insert into lentes_grade_mov (tenant_id, product_id, esf, cil, adicao, olho, delta, motivo, obs)
        values (t, pr.product_id, e, c, a, o, q, 'entrada', 'Envio do laboratório #' || num);
    end if;
    tot_p := tot_p + q; tot_v := tot_v + q * pr.preco_par / 2;
  end loop;
  if tot_p = 0 then raise exception 'Nenhuma lente no envio.'; end if;
  update lab_envios set pecas = tot_p, valor = round(tot_v, 2) where id = env;
  return jsonb_build_object('id', env, 'numero', num, 'pecas', tot_p, 'valor', round(tot_v, 2));
end $$;

-- Desfazer um envio (lançado errado): as lentes voltam para o laboratório e, se foi para a Castanho, saem da loja.
create or replace function lab_desfazer_envio(p_envio uuid) returns void language plpgsql security definer set search_path = public as $$
declare t uuid := get_tenant_id(); en record; m record;
begin
  if t is null or not lab_pode() then raise exception 'Só o dono da conta pode desfazer envios.'; end if;
  select * into en from lab_envios where id = p_envio and tenant_id = t;
  if not found or en.desfeito then raise exception 'Envio não encontrado ou já desfeito.'; end if;
  for m in select * from lab_mov where envio_id = p_envio loop
    update lab_grade set quantidade = quantidade - m.delta, updated_at = now()
     where tenant_id = t and product_id = m.product_id and esf = m.esf and cil = m.cil and adicao = m.adicao and olho = m.olho;
  end loop;
  if en.loja = 'castanho' then
    for m in select * from lentes_grade_mov where tenant_id = t and motivo = 'entrada' and obs = 'Envio do laboratório #' || en.numero loop
      update lentes_grade set quantidade = quantidade - m.delta, updated_at = now()
       where tenant_id = t and product_id = m.product_id and esf = m.esf and cil = m.cil and adicao = m.adicao and olho = m.olho;
    end loop;
    delete from lentes_grade_mov where tenant_id = t and motivo = 'entrada' and obs = 'Envio do laboratório #' || en.numero;
  end if;
  delete from lab_mov where envio_id = p_envio;
  update lab_envios set desfeito = true where id = p_envio;
end $$;

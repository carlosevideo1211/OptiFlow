-- Cobranca nova - Fase 1, etapa 4 (11/11/2026): ACORDO AUTOMATICO com o Pix da propria loja (so Castanho por enquanto).
-- Regras do Carlos (Claude outputs/cobranca_nova_regras_e_modelo_meta.md):
--  a vista: desconto POR PARCELA pela idade (+1 ano 50%, 3 meses a 1 ano 30%, ate 3 meses 0%);
--  parcelado COM entrada (entrada = 1 parcela, conta como a 1a, ate 4x, minimo R$ 100) sem juros;
--  parcelado SEM entrada com os juros (R$ 0,07/dia por parcela), 1a em 7 dias; Pix do a vista/entrada vale 1 dia.
-- O carne do acordo e igual ao da renegociacao da tela Crediario: notes 'Renegociacao:<carne original>', parcelas
-- originais canceladas, lancamentos no Financeiro (Contas a Receber).

create table if not exists cobranca_acordos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  phone text,
  status text not null default 'ofertado'
    check (status in ('ofertado', 'escolhendo', 'aguardando_pagamento', 'fechado', 'expirado', 'cancelado')),
  tipo text check (tipo in ('vista', 'entrada', 'sem_entrada')),
  parcelas_originais uuid[] not null default '{}',
  valor_original numeric(12,2),      -- soma das parcelas vencidas (sem juros)
  valor_juros numeric(12,2),         -- juros de atraso na data do acordo
  valor_vista numeric(12,2),         -- valor a vista com o desconto por parcela
  n_parcelas int,
  valor_parcela numeric(12,2),
  valor_acordo numeric(12,2),        -- total do acordo escolhido
  pix_valor numeric(12,2),           -- valor do Pix mandado ao cliente (a vista ou a entrada)
  validade date,                     -- ate quando a oferta vale (feirao: 31/12/2026)
  expira_em timestamptz,             -- ate quando o Pix do a vista/entrada vale (1 dia)
  crediario_novo_id uuid references crediario(id),
  ofertado_em timestamptz default now(),
  aceito_em timestamptz,
  fechado_em timestamptz,
  fechado_por text,
  obs text,
  created_at timestamptz not null default now()
);
create index if not exists cobranca_acordos_tenant on cobranca_acordos (tenant_id, status, created_at desc);
create index if not exists cobranca_acordos_cliente on cobranca_acordos (customer_id, status);
alter table cobranca_acordos enable row level security;
drop policy if exists cobranca_acordos_select on cobranca_acordos;
create policy cobranca_acordos_select on cobranca_acordos for select using (tenant_id = get_tenant_id());
drop policy if exists cobranca_acordos_update on cobranca_acordos;
create policy cobranca_acordos_update on cobranca_acordos for update using (tenant_id = get_tenant_id());

-- Quem chama tem acesso a loja? (servidor com service role sempre pode)
create or replace function cobranca_pode(p_tenant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role'
      or exists (select 1 from user_profiles where id = auth.uid() and (tenant_id = p_tenant or role = 'system_admin'));
$$;

-- Oferta: parcelas VENCIDAS em aberto do cliente, com juros e desconto a vista por parcela.
create or replace function cobranca_oferta(p_tenant uuid, p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Manaus')::date;
  r jsonb;
begin
  if not cobranca_pode(p_tenant) then raise exception 'sem acesso'; end if;
  with p as (
    select p.id, p.amount, p.due_date, hoje - p.due_date as dias,
           case when hoje - p.due_date > 365 then 0.5 when hoje - p.due_date > 90 then 0.3 else 0 end as descp
    from crediario_parcelas p join crediario cr on cr.id = p.crediario_id
    where cr.tenant_id = p_tenant and cr.customer_id = p_customer and cr.status = 'ativo'
      and p.status not in ('pago', 'cancelado') and p.due_date < hoje and p.due_date >= '2000-01-01'
  )
  select jsonb_build_object(
    'qtd', count(*),
    'ids', coalesce(jsonb_agg(id order by due_date), '[]'::jsonb),
    'original', coalesce(sum(amount), 0),
    'juros', coalesce(round(sum(dias * 0.07), 2), 0),
    'vista', coalesce(round(sum(amount * (1 - descp)), 2), 0),
    'mais_antiga', min(due_date)
  ) into r from p;
  return r;
end $$;

-- Fecha o acordo: cria o carne do acordo (renegociacao) e cancela as parcelas originais.
-- a vista / com entrada: chamado quando a loja confirma o Pix ("Pagamento recebido") - a 1a parcela ja nasce paga.
-- sem entrada: chamado pelo robo na hora em que o cliente escolhe (todas as parcelas pendentes, 1a em 7 dias).
create or replace function cobranca_fechar_acordo(p_acordo uuid, p_por text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a cobranca_acordos;
  hoje date := (now() at time zone 'America/Manaus')::date;
  novo uuid; pid uuid; orig uuid; nome text;
  i int; venc date; valor numeric(12,2); pago boolean;
begin
  select * into a from cobranca_acordos where id = p_acordo for update;
  if not found then raise exception 'acordo nao encontrado'; end if;
  if not cobranca_pode(a.tenant_id) then raise exception 'sem acesso'; end if;
  if a.status = 'fechado' then
    return jsonb_build_object('ok', true, 'ja_fechado', true, 'crediario_id', a.crediario_novo_id);
  end if;
  if a.status not in ('aguardando_pagamento', 'expirado') or a.tipo is null or coalesce(a.n_parcelas, 0) < 1 then
    raise exception 'acordo ainda nao foi aceito pelo cliente';
  end if;
  if array_length(a.parcelas_originais, 1) is null then raise exception 'acordo sem parcelas'; end if;
  if exists (select 1 from crediario_parcelas where id = any(a.parcelas_originais) and status in ('pago', 'cancelado')) then
    raise exception 'alguma parcela do acordo ja foi paga ou cancelada - confira o cliente e refaca o acordo';
  end if;

  select name into nome from customers where id = a.customer_id;
  select crediario_id into orig from crediario_parcelas where id = a.parcelas_originais[1];

  insert into crediario (tenant_id, customer_id, customer_name, total_amount, installments, status, notes, sale_id)
  values (a.tenant_id, a.customer_id, coalesce(nome, 'Cliente'), a.valor_acordo, a.n_parcelas,
          case when a.tipo = 'vista' then 'quitado' else 'ativo' end, 'Renegociacao:' || orig, null)
  returning id into novo;

  for i in 1..a.n_parcelas loop
    valor := case when i = a.n_parcelas then a.valor_acordo - a.valor_parcela * (a.n_parcelas - 1) else a.valor_parcela end;
    venc := case a.tipo
      when 'vista' then hoje
      when 'entrada' then (hoje + make_interval(months => i - 1))::date
      else ((hoje + 7) + make_interval(months => i - 1))::date end;
    pago := a.tipo in ('vista', 'entrada') and i = 1;
    insert into crediario_parcelas (crediario_id, tenant_id, installment_number, due_date, amount, status, paid_at, paid_amount, payment_method)
    values (novo, a.tenant_id, i, venc, valor, case when pago then 'pago' else 'pendente' end,
            case when pago then now() end, case when pago then valor end, case when pago then 'pix' end)
    returning id into pid;
    insert into financial_transactions (tenant_id, type, description, category, amount, due_date, paid_at, status, payment_method, crediario_parcela_id)
    values (a.tenant_id, 'receita', 'Crediário (acordo) — Parcela ' || i || '/' || a.n_parcelas || ' — ' || coalesce(nome, ''),
            'Crediário', valor, venc, case when pago then now() end, case when pago then 'pago' else 'pendente' end,
            case when pago then 'pix' else 'crediario' end, pid);
  end loop;

  -- Parcelas originais: canceladas (a divida passou para o carne do acordo); carne original sem nada em aberto = cancelado.
  delete from financial_transactions where crediario_parcela_id = any(a.parcelas_originais) and status = 'pendente';
  update crediario_parcelas set status = 'cancelado' where id = any(a.parcelas_originais);
  update crediario c set status = 'cancelado'
   where c.id in (select distinct crediario_id from crediario_parcelas where id = any(a.parcelas_originais))
     and not exists (select 1 from crediario_parcelas x where x.crediario_id = c.id and x.status not in ('pago', 'cancelado'));

  update cobranca_acordos set status = 'fechado', crediario_novo_id = novo, fechado_em = now(), fechado_por = p_por where id = a.id;
  update cobranca_respostas set status = 'confirmado', resolvido_em = now(), resolvido_por = coalesce(p_por, 'acordo')
   where tenant_id = a.tenant_id and customer_id = a.customer_id and status = 'pendente' and intencao in ('paguei', 'pagar_vista', 'parcelar');
  return jsonb_build_object('ok', true, 'crediario_id', novo);
end $$;

revoke all on function cobranca_oferta(uuid, uuid) from public, anon;
revoke all on function cobranca_fechar_acordo(uuid, text) from public, anon;
grant execute on function cobranca_oferta(uuid, uuid) to authenticated, service_role;
grant execute on function cobranca_fechar_acordo(uuid, text) to authenticated, service_role;

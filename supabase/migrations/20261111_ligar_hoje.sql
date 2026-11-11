-- Cobranca nova - Fase 2, Quem ligar hoje (11/11/2026). Lista diaria (ate 15) para a loja ligar, por prioridade:
--  1 pediu contato (respondeu "nao consigo pagar" ou "falar com a loja")   2 promessa de pagamento que venceu
--  3 nao respondeu a oferta do Feirao em 3 dias                            4 valor alto (R$ 1.500+)
--  5 demais com atraso de 31 dias a 5 anos (maior divida primeiro)
-- Quem recebeu ligacao nos ultimos 7 dias, tem PAGUEI esperando ou acordo em andamento nao entra.
create table if not exists cobranca_ligacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid not null references customers(id),
  resultado text not null check (resultado in ('vai_pagar', 'promessa', 'nao_atendeu', 'numero_errado', 'recusou', 'outro')),
  promessa_data date,
  obs text,
  criado_por text,
  created_at timestamptz not null default now()
);
create index if not exists cobranca_ligacoes_cliente on cobranca_ligacoes (customer_id, created_at desc);
alter table cobranca_ligacoes enable row level security;
drop policy if exists cobranca_ligacoes_select on cobranca_ligacoes;
create policy cobranca_ligacoes_select on cobranca_ligacoes for select using (tenant_id = get_tenant_id());
drop policy if exists cobranca_ligacoes_insert on cobranca_ligacoes;
create policy cobranca_ligacoes_insert on cobranca_ligacoes for insert with check (tenant_id = get_tenant_id());

create or replace function cobranca_ligar_hoje(p_tenant uuid, p_limite int default 15)
returns table (customer_id uuid, nome text, telefone text, prioridade int, motivo text, divida numeric, dias_max int,
               ultima_ligacao text, ultima_ligacao_em date)
language sql stable security definer set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Manaus')::date d),
  ab as (
    select cr.customer_id, sum(p.amount) divida, max((select d from hoje) - p.due_date) dias_max
    from crediario_parcelas p join crediario cr on cr.id = p.crediario_id
    where cr.tenant_id = p_tenant and cr.status = 'ativo' and p.status not in ('pago', 'cancelado')
      and p.due_date < (select d from hoje) and p.due_date >= '2000-01-01'
    group by 1),
  ult as (select distinct on (l.customer_id) l.customer_id, l.resultado, l.promessa_data, l.created_at
          from cobranca_ligacoes l where l.tenant_id = p_tenant order by l.customer_id, l.created_at desc),
  base as (
    select c.id, c.name, coalesce(nullif(c.whatsapp, ''), c.phone, '') fone, ab.divida, ab.dias_max, u.resultado, u.promessa_data, u.created_at ult_em,
      case
        when exists (select 1 from cobranca_respostas r where r.customer_id = c.id and r.status = 'pendente' and r.intencao in ('nao_consigo', 'falar_loja')) then 1
        when u.resultado = 'promessa' and u.promessa_data < (select d from hoje) then 2
        when exists (select 1 from cobranca_acordos a where a.customer_id = c.id and a.status = 'ofertado' and a.ofertado_em < now() - interval '3 days') then 3
        when ab.divida >= 1500 then 4
        else 5 end prioridade
    from ab join customers c on c.id = ab.customer_id
    left join ult u on u.customer_id = c.id
    where ab.dias_max between 31 and 1825
      and (telefone_valido(c.whatsapp) or telefone_valido(c.phone))
      and (u.created_at is null or u.created_at < now() - interval '7 days')
      and not exists (select 1 from cobranca_respostas r where r.customer_id = c.id and r.status = 'pendente' and r.intencao = 'paguei')
      and not exists (select 1 from cobranca_acordos a where a.customer_id = c.id and a.status in ('escolhendo', 'aguardando_pagamento')))
  select id, name, fone, prioridade,
    case prioridade when 1 then 'Pediu contato pelo WhatsApp' when 2 then 'Prometeu pagar e não pagou'
      when 3 then 'Não respondeu a oferta do Feirão' when 4 then 'Valor alto' else 'Atraso de mais de 30 dias' end,
    divida, dias_max,
    case resultado when 'vai_pagar' then 'Disse que vai pagar' when 'promessa' then 'Prometeu para ' || to_char(promessa_data, 'DD/MM')
      when 'nao_atendeu' then 'Não atendeu' when 'numero_errado' then 'Número errado' when 'recusou' then 'Recusou' when 'outro' then 'Outro' end,
    ult_em::date
  from base
  where cobranca_pode(p_tenant)
  order by prioridade, divida desc
  limit p_limite;
$$;
revoke all on function cobranca_ligar_hoje(uuid, int) from public, anon;
grant execute on function cobranca_ligar_hoje(uuid, int) to authenticated, service_role;

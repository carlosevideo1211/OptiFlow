-- Feirao Limpa Nome (11/11/2026): envio automatico da oferta, N clientes por dia (padrao 20), na ordem aprovada pelo
-- Carlos (planilha feirao_limpa_nome_lista_2026-11-11.xlsx): Onda 1 "pagou parte e parou" (maior divida primeiro),
-- Onda 2 "voltou a comprar", Onda 3 demais (divida mais recente primeiro). Cada cliente recebe a oferta UMA vez.
-- Interruptor por loja: tenants.feirao_envio = 'off' | 'espelho' (so calcula) | 'enviar'.

alter table tenants add column if not exists feirao_envio text not null default 'off'
  check (feirao_envio in ('off', 'espelho', 'enviar'));
alter table tenants add column if not exists feirao_por_dia int not null default 20;

-- A oferta conta como mensagem do dia (regra: no maximo 1 mensagem automatica por cliente por dia).
alter table whatsapp_triggers_log drop constraint if exists whatsapp_triggers_log_trigger_type_check;
alter table whatsapp_triggers_log add constraint whatsapp_triggers_log_trigger_type_check check (trigger_type = any (array[
  'aniversario', 'vencimento', 'pos_venda', 'adaptacao', 'vencimento_dia', 'vencimento_atraso5',
  'cobranca_atraso', 'cobranca_manual', 'cobranca_manual_local',
  'retorno_exame', 'aviso_negativacao', 'negociacao_debito_antigo', 'oferta_feirao'
]::text[]));

create or replace function cobranca_feirao_candidatos(p_tenant uuid, p_limite int default 20)
returns table (customer_id uuid, nome text, grupo text, original numeric, vista numeric, dias_max int)
language sql stable security definer set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Manaus')::date d),
  ab as (
    select cr.customer_id, p.amount, (select d from hoje) - p.due_date dias, coalesce(cr.notes, '') notes
    from crediario_parcelas p join crediario cr on cr.id = p.crediario_id
    where cr.tenant_id = p_tenant and cr.status = 'ativo' and p.status not in ('pago', 'cancelado')
      and p.due_date < (select d from hoje) and p.due_date >= '2000-01-01'),
  cli as (
    select ab.customer_id, sum(amount) original, max(dias) dias_max, min((select d from hoje) - dias) mais_antiga,
      round(sum(amount * (1 - case when dias > 365 then 0.5 when dias > 90 then 0.3 else 0 end)), 2) vista,
      bool_or(notes ilike 'Importado%') importado
    from ab group by 1),
  base as (
    select c.id, c.name, cli.original, cli.vista, cli.dias_max, cli.mais_antiga, cli.importado, coalesce(c.city, '') cidade,
      regexp_replace(coalesce(nullif(c.whatsapp, ''), c.phone, ''), '\D', '', 'g') fone,
      (select count(*) from crediario_parcelas p join crediario cr on cr.id = p.crediario_id
        where cr.customer_id = c.id and p.status = 'pago') pagas,
      (select max(s.created_at)::date from sales s where s.customer_id = c.id) ultima_compra
    from cli join customers c on c.id = cli.customer_id
    where coalesce(c.whatsapp_opt_out, false) = false)
  select b.id, b.name,
    case when b.pagas > 0 then '1. Pagou parte e parou'
         when b.ultima_compra > b.mais_antiga then '2. Voltou a comprar' else '3. Demais' end,
    b.original, b.vista, b.dias_max
  from base b
  where length(b.fone) >= 10
    and b.dias_max between 31 and 1825          -- ate 30 dias fica na regua normal; mais de 5 anos fica de fora
    and b.original < 1500                        -- valor alto: o Carlos liga
    and not exists (select 1 from customers x where x.id = b.id and x.telefone_sem_whatsapp_em is not null) -- numero sem WhatsApp
    and not (b.cidade = '' and b.importado)      -- importado sem cidade: conferir antes
    and b.cidade !~* 'auta[sz]|altaz'            -- cliente de Autazes e da outra loja
    and not exists (select 1 from cobranca_acordos a where a.customer_id = b.id)          -- oferta so uma vez
    and not exists (select 1 from cobranca_respostas r where r.customer_id = b.id and r.status = 'pendente')
    and not exists (select 1 from whatsapp_triggers_log l where l.customer_id = b.id
                     and (l.sent_at at time zone 'America/Manaus')::date = (select d from hoje))
    and not exists (                             -- mesmo cliente em outra loja: conferir antes
      select 1 from customers o join crediario cr2 on cr2.customer_id = o.id
      where o.tenant_id <> p_tenant and o.tenant_id <> 'de0e0000-0000-4000-8000-0000000000d1'
        and (lower(o.name) = lower(b.name)
             or right(regexp_replace(coalesce(o.whatsapp, o.phone, ''), '\D', '', 'g'), 8) = right(b.fone, 8)))
  order by case when b.pagas > 0 then 1 when b.ultima_compra > b.mais_antiga then 2 else 3 end,
           case when b.pagas > 0 or b.ultima_compra > b.mais_antiga then -b.original else b.dias_max end
  limit p_limite;
$$;
revoke all on function cobranca_feirao_candidatos(uuid, int) from public, anon, authenticated;
grant execute on function cobranca_feirao_candidatos(uuid, int) to service_role;

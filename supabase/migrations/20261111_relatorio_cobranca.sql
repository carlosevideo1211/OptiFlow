-- Relatorios automaticos da cobranca nova (11/11/2026): mensal (dia 6 de dez/2026 a mar/2027, sobre o mes anterior)
-- e o do Feirao Limpa Nome (02/01/2027). Numeros de um periodo [p_ini, p_fim], loja x outras oticas (somadas).
-- So o servidor chama (Edge Function cobranca-relatorio).
create or replace function cobranca_relatorio(p_tenant uuid, p_ini date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  with outras as (
    select t.id from tenants t
    where t.id <> p_tenant and t.id <> 'de0e0000-0000-4000-8000-0000000000d1'
      and (select count(*) from crediario_parcelas x where x.tenant_id = t.id) >= 50),
  base as (
    select p.tenant_id, p.due_date, p.amount, coalesce(p.paid_amount, p.amount) pago_valor, p.status,
           (p.paid_at at time zone 'America/Manaus')::date pago_em
    from crediario_parcelas p left join crediario c on c.id = p.crediario_id
    where p.status <> 'cancelado' and coalesce(c.status, 'ativo') <> 'cancelado'
      and p.due_date between '2020-01-01' and '2100-12-31'
      and (p.tenant_id = p_tenant or p.tenant_id in (select id from outras))),
  medida as (   -- das parcelas em aberto na vespera do vencimento, % pagas ate 5 dias depois
    select (tenant_id = p_tenant) minha, count(*) base, count(*) filter (where status = 'pago' and pago_em <= due_date + 5) pagas
    from base
    where due_date between p_ini and p_fim
      and not (status = 'pago' and pago_em is null)
      and (pago_em is null or pago_em >= due_date - 1)
    group by 1),
  rec as (      -- recuperado no periodo: pago com mais de 30 dias de atraso
    select case when pago_em - due_date <= 90 then '31-90' when pago_em - due_date <= 365 then '91-365' else '+1 ano' end faixa,
           count(*) qtd, sum(pago_valor) valor
    from base where tenant_id = p_tenant and status = 'pago' and pago_em between p_ini and p_fim and pago_em - due_date > 30
    group by 1),
  cob as (      -- retorno da cobranca de atraso: cobrados no periodo que pagaram algo depois
    select l.tenant_id, l.customer_id, min(l.sent_at) enviado
    from whatsapp_triggers_log l
    where l.trigger_type = 'cobranca_atraso' and l.success and l.customer_id is not null
      and (l.sent_at at time zone 'America/Manaus')::date between p_ini and p_fim
      and (l.tenant_id = p_tenant or l.tenant_id in (select id from outras))
    group by 1, 2),
  ret as (
    select (c.tenant_id = p_tenant) minha, count(*) cobrados,
      count(*) filter (where exists (select 1 from crediario_parcelas p join crediario cr on cr.id = p.crediario_id
                                     where cr.customer_id = c.customer_id and p.status = 'pago' and p.paid_at > c.enviado)) pagaram
    from cob c group by 1),
  av as (select * from vigia_avisos where (criado_em at time zone 'America/Manaus')::date between p_ini and p_fim)
  select jsonb_build_object(
    'loja', (select company_name from tenants where id = p_tenant),
    'ini', p_ini, 'fim', p_fim, 'outras_lojas', (select count(*) from outras),
    'medida', jsonb_build_object(
      'base', coalesce((select base from medida where minha), 0), 'pagas', coalesce((select pagas from medida where minha), 0),
      'base_outras', coalesce((select base from medida where not minha), 0), 'pagas_outras', coalesce((select pagas from medida where not minha), 0)),
    'recuperado', coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'qtd', qtd, 'valor', valor)) from rec), '[]'::jsonb),
    'recuperado_total', coalesce((select sum(valor) from rec), 0),
    'retorno', jsonb_build_object(
      'cobrados', coalesce((select cobrados from ret where minha), 0), 'pagaram', coalesce((select pagaram from ret where minha), 0),
      'cobrados_outras', coalesce((select cobrados from ret where not minha), 0), 'pagaram_outras', coalesce((select pagaram from ret where not minha), 0)),
    'divida_hoje', (select jsonb_object_agg(faixa, valor) from (
        select case when (now() at time zone 'America/Manaus')::date - due_date <= 30 then '1-30'
                    when (now() at time zone 'America/Manaus')::date - due_date <= 90 then '31-90'
                    when (now() at time zone 'America/Manaus')::date - due_date <= 365 then '91-365' else '+1 ano' end faixa,
               sum(amount) valor
        from base where tenant_id = p_tenant and status <> 'pago' and due_date < (now() at time zone 'America/Manaus')::date group by 1) x),
    'vigia', jsonb_build_object(
      'dias_robo_parado', (select count(distinct (criado_em at time zone 'America/Manaus')::date) from av
                           where texto ilike '%nenhuma mensagem registrada hoje%' or texto ilike '%não mandou nenhuma mensagem hoje%'),
      'avisos_trava', (select count(*) from av where texto ilike '%TRAVA%'),
      'avisos_paguei_parado', (select count(*) from av where texto ilike '%PAGUEI%há mais de 2 dias%'),
      'avisos_whatsapp_caiu', (select count(*) from av where texto ilike '%caiu%' or texto ilike '%está "%')),
    'mensagens', (select count(*) from whatsapp_triggers_log l where l.tenant_id = p_tenant and l.success
                  and (l.sent_at at time zone 'America/Manaus')::date between p_ini and p_fim),
    'feirao', cobranca_painel_feirao(p_tenant)
  ) into res;
  return res;
end $$;
revoke all on function cobranca_relatorio(uuid, date, date) from public, anon, authenticated;
grant execute on function cobranca_relatorio(uuid, date, date) to service_role;

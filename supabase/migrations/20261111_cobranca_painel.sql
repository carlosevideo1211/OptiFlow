-- Cobranca nova (Fase 1, etapa 1 - 11/11/2026): interruptor por loja + painel de resultado na tela Crediario.
-- Modulo separado: so le crediario/crediario_parcelas, nao altera nada de venda/OS/receita.

-- Interruptor por loja (como o visual_novo). Ligado so na Castanho por enquanto.
alter table tenants add column if not exists cobranca_nova boolean not null default false;
update tenants set cobranca_nova = true where id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4';

-- Painel de resultado. Devolve json com:
--  meses[]   : medida justa por mes de vencimento (ultimos 6 meses): das parcelas em aberto na vespera do vencimento,
--              quantas % foram pagas ate 5 dias depois. So entram vencimentos com a janela de 5 dias ja fechada.
--              Traz tambem o mesmo numero somado das outras oticas (comparacao so em numeros gerais).
--  recuperado: pago no mes atual de parcelas que, no dia do pagamento, tinham mais de 30 dias de atraso (por faixa).
--  faixas    : divida vencida em aberto hoje por faixa de atraso (1-30, 31-90, 91-365, +1 ano).
-- Datas no horario de Manaus. Parcela/carne cancelado nao entra. Parcela paga sem data de pagamento nao entra na medida.
create or replace function cobranca_painel(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Manaus')::date;
  ini_mes date := date_trunc('month', (now() at time zone 'America/Manaus'))::date;
  v_role text;
  v_tenant uuid;
  res jsonb;
begin
  select role, tenant_id into v_role, v_tenant from user_profiles where id = auth.uid();
  if v_role is distinct from 'system_admin' and v_tenant is distinct from p_tenant then
    raise exception 'sem acesso';
  end if;

  with base as (
    select p.tenant_id, p.due_date, coalesce(p.paid_amount, p.amount) as valor_pago, p.amount, p.status,
           (p.paid_at at time zone 'America/Manaus')::date as pago_em
    from crediario_parcelas p
    left join crediario c on c.id = p.crediario_id
    where p.status <> 'cancelado' and coalesce(c.status, 'ativo') <> 'cancelado'
      and p.due_date between '2020-01-01' and '2100-12-31'
  ),
  outras as (
    select t.id from tenants t
    where t.id <> p_tenant and t.id <> 'de0e0000-0000-4000-8000-0000000000d1'
      and (select count(*) from crediario_parcelas x where x.tenant_id = t.id) >= 50
  ),
  medida as (
    select date_trunc('month', due_date)::date as mes,
           (tenant_id = p_tenant) as minha,
           count(*) as em_aberto_vespera,
           count(*) filter (where status = 'pago' and pago_em <= due_date + 5) as pagas_5d
    from base
    where due_date >= (ini_mes - interval '5 months')::date
      and due_date <= hoje - 5
      and not (status = 'pago' and pago_em is null)
      and (pago_em is null or pago_em >= due_date - 1)
      and (tenant_id = p_tenant or tenant_id in (select id from outras))
    group by 1, 2
  ),
  meses as (
    select m.mes,
           max(case when minha then em_aberto_vespera end) as base_loja,
           max(case when minha then pagas_5d end) as pagas_loja,
           max(case when not minha then em_aberto_vespera end) as base_outras,
           max(case when not minha then pagas_5d end) as pagas_outras
    from medida m group by m.mes
  ),
  rec as (
    select case when pago_em - due_date <= 90 then '31-90'
                when pago_em - due_date <= 365 then '91-365'
                else '+1 ano' end as faixa,
           count(*) as qtd, sum(valor_pago) as valor
    from base
    where tenant_id = p_tenant and status = 'pago' and pago_em >= ini_mes and pago_em <= hoje
      and pago_em - due_date > 30
    group by 1
  ),
  aberto as (
    select b.*, hoje - b.due_date as dias from base b
    where b.status <> 'pago' and b.due_date < hoje
  ),
  fx as (
    select case when dias <= 30 then '1-30' when dias <= 90 then '31-90' when dias <= 365 then '91-365' else '+1 ano' end as faixa,
           (tenant_id = p_tenant) as minha,
           count(*) as qtd, sum(amount) as valor
    from aberto
    where tenant_id = p_tenant or tenant_id in (select id from outras)
    group by 1, 2
  )
  select jsonb_build_object(
    'hoje', hoje,
    'outras_lojas', (select count(*) from outras),
    'meses', coalesce((select jsonb_agg(jsonb_build_object(
        'mes', mes, 'base', coalesce(base_loja, 0), 'pagas', coalesce(pagas_loja, 0),
        'base_outras', coalesce(base_outras, 0), 'pagas_outras', coalesce(pagas_outras, 0)) order by mes) from meses), '[]'::jsonb),
    'recuperado', coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'qtd', qtd, 'valor', valor)) from rec), '[]'::jsonb),
    'faixas', coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'minha', minha, 'qtd', qtd, 'valor', valor)) from fx), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;

revoke all on function cobranca_painel(uuid) from public, anon;
grant execute on function cobranca_painel(uuid) to authenticated;

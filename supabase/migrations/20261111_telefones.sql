-- Cobranca nova - Fase 2, Telefones (11/11/2026).
-- 1) Numero que a Meta recusou por nao ter WhatsApp (erro 131026) fica marcado no cadastro (o whatsapp-webhook marca).
-- 2) Quando a loja corrige o telefone no cadastro, a marca some sozinha.
-- 3) Lista "Corrigir telefones" do Crediario: quem deve e nao recebe cobranca por falta de telefone valido.
alter table customers add column if not exists telefone_sem_whatsapp_em timestamptz;

create or replace function limpa_telefone_sem_whatsapp() returns trigger language plpgsql as $$
begin
  if coalesce(new.phone, '') is distinct from coalesce(old.phone, '')
     or coalesce(new.whatsapp, '') is distinct from coalesce(old.whatsapp, '') then
    new.telefone_sem_whatsapp_em := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_limpa_telefone_sem_whatsapp on customers;
create trigger trg_limpa_telefone_sem_whatsapp before update of phone, whatsapp on customers
  for each row execute function limpa_telefone_sem_whatsapp();

create or replace function telefone_valido(t text) returns boolean language sql immutable as $$
  with d as (select case when length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 12
                          and regexp_replace(coalesce(t, ''), '\D', '', 'g') like '55%'
                         then substr(regexp_replace(t, '\D', '', 'g'), 3)
                         else regexp_replace(coalesce(t, ''), '\D', '', 'g') end as n)
  select length(n) in (10, 11) and substr(n, 1, 2)::int between 11 and 99 and substr(n, 2, 1) <> '0'
         and substr(n, 3) !~ '^(\d)\1+$' from d;
$$;

create or replace function cobranca_telefones_corrigir(p_tenant uuid)
returns table (customer_id uuid, nome text, telefone text, motivo text, divida numeric, parcelas bigint, dias_max int, cidade text)
language sql stable security definer set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Manaus')::date d),
  ab as (
    select cr.customer_id, sum(p.amount) divida, count(*) parcelas, max((select d from hoje) - p.due_date) dias_max
    from crediario_parcelas p join crediario cr on cr.id = p.crediario_id
    where cr.tenant_id = p_tenant and cr.status = 'ativo' and p.status not in ('pago', 'cancelado')
      and p.due_date < (select d from hoje) and p.due_date >= '2000-01-01'
    group by 1)
  select c.id, c.name, coalesce(nullif(c.whatsapp, ''), c.phone, ''),
    case when c.telefone_sem_whatsapp_em is not null then 'Número sem WhatsApp (a mensagem não chegou)'
         when coalesce(nullif(c.whatsapp, ''), c.phone, '') = '' then 'Sem telefone no cadastro'
         else 'Telefone incompleto ou errado' end,
    ab.divida, ab.parcelas, ab.dias_max, coalesce(c.city, '')
  from ab join customers c on c.id = ab.customer_id
  where cobranca_pode(p_tenant)
    and ab.dias_max <= 1825
    and (c.telefone_sem_whatsapp_em is not null or not (telefone_valido(c.whatsapp) or telefone_valido(c.phone)))
  order by ab.divida desc;
$$;
revoke all on function cobranca_telefones_corrigir(uuid) from public, anon;
grant execute on function cobranca_telefones_corrigir(uuid) to authenticated, service_role;

-- As 4 ofertas do Feirao que a Meta recusou em 11/11 por numero sem WhatsApp.
update customers c set telefone_sem_whatsapp_em = now()
from whatsapp_mensagens m
where m.tenant_id = c.tenant_id and m.status = 'failed' and m.erro like '131026%'
  and right(regexp_replace(coalesce(nullif(c.whatsapp, ''), c.phone, ''), '\D', '', 'g'), 8) = right(m.phone, 8);

-- Cobranca nova - Fase 2, Trava (11/11/2026): cliente que recebeu MAIS DE 1 mensagem automatica no mesmo dia
-- (regra combinada com o Carlos em 03/11). O vigia avisa na hora; meta: zero.
create or replace function public.vigia_mensagens_duplicadas()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('loja', loja, 'cliente', cliente, 'qtd', qtd, 'tipos', tipos)), '[]'::jsonb)
  from (select t.company_name loja, coalesce(c.name, l.phone) cliente, count(*) qtd, string_agg(l.trigger_type, ', ') tipos
        from whatsapp_triggers_log l join tenants t on t.id = l.tenant_id left join customers c on c.id = l.customer_id
        where l.success and l.customer_id is not null
          and (l.sent_at at time zone 'America/Manaus')::date = (now() at time zone 'America/Manaus')::date
          and l.trigger_type not in ('cobranca_manual', 'cobranca_manual_local')   -- envio feito pela loja, na mao
        group by 1, 2 having count(*) > 1) x;
$$;
revoke all on function public.vigia_mensagens_duplicadas() from public, anon, authenticated;
grant execute on function public.vigia_mensagens_duplicadas() to service_role;

-- Cobranca nova - Fase 1, etapa 2 (11/11/2026): VIGIA. Avisa o Carlos no WhatsApp quando o robo para, quando o
-- WhatsApp de uma loja cai ou quando os erros de envio aumentam. Chamado de hora em hora pela Edge Function
-- vigia-cobranca (pg_cron). Modulo separado: so le; grava apenas nas proprias tabelas vigia_*.

-- Estado de cada coisa vigiada (para avisar so quando muda e nao repetir o mesmo aviso toda hora).
create table if not exists vigia_estado (
  chave text primary key,            -- ex.: 'whatsapp:<tenant>:evolution', 'robo:<tenant>', 'erros:<tenant>'
  estado text not null,              -- 'ok' | 'problema' | texto livre (ex.: estado da conexao)
  alterado_em timestamptz not null default now(),
  ultimo_aviso timestamptz
);
-- Historico dos avisos mandados (ou que falharam ao mandar).
create table if not exists vigia_avisos (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  texto text not null,
  canal text,                        -- 'whatsapp' | 'email' | 'nenhum'
  ok boolean not null default false,
  erro text
);
alter table vigia_estado enable row level security;
alter table vigia_avisos enable row level security;
-- Sem policy: so o servidor (service role) le e grava.

-- Numeros que o vigia precisa (ultimas horas / hoje no horario de Manaus).
create or replace function public.vigia_cobranca_dados()
returns jsonb
language sql
stable
security definer
set search_path = public, cron
as $$
  with hoje as (select (now() at time zone 'America/Manaus')::date d)
  select jsonb_build_object(
    'hoje', (select d from hoje),
    'hora_manaus', extract(hour from now() at time zone 'America/Manaus'),
    'dia_semana', extract(isodow from now() at time zone 'America/Manaus'),  -- 7 = domingo
    -- Envios do robo hoje em TODAS as lojas (registro do envio, com sucesso ou nao).
    'envios_hoje_total', (select count(*) from whatsapp_triggers_log
                          where (sent_at at time zone 'America/Manaus')::date = (select d from hoje)),
    -- Rodadas da rotina do robo (pg_cron) na ultima hora.
    'robo_rodadas_1h', (select jsonb_build_object('total', count(*), 'falhas', count(*) filter (where r.status <> 'succeeded'))
                        from cron.job_run_details r join cron.job j on j.jobid = r.jobid
                        where j.command like '%send-whatsapp-triggers%' and r.start_time > now() - interval '1 hour'),
    -- Lojas vigiadas: as da cobranca nova (interruptor) e todas com WhatsApp automatico ligado e instancia/Meta.
    'lojas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'nome', t.company_name, 'canal', t.whatsapp_canal, 'instancia', t.whatsapp_instance_name,
        'cobranca_nova', t.cobranca_nova, 'wa_phone_id', s.wa_phone_id,
        'envios_hoje', (select count(*) from whatsapp_triggers_log l where l.tenant_id = t.id
                          and (l.sent_at at time zone 'America/Manaus')::date = (select d from hoje)),
        'ok_2h', (select count(*) from whatsapp_triggers_log l where l.tenant_id = t.id and l.success
                    and l.sent_at > now() - interval '2 hours'),
        'falhas_2h', (select count(*) from whatsapp_triggers_log l where l.tenant_id = t.id and not l.success
                        and l.sent_at > now() - interval '2 hours'),
        'erro_exemplo', (select left(l.error_message, 120) from whatsapp_triggers_log l where l.tenant_id = t.id
                           and not l.success and l.sent_at > now() - interval '2 hours' order by l.sent_at desc limit 1),
        'meta_falhas_2h', (select count(*) from whatsapp_mensagens m where m.tenant_id = t.id
                             and m.created_at > now() - interval '2 hours' and m.status in ('falhou', 'failed'))
      )), '[]'::jsonb)
      from tenants t left join store_settings s on s.tenant_id = t.id
      where t.cobranca_nova or (t.whatsapp_auto_ativo and (t.whatsapp_instance_name is not null or t.whatsapp_canal = 'meta'))),
    -- Para onde mandar o aviso: numero de aviso e instancia Evolution da Castanho.
    'aviso', (select jsonb_build_object('numero', s.wa_alerta_numero, 'instancia', t.whatsapp_instance_name)
              from tenants t left join store_settings s on s.tenant_id = t.id
              where t.id = '2ca58112-4498-4dfa-b6d1-550630d5c4a4')
  );
$$;

revoke all on function public.vigia_cobranca_dados() from public, anon, authenticated;
grant execute on function public.vigia_cobranca_dados() to service_role;

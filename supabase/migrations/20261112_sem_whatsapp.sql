-- 12/11/2026: numero de cliente SEM WhatsApp (Evolution: "exists":false / Meta: 131026) nao e defeito do sistema.
-- 1) fica marcado no cadastro (customers.telefone_sem_whatsapp_em) - a marca some quando o telefone e alterado;
-- 2) o robo deixa de tentar mandar para ele (send-whatsapp-triggers);
-- 3) vigia e check-up deixam de contar como falha.
create or replace function marca_sem_whatsapp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.success and new.customer_id is not null and coalesce(new.error_message, '') ilike '%"exists":false%' then
    update customers set telefone_sem_whatsapp_em = now() where id = new.customer_id and telefone_sem_whatsapp_em is null;
  end if;
  return new;
end $$;
drop trigger if exists trg_marca_sem_whatsapp on whatsapp_triggers_log;
create trigger trg_marca_sem_whatsapp after insert or update of success, error_message on whatsapp_triggers_log
  for each row execute function marca_sem_whatsapp();

-- Ja aconteceu (ultimos 60 dias): marca agora.
update customers c set telefone_sem_whatsapp_em = now()
where c.telefone_sem_whatsapp_em is null and exists (
  select 1 from whatsapp_triggers_log l where l.customer_id = c.id and not l.success
    and l.error_message ilike '%"exists":false%' and l.sent_at > now() - interval '60 days');

create or replace function public.checkup_saude()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net
as $$
declare
  r jsonb := '{}'::jsonb;
begin
  -- Rotinas agendadas (pg_cron) que falharam
  r := r || jsonb_build_object('cron_falhas', (
    select coalesce(jsonb_agg(jsonb_build_object('rotina', j.jobname, 'falhas', f.n)), '[]'::jsonb)
    from (select jobid, count(*) n from cron.job_run_details
          where start_time > now() - interval '24 hours' and status <> 'succeeded' group by jobid) f
    join cron.job j on j.jobid = f.jobid));

  -- Funcoes chamadas pelas rotinas que responderam com erro (timeout do send-whatsapp-triggers e esperado:
  -- a chamada espera so 5s, mas a funcao continua rodando)
  r := r || jsonb_build_object('http_erros', (
    select count(*) from net._http_response where status_code >= 400));

  -- Robo de WhatsApp das lojas
  r := r || jsonb_build_object('whatsapp_robo', (
    select jsonb_build_object('enviadas', count(*) filter (where success),
      -- 12/11/2026: numero sem WhatsApp nao e falha do sistema (fica marcado no cadastro e sai da cobranca automatica)
      'falhas', count(*) filter (where not success and coalesce(error_message, '') not ilike '%"exists":false%'),
      'numeros_sem_whatsapp', count(*) filter (where not success and coalesce(error_message, '') ilike '%"exists":false%'))
    from whatsapp_triggers_log where sent_at > now() - interval '24 hours'));

  -- Integracao com o Centofin parada ou com erro
  r := r || jsonb_build_object('centofin_sync', (
    select coalesce(jsonb_agg(jsonb_build_object('loja', t.company_name, 'ultimo_envio', s.centofin_ultimo_envio,
                                                 'status', left(s.centofin_ultimo_status, 120))), '[]'::jsonb)
    from store_settings s join tenants t on t.id = s.tenant_id
    where s.centofin_ativo and (s.centofin_ultimo_envio < now() - interval '2 hours'
                                or coalesce(s.centofin_ultimo_status, '') not like 'ok%')));

  -- Venda no crediario sem carne, ou carne sem parcelas (bugs que ja aconteceram)
  r := r || jsonb_build_object('vendas_crediario_sem_carne', (
    select coalesce(jsonb_agg(jsonb_build_object('loja', t.company_name, 'venda', s.sale_number, 'cliente', s.customer_name)), '[]'::jsonb)
    from sales s join tenants t on t.id = s.tenant_id
    where s.payment_method = 'crediario' and s.total > 0 and s.created_at > now() - interval '24 hours'
      and coalesce(s.status, '') <> 'cancelada'
      and not exists (select 1 from crediario c where c.sale_id = s.id)));
  r := r || jsonb_build_object('carnes_sem_parcelas', (
    select coalesce(jsonb_agg(jsonb_build_object('loja', t.company_name, 'cliente', c.customer_name)), '[]'::jsonb)
    from crediario c join tenants t on t.id = c.tenant_id
    where c.created_at > now() - interval '24 hours' and coalesce(c.status, '') <> 'cancelado'
      and not exists (select 1 from crediario_parcelas p where p.crediario_id = c.id)));

  -- Respostas pelo WhatsApp oficial (Meta) que falharam
  r := r || jsonb_build_object('whatsapp_meta_falhas', (
    select count(*) from whatsapp_mensagens where created_at > now() - interval '24 hours' and status in ('falhou', 'failed')
      and coalesce(erro, '') !~ '^(131026|131049)'));
  return r;
end $$;

revoke all on function public.checkup_saude() from public, anon, authenticated;
grant execute on function public.checkup_saude() to service_role;

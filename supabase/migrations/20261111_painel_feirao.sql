-- Painel "Resultado da cobranca" (11/11/2026): numeros do Feirao Limpa Nome e retorno da cobranca de atraso.
alter table cobranca_acordos add column if not exists grupo text;
-- As 20 primeiras ofertas (11/11) foram todas da Onda 1.
update cobranca_acordos set grupo = '1. Pagou parte e parou' where grupo is null and created_at::date = '2026-11-11';

create or replace function cobranca_painel_feirao(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not cobranca_pode(p_tenant) then raise exception 'sem acesso'; end if;
  with a as (select * from cobranca_acordos where tenant_id = p_tenant),
  rec as (  -- dinheiro que ja entrou pelos carnes dos acordos (a vista, entradas e parcelas pagas)
    select a.id, a.grupo, coalesce(sum(coalesce(p.paid_amount, p.amount)) filter (where p.status = 'pago'), 0) recebido
    from a left join crediario_parcelas p on p.crediario_id = a.crediario_novo_id group by 1, 2),
  -- Retorno da cobranca de atraso: dos clientes que receberam a cobranca de atraso (30+ dias), quantos pagaram
  -- alguma parcela DEPOIS da mensagem. Ultimos 90 dias. Mesma conta para as outras oticas (somadas).
  cob as (
    select l.tenant_id, l.customer_id, min(l.sent_at) enviado
    from whatsapp_triggers_log l
    where l.trigger_type = 'cobranca_atraso' and l.success and l.customer_id is not null and l.sent_at > now() - interval '90 days'
      and l.tenant_id <> 'de0e0000-0000-4000-8000-0000000000d1'
    group by 1, 2),
  ret as (
    select (c.tenant_id = p_tenant) minha, count(*) cobrados,
      count(*) filter (where exists (select 1 from crediario_parcelas p join crediario cr on cr.id = p.crediario_id
                                     where cr.customer_id = c.customer_id and p.status = 'pago' and p.paid_at > c.enviado)) pagaram
    from cob c group by 1)
  select jsonb_build_object(
    'ofertas', (select count(*) from a where grupo is not null or ofertado_em >= '2026-11-11'),
    'nao_entregues', (select count(*) from a where status = 'cancelado' and obs like 'oferta nao entregue%'),
    'esperando_escolha', (select count(*) from a where status in ('ofertado', 'escolhendo')),
    'esperando_pix', (select count(*) from a where status = 'aguardando_pagamento'),
    'fechados', (select count(*) from a where status = 'fechado'),
    'fechados_tipo', (select coalesce(jsonb_object_agg(tipo, n), '{}'::jsonb) from (select tipo, count(*) n from a where status = 'fechado' group by 1) x),
    'valor_acordos', (select coalesce(sum(valor_acordo), 0) from a where status = 'fechado'),
    'divida_negociada', (select coalesce(sum(valor_original + coalesce(valor_juros, 0)), 0) from a where status = 'fechado'),
    'recebido', (select coalesce(sum(recebido), 0) from rec),
    'por_grupo', (select coalesce(jsonb_agg(jsonb_build_object('grupo', g, 'ofertas', o, 'fechados', f, 'recebido', r) order by g), '[]'::jsonb)
                  from (select coalesce(a.grupo, 'Sem grupo') g, count(*) o, count(*) filter (where a.status = 'fechado') f,
                               coalesce(sum(rec.recebido), 0) r
                        from a left join rec on rec.id = a.id group by 1) x),
    'retorno', (select jsonb_build_object('cobrados', coalesce(max(cobrados) filter (where minha), 0), 'pagaram', coalesce(max(pagaram) filter (where minha), 0),
                                          'cobrados_outras', coalesce(max(cobrados) filter (where not minha), 0), 'pagaram_outras', coalesce(max(pagaram) filter (where not minha), 0))
                from ret)
  ) into res;
  return res;
end $$;
revoke all on function cobranca_painel_feirao(uuid) from public, anon;
grant execute on function cobranca_painel_feirao(uuid) to authenticated, service_role;

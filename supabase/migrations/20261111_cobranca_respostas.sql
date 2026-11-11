-- Cobranca nova - Fase 1, etapa 3 (11/11/2026): ROBO QUE ENTENDE RESPOSTAS (so lojas com tenants.cobranca_nova).
-- O webhook do WhatsApp oficial classifica cada resposta do cliente e grava aqui. A tela Credario mostra a lista
-- (PAGUEI a confirmar, quer acordo, falar com a loja, nao consegue pagar, pediu para parar).
create table if not exists cobranca_respostas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  customer_id uuid references customers(id),
  phone text not null,
  nome text,
  intencao text not null check (intencao in ('paguei', 'pagar_vista', 'parcelar', 'falar_loja', 'nao_consigo', 'parar')),
  texto text,
  meta_message_id text unique,
  -- pendente: esperando a loja; confirmado: loja deu baixa/resolveu; nao_pago: PAGUEI conferido e nao tinha pago
  status text not null default 'pendente' check (status in ('pendente', 'confirmado', 'nao_pago', 'resolvido')),
  resposta_auto text,                -- texto que o robo respondeu ao cliente (se respondeu)
  created_at timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por text
);
create index if not exists cobranca_respostas_tenant_status on cobranca_respostas (tenant_id, status, created_at desc);
create index if not exists cobranca_respostas_cliente on cobranca_respostas (customer_id, status);

alter table cobranca_respostas enable row level security;
drop policy if exists cobranca_respostas_select on cobranca_respostas;
create policy cobranca_respostas_select on cobranca_respostas for select using (tenant_id = get_tenant_id());
drop policy if exists cobranca_respostas_update on cobranca_respostas;
create policy cobranca_respostas_update on cobranca_respostas for update using (tenant_id = get_tenant_id());
-- insert so pelo servidor (webhook com service role).

-- Resposta automatica ao cliente (confirmacao do PAGUEI, PARAR etc.). Separado do interruptor da cobranca nova:
-- a classificacao e a lista ligam com cobranca_nova; responder sozinho ao cliente so com este ligado.
alter table tenants add column if not exists cobranca_resposta_auto boolean not null default false;

-- Vigia: "PAGUEI" esperando a loja conferir ha mais de 2 dias (lista por loja). Usado pela Edge Function vigia-cobranca.
create or replace function public.vigia_paguei_parados()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('tenant_id', tenant_id, 'loja', loja, 'qtd', qtd, 'nomes', nomes)), '[]'::jsonb)
  from (select r.tenant_id, t.company_name loja, count(*) qtd, string_agg(coalesce(r.nome, r.phone), ', ' order by r.created_at) nomes
        from cobranca_respostas r join tenants t on t.id = r.tenant_id
        where r.intencao = 'paguei' and r.status = 'pendente' and r.created_at < now() - interval '2 days'
        group by 1, 2) x;
$$;
revoke all on function public.vigia_paguei_parados() from public, anon, authenticated;
grant execute on function public.vigia_paguei_parados() to service_role;

-- Caixa de mensagens do WhatsApp oficial (Meta): respostas dos clientes
-- (recebidas pelo webhook) e respostas da loja enviadas pela tela Mensagens.
create table if not exists whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone text not null,                 -- so digitos, com 55 (ex.: 5592999998888)
  nome_contato text,                   -- nome do perfil do WhatsApp do cliente
  direcao text not null check (direcao in ('in','out')),
  tipo text not null default 'text',   -- text | image | audio | document | button | ...
  texto text,
  meta_message_id text unique,
  status text,                         -- out: sent | delivered | read | failed
  erro text,
  lida boolean not null default false, -- in: a loja ja viu?
  enviado_por text,                    -- out: nome de quem respondeu
  created_at timestamptz not null default now()
);
create index if not exists idx_wa_msg_tenant_phone on whatsapp_mensagens (tenant_id, phone, created_at desc);
create index if not exists idx_wa_msg_nao_lidas on whatsapp_mensagens (tenant_id) where direcao = 'in' and lida = false;

alter table whatsapp_mensagens enable row level security;
drop policy if exists wa_msg_select on whatsapp_mensagens;
create policy wa_msg_select on whatsapp_mensagens for select using ((tenant_id = get_tenant_id()) or is_system_admin());
drop policy if exists wa_msg_update on whatsapp_mensagens;
create policy wa_msg_update on whatsapp_mensagens for update using ((tenant_id = get_tenant_id()) or is_system_admin())
  with check ((tenant_id = get_tenant_id()) or is_system_admin());
-- insert: so pelo servidor (webhook / whatsapp-manage, com a service role).

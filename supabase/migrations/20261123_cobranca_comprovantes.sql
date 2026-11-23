-- Comprovantes da tela "Respostas da cobrança" / Acordos do Feirão (23/11/2026, pedido do Carlos: o cliente manda a
-- imagem do pagamento e a loja não conseguia ver ali).
--   whatsapp: cópia da imagem/PDF recebida no WhatsApp (a Meta só guarda o arquivo por cerca de 30 dias);
--   anexo:    comprovante que a loja anexou (chegou pelo balcão ou por outro WhatsApp).
-- Só guarda e mostra: NÃO dá baixa nem fecha acordo. Quem confirma é a loja, em "Pagamento recebido" / "Já dei baixa".
-- O bucket é PRIVADO (comprovante tem dado bancário): cada loja só acessa a própria pasta (<tenant_id>/arquivo).

create table if not exists cobranca_comprovantes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid,
  phone text,
  acordo_id uuid references cobranca_acordos(id) on delete set null,
  mensagem_id uuid references whatsapp_mensagens(id) on delete set null,
  origem text not null check (origem in ('whatsapp', 'anexo')),
  storage_path text not null,
  mime text not null,
  nome_arquivo text,
  enviado_por text,
  recebido_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, mensagem_id),
  unique (storage_path)
);
create index if not exists idx_cobranca_comprovantes_tenant on cobranca_comprovantes (tenant_id, recebido_em desc);

alter table cobranca_comprovantes enable row level security;
drop policy if exists cobranca_comprovantes_all on cobranca_comprovantes;
create policy cobranca_comprovantes_all on cobranca_comprovantes for all to authenticated
  using (tenant_id = get_tenant_id() or is_system_admin())
  with check (tenant_id = get_tenant_id() or is_system_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cobranca-comprovantes', 'cobranca-comprovantes', false, 12582912,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cobranca_comprovantes_ler on storage.objects;
create policy cobranca_comprovantes_ler on storage.objects for select to authenticated
  using (bucket_id = 'cobranca-comprovantes' and ((storage.foldername(name))[1] = get_tenant_id()::text or is_system_admin()));
drop policy if exists cobranca_comprovantes_gravar on storage.objects;
create policy cobranca_comprovantes_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'cobranca-comprovantes' and ((storage.foldername(name))[1] = get_tenant_id()::text or is_system_admin()));
drop policy if exists cobranca_comprovantes_apagar on storage.objects;
create policy cobranca_comprovantes_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'cobranca-comprovantes' and ((storage.foldername(name))[1] = get_tenant_id()::text or is_system_admin()));

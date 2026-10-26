-- 26/10/2026 (Fase 5 do visual novo): abertura e fechamento do caixa por dia.
-- Os valores do dia vêm de financial_transactions (pagos no dia); aqui fica só o que a loja informa:
-- troco inicial, dinheiro contado na gaveta e o resultado do fechamento.
create table if not exists caixa_dia (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  data date not null,
  troco_inicial numeric not null default 0,
  dinheiro_esperado numeric,
  dinheiro_contado numeric,
  diferenca numeric,
  total_entradas numeric,
  total_saidas numeric,
  obs text,
  aberto_por text,
  fechado_por text,
  fechado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, data)
);
alter table caixa_dia enable row level security;
drop policy if exists caixa_dia_all on caixa_dia;
create policy caixa_dia_all on caixa_dia for all using (tenant_id = get_tenant_id()) with check (tenant_id = get_tenant_id());

-- 26/10/2026 (caso Tamiris, Otica do Povo): o gatilho de auditoria das exclusoes (log_delete_audit) grava em audit_log,
-- que tem RLS so com politica de SELECT. Rodando com o usuario do sistema, o INSERT era recusado e a EXCLUSAO INTEIRA
-- falhava - ex.: excluir venda no crediario apagava as parcelas mas deixava o carne vazio para tras (em silencio).
-- Agora o gatilho grava com a permissao do dono da funcao (SECURITY DEFINER), sem abrir o audit_log para os usuarios.
create or replace function log_delete_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (tenant_id, action, table_name, records_affected, performed_by)
  values (OLD.tenant_id, 'DELETE', TG_TABLE_NAME, 1, coalesce(auth.uid()::text, current_user));
  return OLD;
end;
$$;

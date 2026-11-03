-- 03/11/2026: retorno_exame, aviso_negativacao e negociacao_debito_antigo nao estavam na lista permitida, entao o
-- registro do envio falhava e o robo mandava a mesma mensagem a cada 15 min (ver logTrigger em send-whatsapp-triggers).
alter table whatsapp_triggers_log drop constraint if exists whatsapp_triggers_log_trigger_type_check;
alter table whatsapp_triggers_log add constraint whatsapp_triggers_log_trigger_type_check check (trigger_type = any (array[
  'aniversario', 'vencimento', 'pos_venda', 'adaptacao', 'vencimento_dia', 'vencimento_atraso5',
  'cobranca_atraso', 'cobranca_manual', 'cobranca_manual_local',
  'retorno_exame', 'aviso_negativacao', 'negociacao_debito_antigo'
]::text[]));

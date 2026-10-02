-- Numero (WhatsApp) que recebe o aviso "chegou mensagem de cliente" da tela
-- Mensagens. O aviso sai pelo WhatsApp da loja conectado por QR Code (Evolution).
alter table store_settings add column if not exists wa_alerta_numero text;

-- Midia das mensagens recebidas (audio, imagem...): guarda o id da midia na Meta
-- para a tela Mensagens poder tocar/abrir (a Meta mantem a midia por ~30 dias).
alter table whatsapp_mensagens add column if not exists media_id text;
alter table whatsapp_mensagens add column if not exists media_mime text;

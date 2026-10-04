-- Integracao OptiFlow -> Centofin (MEI / Empresas): a loja cola a chave gerada no Centofin.
alter table store_settings add column if not exists centofin_ativo boolean default false;
alter table store_settings add column if not exists centofin_chave text;
alter table store_settings add column if not exists centofin_desde date;
alter table store_settings add column if not exists centofin_url text default 'https://mei.centofin.com.br';
alter table store_settings add column if not exists centofin_ultimo_envio timestamptz;
alter table store_settings add column if not exists centofin_ultimo_status text;

-- Cadastro pergunta "Otica ou Consultorio" e a conta ja nasce com o menu certo (21/11/2026).
-- Otica: menu curto (visual_novo). Consultorio: so as telas de consulta (modulo_otica_ativo = false).
-- Sem tipo_negocio (cadastro antigo) fica exatamente como antes. Nao altera nenhuma conta existente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_tenant_id uuid;
  tipo text := NEW.raw_user_meta_data->>'tipo_negocio';
BEGIN
  -- Criar tenant
  INSERT INTO public.tenants (company_name, email, plan, status, trial_end_date, visual_novo, modulo_otica_ativo)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'company_name', NEW.raw_user_meta_data->>'full_name', 'Minha Ótica'),
    NEW.email,
    'trial',
    'trial',
    (NOW() + INTERVAL '14 days')::date,
    tipo IS NOT DISTINCT FROM 'otica',
    tipo IS DISTINCT FROM 'consultorio'
  )
  RETURNING id INTO new_tenant_id;

  -- Criar store_settings
  INSERT INTO public.store_settings (tenant_id, name)
  VALUES (new_tenant_id, COALESCE(NEW.raw_user_meta_data->>'company_name', 'Minha Ótica'));

  -- Criar user_profiles
  INSERT INTO public.user_profiles (id, tenant_id, full_name, email, role)
  VALUES (
    NEW.id,
    new_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'),
    NEW.email,
    'master'
  );

  RETURN NEW;
END;
$function$;

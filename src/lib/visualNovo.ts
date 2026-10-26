import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Visual novo (tenants.visual_novo): ligado por loja no Painel Admin para testar as telas
// reorganizadas antes de liberar para todas (26/10/2026 - primeiro so na Castanho).
// O Shell guarda o ultimo valor no localStorage; aqui confirmamos no banco.
export function useVisualNovo(tenantId?: string | null): boolean {
  const [ativo, setAtivo] = useState<boolean>(() => {
    try { return localStorage.getItem('optiflow_visual_novo') === '1'; } catch { return false; }
  });
  useEffect(() => {
    if (!tenantId) return;
    supabase.from('tenants').select('visual_novo').eq('id', tenantId).maybeSingle()
      .then(({ data }) => setAtivo((data as any)?.visual_novo === true));
  }, [tenantId]);
  return ativo;
}

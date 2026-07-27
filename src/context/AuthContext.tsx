import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types/index';

interface AuthCtx {
  user: UserProfile | null;
  tenantId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, company?: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error('useAuth'); return c; };
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'carlosevideo28@gmail.com';
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileLoadedRef = React.useRef(false);

  const loadProfile = async (uid: string, email?: string) => {
    if (profileLoadedRef.current) return;
    profileLoadedRef.current = true;
    // Admin also loads profile to get tenant_id
    try {
      const { data } = await supabase.from('user_profiles').select('*').eq('id', uid).maybeSingle();
      if (data && data.tenant_id) {
        setUser(data as UserProfile);
        // Verificar status do plano
        const { data: tenant } = await supabase.from('tenants').select('plan,status,trial_end_date').eq('id', data.tenant_id).maybeSingle();
        if (tenant) {
          const expired = tenant.status === 'trial' && tenant.plan === 'trial' && tenant.trial_end_date && new Date(tenant.trial_end_date) < new Date();
          const cancelled = tenant.status === 'cancelado' || tenant.plan === 'cancelado';
          if (expired || cancelled) {
            window.location.href = '/trial-expirado';
            return;
          }
        }
      } else {
        await supabase.auth.signOut();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user.id, session.user.email);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { profileLoadedRef.current = false; setUser(null); setLoading(false); }
      else if (event === 'SIGNED_IN' && session?.user) loadProfile(session.user.id, session.user.email);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const key = `login_attempts_${email}`;
    const attemptsData = JSON.parse(localStorage.getItem(key) || '{"count":0,"time":0}');
    const now = Date.now();
    if (attemptsData.count >= 5 && (now - attemptsData.time) < 15 * 60 * 1000) {
      const mins = Math.ceil((15 * 60 * 1000 - (now - attemptsData.time)) / 60000);
      throw new Error(`Muitas tentativas. Aguarde ${mins} minuto(s) para tentar novamente.`);
    }
    if ((now - attemptsData.time) >= 15 * 60 * 1000) {
      localStorage.setItem(key, JSON.stringify({count: 0, time: now}));
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (uid) {
        const { data: profile } = await supabase.from('user_profiles').select('id, tenant_id').eq('id', uid).maybeSingle();
        if (!profile || !profile.tenant_id) {
          await supabase.auth.signOut();
          throw new Error('Conta sem acesso ao sistema. Use o painel administrativo.');
        }
      }
    }
    if (error) {
      // Tentar login como funcionario.
      // IMPORTANTE: não consulta `funcionarios` direto — o RLS dessa
      // tabela exige auth.uid() (sessão já autenticada) pra resolver
      // get_tenant_id(), mas aqui ainda NÃO existe sessão. Por isso a
      // verificação roda dentro de uma função SECURITY DEFINER
      // (verify_funcionario_login), que ignora RLS internamente e
      // nunca devolve o hash da senha pro navegador.
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedInput = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      let { data: funcRows } = await supabase.rpc('verify_funcionario_login', {
        p_email: email.trim(),
        p_password_hash: hashedInput,
      });
      let func = funcRows?.[0];

      // Fallback: contas antigas que ainda não passaram pelo hash (senha em texto puro)
      if (!func) {
        const { data: funcRowsPlain } = await supabase.rpc('verify_funcionario_login', {
          p_email: email.trim(),
          p_password_hash: password,
        });
        func = funcRowsPlain?.[0];
      }

      if (!func) throw error;
      // Buscar dados da loja
      const { data: store } = await supabase
        .from('tenants')
        .select('company_name')
        .eq('id', func.tenant_id)
        .maybeSingle();
      const storeName = store?.company_name || 'OptiFlow';
      localStorage.setItem('func_session', JSON.stringify({
        id: func.id,
        name: func.name,
        email: func.email,
        cargo: func.cargo,
        tenant_id: func.tenant_id,
        store_name: storeName,
        isFuncionario: true,
        loginAt: new Date().toISOString()
      }));
      setUser({ id: func.id, full_name: func.name, email: func.email, tenant_id: func.tenant_id, role: func.cargo || 'operator', store_name: storeName } as any); setLoading(false);
      return;
    }
  };
  const signUp = async (email: string, password: string, name: string, company?: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name, company_name: company || name, role: 'master' } } });
    if (error) throw error;
  };
  const signOut = async () => { await supabase.auth.signOut(); setUser(null); };

  const adminViewingTenant = user?.role === 'system_admin' ? localStorage.getItem('admin_viewing_tenant') : null;
  if (user && user.role !== 'system_admin') localStorage.removeItem('admin_viewing_tenant');
  const effectiveTenantId = adminViewingTenant || user?.tenant_id || null;

  return (
    <Ctx.Provider value={{ user, tenantId: effectiveTenantId, loading, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

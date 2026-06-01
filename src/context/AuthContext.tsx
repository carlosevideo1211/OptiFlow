import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types/index';
interface AuthCtx {
  user: UserProfile | null;
  tenantId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error('useAuth'); return c; };
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'carlosevideo28@gmail.com';
let profileLoaded = false;
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string, email?: string) => {
    if (profileLoaded) return;
    profileLoaded = true;
    if (email === ADMIN_EMAIL) { setLoading(false); return; }
    try {
      const { data } = await supabase.from('user_profiles').select('*').eq('id', uid).maybeSingle();
      if (data) {
        // Se perfil nao tem tenant_id, buscar pelo email na tabela tenants
        if (!data.tenant_id && email) {
          const { data: tenant } = await supabase
            .from('tenants')
            .select('id, company_name')
            .eq('email', email)
            .maybeSingle();
          if (tenant?.id) {
            // Vincular tenant ao perfil
            await supabase.from('user_profiles')
              .update({ tenant_id: tenant.id, full_name: data.full_name || email })
              .eq('id', uid);
            setUser({ ...data, tenant_id: tenant.id } as UserProfile);
          } else {
            setUser(data as UserProfile);
          }
        } else {
          setUser(data as UserProfile);
        }
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
      if (event === 'SIGNED_OUT') { profileLoaded = false; setUser(null); setLoading(false); }
      else if (event === 'SIGNED_IN' && session?.user) loadProfile(session.user.id, session.user.email);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    profileLoaded = false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Tentar login como funcionario
      const { data: func } = await supabase
        .from('funcionarios')
        .select('id, name, email, cargo, access_password, tenant_id, active')
        .ilike('email', email.trim())
        .eq('active', true)
        .single();
      if (!func) throw error;
      if (func.access_password !== password) throw error;
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
  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name, role: 'master' } } });
    if (error) throw error;
  };
  const signOut = async () => { profileLoaded = false; await supabase.auth.signOut(); setUser(null); };

  return (
    <Ctx.Provider value={{ user, tenantId: user?.tenant_id || null, loading, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

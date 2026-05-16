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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string, email?: string) => {
    console.log('[Auth] loadProfile chamado para:', email);
    if (email && email === ADMIN_EMAIL) {
      console.log('[Auth] Admin detectado, pulando perfil');
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      console.log('[Auth] Perfil carregado:', data?.full_name, 'erro:', error?.message);
      if (data && !error) {
        setUser(data as UserProfile);
      }
    } catch(e) {
      console.log('[Auth] Erro ao carregar perfil:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[Auth] useEffect iniciado');
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[Auth] getSession:', session?.user?.email);
      if (session?.user) loadProfile(session.user.id, session.user.email);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] onAuthStateChange:', event, session?.user?.email);
      if (session?.user) loadProfile(session.user.id, session.user.email);
      else { setUser(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] signIn chamado para:', email);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    console.log('[Auth] signIn sucesso');
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, role: 'master' } }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, tenantId: user?.tenant_id || null, loading, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
// force redeploy 05/16/2026 11:31:22

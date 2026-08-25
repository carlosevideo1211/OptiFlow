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
  const profileLoadPromiseRef = React.useRef<Promise<boolean> | null>(null);
  const loadProfile = async (uid: string, email?: string): Promise<boolean> => {
    if (profileLoadPromiseRef.current) return profileLoadPromiseRef.current;
    const promise = (async (): Promise<boolean> => {
      try {
        const { data } = await supabase.from('user_profiles').select('*').eq('id', uid).maybeSingle();
        if (data && data.tenant_id) {
          setUser(data as UserProfile);
          const { data: tenant } = await supabase.from('tenants').select('plan,status,trial_end_date').eq('id', data.tenant_id).maybeSingle();
          if (tenant) {
            const expired = tenant.status === 'trial' && tenant.plan === 'trial' && tenant.trial_end_date && new Date(tenant.trial_end_date) < new Date();
            const cancelled = tenant.status === 'cancelado' || tenant.plan === 'cancelado';
            // Manda pra /planos (Pix Automatico via Asaas), nao mais pro paywall
            // antigo /trial-expirado (planos Stripe descontinuados). So forca a
            // navegacao se o usuario ainda nao estiver la, senao gera reload em
            // loop toda vez que essa checagem roda de novo.
            if ((expired || cancelled) && window.location.pathname !== '/planos') {
              window.location.href = '/planos';
              return false;
            }
          }
          return true;
        } else {
          await supabase.auth.signOut();
          setUser(null);
          return false;
        }
      } finally {
        setLoading(false);
      }
    })();
    profileLoadPromiseRef.current = promise;
    return promise;
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user.id, session.user.email);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { profileLoadPromiseRef.current = null; setUser(null); setLoading(false); }
      else if (event === 'SIGNED_IN' && session?.user) loadProfile(session.user.id, session.user.email);
    });
    return () => subscription.unsubscribe();
  }, []);
  const signIn = async (email: string, password: string) => {
    const key = `login_attempts_${email}`;    const attemptsData = JSON.parse(localStorage.getItem(key) || '{"count":0,"time":0}');
    const now = Date.now();
    if (attemptsData.count >= 5 && (now -attemptsData.time) < 15 * 60 * 1000) {
      const mins = Math.ceil((15 * 60 * 1000 - (now - attemptsData.time)) / 60000);
      throw new Error(`Muitas tentativas.Aguarde ${mins} minuto(s) para tentar novamente.`);
    }
    if ((now - attemptsData.time) >= 15 *60 * 1000) {
      localStorage.setItem(key, JSON.stringify({count: 0, time: now}));
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (uid) {
        const ok = await loadProfile(uid, email);
        if (!ok) {
          throw new Error('Conta sem acesso ao sistema. Use o painel administrativo.');
        }
      }
    }
    if (error) {
      // Login como funcionário.
      // Desde a Fase A do item 6: a senha continua validada pela mesma
      // função SECURITY DEFINER de sempre (verify_funcionario_login,
      // inalterada), mas agora, se validar, o funcionário ganha uma
      // sessão Supabase de verdade (login anônimo) vinculada a ele via
      // token de uso único. Isso resolvede raiz o fato de auth.uid() e
      // get_tenant_id() não funcionarem pra funcionário — sem precisar
      // mudar nenhuma política RLS existente no sistema.
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedInput = hashArray.map(b=> b.toString(16).padStart(2, "0")).join("");
      let { data: token } = await supabase.rpc('issue_funcionario_login_token', {
        p_email: email.trim(),
        p_password_hash: hashedInput,
      });
      // Fallback: contas antigas que ainda não passaram pelo hash (senha em texto puro)
      if (!token) {
        const { data: tokenPlain } = await supabase.rpc('issue_funcionario_login_token', {
          p_email: email.trim(),
          p_password_hash: password,
        });
        token = tokenPlain;
      }
      if (!token) throw error;
      // Trava o auto-load do listener onAuthStateChange: sem isso, ele
      // pode tentar carregar o perfil ANTES de claim_funcionario_session
      // terminar de criá-lo, e deslogaria por engano (corrida de estado).
      profileLoadPromiseRef.current = Promise.resolve(true);
      const { error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) { profileLoadPromiseRef.current = null; throw anonErr; }
      const { data: claimRows, error: claimErr } = await supabase.rpc('claim_funcionario_session', { p_token: token });
      if (claimErr || !claimRows?.[0]) {
        await supabase.auth.signOut();
        profileLoadPromiseRef.current = null;
        throw claimErr || new Error('Falha ao iniciar sessão do funcionário');
      }
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) {
        await supabase.auth.signOut();
        profileLoadPromiseRef.current = null;
        throw new Error('Sessão do funcionário não encontrada');
      }
      profileLoadPromiseRef.current = null;
      await loadProfile(uid);
      return;
    }
  };
  const signUp = async (email: string, password: string, name: string, company?: string) => {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name, company_name: company|| name, role: 'master' } } });
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
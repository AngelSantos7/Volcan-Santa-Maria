import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  AuthContext,
  type AuthContextValue,
  type SignUpCredentials,
  type SignUpResult,
} from './auth-context';
import { getAuthRedirectUrl } from './auth-redirect';

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }
      setLoading(false);
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) throw error;

        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .catch(() => {
        if (!isMounted) return;

        setSession(null);
        setUser(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(
    async ({
      firstName,
      lastName,
      email,
      password,
      captchaToken,
    }: SignUpCredentials): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: firstName, last_name: lastName },
          emailRedirectTo: getAuthRedirectUrl(),
          captchaToken,
        },
      });

      if (error) throw error;

      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
      }

      return {
        requiresEmailConfirmation: data.session === null,
        email,
      };
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    setSession(data.session);
    setUser(data.user);
  }, []);

  const resendSignUpEmail = useCallback(
    async (email: string, captchaToken?: string) => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
          captchaToken,
        },
      });

      if (error) throw error;
    },
    []
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl(),
    });

    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) throw error;
  }, []);

  const completePasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    setSession(null);
    setUser(null);
    setIsPasswordRecovery(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      isEmailVerified: Boolean(user?.email_confirmed_at),
      isPasswordRecovery,
      signUp,
      signIn,
      resendSignUpEmail,
      requestPasswordReset,
      updatePassword,
      completePasswordRecovery,
      signOut,
    }),
    [
      user,
      session,
      loading,
      isPasswordRecovery,
      signUp,
      signIn,
      resendSignUpEmail,
      requestPasswordReset,
      updatePassword,
      completePasswordRecovery,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

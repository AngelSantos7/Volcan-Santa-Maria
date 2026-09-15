import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import {
  AuthContext,
  type AuthContextValue,
  type SignUpResult,
} from './auth-context'

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return

      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return
        if (error) throw error

        setSession(data.session)
        setUser(data.session?.user ?? null)
      })
      .catch(() => {
        if (!isMounted) return

        setSession(null)
        setUser(null)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(
    async (
      firstName: string,
      lastName: string,
      email: string,
      password: string,
    ): Promise<SignUpResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name: firstName, last_name: lastName } },
      })

      if (error) throw error

      if (data.session) {
        setSession(data.session)
        setUser(data.session.user)
      }

      return { requiresEmailConfirmation: data.session === null }
    },
    [],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    setSession(data.session)
    setUser(data.user)
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()

    if (error) throw error

    setSession(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signUp, signIn, signOut }),
    [user, session, loading, signUp, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

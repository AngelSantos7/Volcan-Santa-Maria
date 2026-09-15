import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type SignUpResult = {
  requiresEmailConfirmation: boolean
}

export type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  signUp: (
    firstName: string,
    lastName: string,
    email: string,
    password: string,
  ) => Promise<SignUpResult>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)

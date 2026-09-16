import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type SignUpCredentials = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  captchaToken?: string;
};

export type SignUpResult = {
  requiresEmailConfirmation: boolean;
  email: string;
};

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isEmailVerified: boolean;
  isPasswordRecovery: boolean;
  signUp: (credentials: SignUpCredentials) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<void>;
  resendSignUpEmail: (email: string, captchaToken?: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  completePasswordRecovery: () => void;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

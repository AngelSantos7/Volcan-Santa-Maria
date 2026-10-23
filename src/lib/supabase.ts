import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl) {
  throw new Error(
    'Missing required environment variable: VITE_SUPABASE_URL',
  )
}

if (!supabasePublishableKey) {
  throw new Error(
    'Missing required environment variable: VITE_SUPABASE_PUBLISHABLE_KEY',
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)

// Isolated, memory-only session for verifying the account's current password.
export const createPasswordVerificationClient = () => createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'password-verification' },
});

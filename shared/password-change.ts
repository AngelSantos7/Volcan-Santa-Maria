import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidPassword } from './account-policy.ts';

/** Verify with Auth without replacing the application's session or identity. */
export async function changeOwnPassword(
  client: SupabaseClient,
  createVerifier: () => SupabaseClient,
  currentPassword: string,
  password: string
): Promise<void> {
  if (!isValidPassword(password)) throw new Error('password_policy');
  if (!currentPassword) throw new Error('current_password_incorrect');
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user?.email) throw new Error('authentication_required');
  const verifier = createVerifier();
  let verified = false;
  try {
    const result = await verifier.auth.signInWithPassword({
      email: data.user.email,
      password: currentPassword,
    });
    if (result.error) {
      if (result.error.code === 'invalid_credentials')
        throw new Error('current_password_incorrect');
      throw result.error;
    }
    verified = true;
    if (result.data.user?.id !== data.user.id)
      throw new Error('authentication_required');
    const update = await verifier.auth.updateUser({
      password,
      current_password: currentPassword,
    });
    if (update.error) throw update.error;
  } finally {
    // Revoke only this temporary session. Never touch the main session/role.
    if (verified)
      await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined);
    await verifier.auth.dispose();
  }
}

import { supabase } from '../../lib/supabase';

export const TERMS_VERSION = '1.0';
export const PRIVACY_VERSION = '1.0';

export async function hasCurrentLegalConsent(): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_my_consent_status', {
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
  });
  if (error) throw error;
  return data === true;
}

export async function acceptCurrentLegalDocuments(): Promise<void> {
  const { error } = await supabase.rpc('accept_current_legal_documents', {
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
  });
  if (error) throw error;
}

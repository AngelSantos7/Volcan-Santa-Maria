import { supabase } from '../../lib/supabase'
import type { DocumentType, TouristProfileData } from './profile-types'

type ProfileRow = {
  nationality_country_code: string | null
  date_of_birth: string | null
  phone: string | null
  document_type: DocumentType | null
  document_number: string | null
}

type EmergencyContactRow = {
  id: string
  first_name: string
  last_name: string
  relationship: string
  phone: string
}

export async function loadTouristProfile(
  userId: string,
): Promise<TouristProfileData> {
  const [profileResult, emergencyContactResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'nationality_country_code, date_of_birth, phone, document_type, document_number',
      )
      .eq('id', userId)
      .maybeSingle<ProfileRow>(),
    supabase
      .from('emergency_contacts')
      .select('id, first_name, last_name, relationship, phone')
      .eq('user_id', userId)
      .maybeSingle<EmergencyContactRow>(),
  ])

  if (profileResult.error) throw profileResult.error
  if (emergencyContactResult.error) throw emergencyContactResult.error
  if (!profileResult.data) throw new Error('Profile row not found')

  const profile = profileResult.data
  const contact = emergencyContactResult.data

  return {
    nationalityCountryCode: profile.nationality_country_code ?? '',
    dateOfBirth: profile.date_of_birth ?? '',
    phone: profile.phone ?? '',
    documentType: profile.document_type ?? '',
    documentNumber: profile.document_number ?? '',
    emergencyContactId: contact?.id ?? null,
    emergencyFirstName: contact?.first_name ?? '',
    emergencyLastName: contact?.last_name ?? '',
    emergencyRelationship: contact?.relationship ?? '',
    emergencyPhone: contact?.phone ?? '',
  }
}

export async function saveTouristProfile(
  userId: string,
  profile: TouristProfileData,
): Promise<TouristProfileData> {
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      nationality_country_code: profile.nationalityCountryCode,
      date_of_birth: profile.dateOfBirth,
      phone: profile.phone,
      document_type: profile.documentType,
      document_number: profile.documentNumber,
    })
    .eq('id', userId)
    .select('id')
    .single()

  if (profileError) throw profileError

  const contactValues = {
    first_name: profile.emergencyFirstName,
    last_name: profile.emergencyLastName,
    relationship: profile.emergencyRelationship,
    phone: profile.emergencyPhone,
  }

  if (profile.emergencyContactId) {
    const { error } = await supabase
      .from('emergency_contacts')
      .update(contactValues)
      .eq('id', profile.emergencyContactId)
      .eq('user_id', userId)
      .select('id')
      .single()

    if (error) throw error

    return profile
  }

  const { data, error } = await supabase
    .from('emergency_contacts')
    .insert({ user_id: userId, ...contactValues })
    .select('id')
    .single<{ id: string }>()

  if (error) throw error

  return { ...profile, emergencyContactId: data.id }
}

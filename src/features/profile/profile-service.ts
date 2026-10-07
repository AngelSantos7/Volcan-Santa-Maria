import { supabase } from '../../lib/supabase';
import type {
  AvatarKind,
  AvatarPreset,
  DocumentType,
  TouristProfileData,
} from './profile-types';

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  avatar_kind: AvatarKind | null;
  avatar_path: string | null;
  avatar_preset: AvatarPreset | null;
  nationality_country_code: string | null;
  department_code: string | null;
  sex: 'male' | 'female' | null;
  date_of_birth: string | null;
  phone: string | null;
  document_type: DocumentType | null;
  document_number: string | null;
};

type EmergencyContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
};

export async function loadTouristProfile(
  userId: string
): Promise<TouristProfileData> {
  const [profileResult, emergencyContactResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'first_name, last_name, avatar_kind, avatar_path, avatar_preset, nationality_country_code, department_code, sex, date_of_birth, phone, document_type, document_number'
      )
      .eq('id', userId)
      .maybeSingle<ProfileRow>(),
    supabase
      .from('emergency_contacts')
      .select('id, first_name, last_name, relationship, phone')
      .eq('user_id', userId)
      .maybeSingle<EmergencyContactRow>(),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (emergencyContactResult.error) throw emergencyContactResult.error;
  if (!profileResult.data) throw new Error('Profile row not found');

  const profile = profileResult.data;
  const contact = emergencyContactResult.data;
  let avatarUrl: string | null = null;

  if (profile.avatar_path) {
    const { data } = await supabase.storage
      .from('avatars')
      .createSignedUrl(profile.avatar_path, 60 * 60);
    avatarUrl = data?.signedUrl ?? null;
  }

  return {
    firstName: profile.first_name ?? '',
    lastName: profile.last_name ?? '',
    avatarKind: profile.avatar_kind,
    avatarPath: profile.avatar_path,
    avatarPreset: profile.avatar_preset,
    avatarUrl,
    nationalityCountryCode: profile.nationality_country_code ?? '',
    departmentCode: profile.department_code ?? '',
    sex: profile.sex ?? '',
    dateOfBirth: profile.date_of_birth ?? '',
    phone: profile.phone ?? '',
    documentType: profile.document_type ?? '',
    documentNumber: profile.document_number ?? '',
    emergencyContactId: contact?.id ?? null,
    emergencyFirstName: contact?.first_name ?? '',
    emergencyLastName: contact?.last_name ?? '',
    emergencyRelationship: contact?.relationship ?? '',
    emergencyPhone: contact?.phone ?? '',
  };
}

export async function saveTouristProfile(
  userId: string,
  profile: TouristProfileData,
  uploadedAvatar?: Blob | null
): Promise<TouristProfileData> {
  const avatarPath =
    profile.avatarKind === 'uploaded' ? `${userId}/avatar.webp` : null;

  if (profile.avatarKind === 'uploaded' && uploadedAvatar) {
    const { error } = await supabase.storage
      .from('avatars')
      .upload(avatarPath!, uploadedAvatar, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: true,
      });
    if (error) throw error;
  }

  if (
    profile.avatarKind === 'uploaded' &&
    !uploadedAvatar &&
    !profile.avatarPath
  ) {
    throw new Error('An uploaded avatar is required.');
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      first_name: profile.firstName,
      last_name: profile.lastName,
      avatar_kind: profile.avatarKind,
      avatar_path: avatarPath,
      avatar_preset:
        profile.avatarKind === 'preset' ? profile.avatarPreset : null,
      nationality_country_code: profile.nationalityCountryCode,
      department_code:
        profile.nationalityCountryCode === 'GT' ? profile.departmentCode : null,
      sex: profile.sex,
      date_of_birth: profile.dateOfBirth,
      phone: profile.phone,
      document_type: profile.documentType,
      document_number: profile.documentNumber,
    })
    .eq('id', userId)
    .select('id')
    .single();

  if (profileError) throw profileError;

  if (profile.avatarKind !== 'uploaded' && profile.avatarPath) {
    await supabase.storage.from('avatars').remove([profile.avatarPath]);
  }

  let avatarUrl: string | null = null;
  if (avatarPath) {
    const { data } = await supabase.storage
      .from('avatars')
      .createSignedUrl(avatarPath, 60 * 60);
    avatarUrl = data?.signedUrl ?? null;
  }

  const contactValues = {
    first_name: profile.emergencyFirstName,
    last_name: profile.emergencyLastName,
    relationship: profile.emergencyRelationship,
    phone: profile.emergencyPhone,
  };

  if (profile.emergencyContactId) {
    const { error } = await supabase
      .from('emergency_contacts')
      .update(contactValues)
      .eq('id', profile.emergencyContactId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (error) throw error;

    return { ...profile, avatarPath, avatarUrl };
  }

  const { data, error } = await supabase
    .from('emergency_contacts')
    .insert({ user_id: userId, ...contactValues })
    .select('id')
    .single<{ id: string }>();

  if (error) throw error;

  return {
    ...profile,
    avatarPath,
    avatarUrl,
    emergencyContactId: data.id,
  };
}

export async function createAvatarSignedUrl(
  path: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

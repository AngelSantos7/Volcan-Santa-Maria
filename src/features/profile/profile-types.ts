export type DocumentType = 'dpi' | 'passport' | 'other'

export type TouristProfileData = {
  nationalityCountryCode: string
  dateOfBirth: string
  phone: string
  documentType: DocumentType | ''
  documentNumber: string
  emergencyContactId: string | null
  emergencyFirstName: string
  emergencyLastName: string
  emergencyRelationship: string
  emergencyPhone: string
}

const REQUIRED_FIELDS: Array<keyof TouristProfileData> = [
  'nationalityCountryCode',
  'dateOfBirth',
  'phone',
  'documentType',
  'documentNumber',
  'emergencyFirstName',
  'emergencyLastName',
  'emergencyRelationship',
  'emergencyPhone',
]

export function isTouristProfileComplete(profile: TouristProfileData): boolean {
  return REQUIRED_FIELDS.every((field) => profile[field]?.trim())
}

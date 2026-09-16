export type DocumentType = 'dpi' | 'passport' | 'other';

export type TouristProfileData = {
  nationalityCountryCode: string;
  dateOfBirth: string;
  phone: string;
  documentType: DocumentType | '';
  documentNumber: string;
  emergencyContactId: string | null;
  emergencyFirstName: string;
  emergencyLastName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
};

function toDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isTouristProfileComplete(profile: TouristProfileData): boolean {
  const documentNumber = profile.documentNumber.trim();
  const oldestAllowedDate = new Date();
  oldestAllowedDate.setFullYear(oldestAllowedDate.getFullYear() - 120);
  const dateOfBirth = new Date(`${profile.dateOfBirth}T00:00:00Z`);
  const parsedDateValue = Number.isNaN(dateOfBirth.getTime())
    ? ''
    : dateOfBirth.toISOString().slice(0, 10);

  return Boolean(
    /^[A-Z]{2}$/.test(profile.nationalityCountryCode) &&
    /^\+[1-9]\d{1,14}$/.test(profile.phone) &&
    ['dpi', 'passport', 'other'].includes(profile.documentType) &&
    documentNumber.length >= 3 &&
    documentNumber.length <= 40 &&
    /[\p{L}\p{N}]/u.test(documentNumber) &&
    profile.emergencyFirstName.trim() &&
    profile.emergencyLastName.trim() &&
    profile.emergencyRelationship.trim() &&
    /^\+[1-9]\d{1,14}$/.test(profile.emergencyPhone) &&
    /^\d{4}-\d{2}-\d{2}$/.test(profile.dateOfBirth) &&
    parsedDateValue === profile.dateOfBirth &&
    profile.dateOfBirth <= toDateValue(new Date()) &&
    profile.dateOfBirth >= toDateValue(oldestAllowedDate)
  );
}

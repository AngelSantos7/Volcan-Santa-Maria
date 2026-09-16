export type RegistrationField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'password'
  | 'confirmPassword'
  | 'captcha';

export type RegistrationValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PERSON_NAME_PATTERN =
  /^[\p{L}\p{M}]+(?:[ '\u2019\p{Pd}][\p{L}\p{M}]+)*$/u;
const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;

export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').normalize('NFC');
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function getCharacterCount(value: string): number {
  return Array.from(value).length;
}

export function validateRegistrationField(
  field: RegistrationField,
  values: RegistrationValues,
  captchaRequired: boolean,
  captchaToken: string | null
): string | null {
  const firstName = normalizePersonName(values.firstName);
  const lastName = normalizePersonName(values.lastName);
  const email = normalizeEmail(values.email);

  switch (field) {
    case 'firstName':
      if (!firstName) return 'validation.firstNameRequired';
      if (
        getCharacterCount(firstName) > MAX_NAME_LENGTH ||
        !PERSON_NAME_PATTERN.test(firstName)
      ) {
        return 'validation.invalidFirstName';
      }
      return null;
    case 'lastName':
      if (!lastName) return 'validation.lastNameRequired';
      if (
        getCharacterCount(lastName) > MAX_NAME_LENGTH ||
        !PERSON_NAME_PATTERN.test(lastName)
      ) {
        return 'validation.invalidLastName';
      }
      return null;
    case 'email':
      if (!email) return 'validation.emailRequired';
      if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
        return 'validation.invalidEmail';
      }
      return null;
    case 'password':
      if (!values.password) return 'validation.passwordRequired';
      if (values.password.length < MIN_PASSWORD_LENGTH) {
        return 'validation.passwordLength';
      }
      return null;
    case 'confirmPassword':
      if (!values.confirmPassword) {
        return 'validation.confirmPasswordRequired';
      }
      if (values.password !== values.confirmPassword) {
        return 'validation.passwordMismatch';
      }
      return null;
    case 'captcha':
      return captchaRequired && !captchaToken
        ? 'validation.captchaRequired'
        : null;
  }
}

export function validateRegistration(
  values: RegistrationValues,
  captchaRequired: boolean,
  captchaToken: string | null
): RegistrationErrors {
  const fields: RegistrationField[] = [
    'firstName',
    'lastName',
    'email',
    'password',
    'confirmPassword',
    'captcha',
  ];

  return fields.reduce<RegistrationErrors>((errors, field) => {
    const error = validateRegistrationField(
      field,
      values,
      captchaRequired,
      captchaToken
    );
    if (error) errors[field] = error;
    return errors;
  }, {});
}

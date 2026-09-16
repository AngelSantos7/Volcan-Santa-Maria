import {
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { CountrySelect } from '../components/CountrySelect';
import { DatePicker } from '../components/DatePicker';
import { InternationalPhoneInput } from '../components/InternationalPhoneInput';
import { getCountryOptions } from '../features/profile/country-data';
import { saveTouristProfile } from '../features/profile/profile-service';
import {
  getSuggestedPhoneCountry,
  splitE164Phone,
  toE164Phone,
  type PhoneInputValue,
} from '../features/profile/phone-utils';
import type {
  DocumentType,
  TouristProfileData,
} from '../features/profile/profile-types';
import { normalizeSpaces } from '../lib/text';

type ProfileFormPageProps = {
  userId: string;
  initialData: TouristProfileData;
  requiredCompletion: boolean;
  onSaved: (profile: TouristProfileData) => void;
  onCancel: () => void;
};

type ProfileField =
  | 'nationalityCountryCode'
  | 'dateOfBirth'
  | 'phone'
  | 'documentType'
  | 'documentNumber'
  | 'emergencyFirstName'
  | 'emergencyLastName'
  | 'emergencyRelationship'
  | 'emergencyPhone';

type ProfileFieldErrors = Partial<Record<ProfileField, string>>;

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const today = new Date();
const MAX_DATE_OF_BIRTH = toDateInputValue(today);
const MIN_DATE_OF_BIRTH = toDateInputValue(
  new Date(today.getFullYear() - 120, today.getMonth(), today.getDate())
);
const DOCUMENT_TYPES: DocumentType[] = ['dpi', 'passport', 'other'];
const RELATIONSHIP_OPTIONS = [
  'parent',
  'spouse',
  'sibling',
  'child',
  'relative',
  'friend',
  'other',
] as const;
const ISO_COUNTRY_CODES = new Set(
  getCountryOptions('en').map((country) => country.code)
);

function isValidDateOfBirth(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsedDate = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) return false;

  return (
    parsedDate.toISOString().slice(0, 10) === value &&
    value >= MIN_DATE_OF_BIRTH &&
    value <= MAX_DATE_OF_BIRTH
  );
}

function isValidPersonName(value: string): boolean {
  const normalized = normalizeSpaces(value);

  return (
    normalized.length >= 1 &&
    normalized.length <= 80 &&
    /\p{L}/u.test(normalized) &&
    /^[\p{L}\p{M}]+(?:[ '\u2019\p{Pd}][\p{L}\p{M}]+)*$/u.test(normalized)
  );
}

function isValidDocumentNumber(value: string): boolean {
  const normalized = normalizeSpaces(value);
  return (
    normalized.length >= 3 &&
    normalized.length <= 40 &&
    /[\p{L}\p{N}]/u.test(normalized)
  );
}

function preventImplicitSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
  if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
    event.preventDefault();
  }
}

export function ProfileFormPage({
  userId,
  initialData,
  requiredCompletion,
  onSaved,
  onCancel,
}: ProfileFormPageProps) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<TouristProfileData>(initialData);
  const suggestedPhoneCountry = getSuggestedPhoneCountry(
    initialData.nationalityCountryCode
  );
  const initialPhone = splitE164Phone(initialData.phone, suggestedPhoneCountry);
  const initialEmergencyPhone = splitE164Phone(
    initialData.emergencyPhone,
    suggestedPhoneCountry
  );
  const [phone, setPhone] = useState<PhoneInputValue>(initialPhone);
  const [emergencyPhone, setEmergencyPhone] = useState<PhoneInputValue>(
    initialEmergencyPhone
  );
  const [phoneCountryOverridden, setPhoneCountryOverridden] = useState(
    Boolean(
      initialData.phone && initialPhone.countryCode !== suggestedPhoneCountry
    )
  );
  const [emergencyPhoneCountryOverridden, setEmergencyPhoneCountryOverridden] =
    useState(
      Boolean(
        initialData.emergencyPhone &&
        initialEmergencyPhone.countryCode !== suggestedPhoneCountry
      )
    );
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const clearFieldError = (field: ProfileField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;

      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const updateVisibleFieldError = (
    field: ProfileField,
    nextError: string | null
  ) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;

      const next = { ...current };
      if (nextError) next[field] = nextError;
      else delete next[field];
      return next;
    });
  };

  const setField = <Field extends keyof TouristProfileData>(
    field: Field,
    value: TouristProfileData[Field]
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleNationalityChange = (countryCode: string) => {
    setField('nationalityCountryCode', countryCode);
    clearFieldError('nationalityCountryCode');
    const phoneCountry = getSuggestedPhoneCountry(countryCode);

    if (!phoneCountryOverridden) {
      setPhone((current) => ({ ...current, countryCode: phoneCountry }));
      updateVisibleFieldError(
        'phone',
        phone.nationalNumber && !toE164Phone(phoneCountry, phone.nationalNumber)
          ? t('profile.validation.phoneInvalid')
          : null
      );
    }

    if (!emergencyPhoneCountryOverridden) {
      setEmergencyPhone((current) => ({
        ...current,
        countryCode: phoneCountry,
      }));
      updateVisibleFieldError(
        'emergencyPhone',
        emergencyPhone.nationalNumber &&
          !toE164Phone(phoneCountry, emergencyPhone.nationalNumber)
          ? t('profile.validation.emergencyPhoneInvalid')
          : null
      );
    }
  };

  const validate = (): ProfileFieldErrors => {
    const errors: ProfileFieldErrors = {};
    const nationality = form.nationalityCountryCode.toUpperCase();

    if (!nationality || !ISO_COUNTRY_CODES.has(nationality)) {
      errors.nationalityCountryCode = t(
        'profile.validation.nationalityRequired'
      );
    }

    if (!form.dateOfBirth) {
      errors.dateOfBirth = t('profile.validation.dateOfBirthRequired');
    } else if (!isValidDateOfBirth(form.dateOfBirth)) {
      errors.dateOfBirth = t('profile.validation.dateOfBirthInvalid');
    }

    if (!phone.nationalNumber) {
      errors.phone = t('profile.validation.phoneRequired');
    } else if (!toE164Phone(phone.countryCode, phone.nationalNumber)) {
      errors.phone = t('profile.validation.phoneInvalid');
    }

    if (!form.documentType || !DOCUMENT_TYPES.includes(form.documentType)) {
      errors.documentType = t('profile.validation.documentTypeRequired');
    }

    if (!normalizeSpaces(form.documentNumber)) {
      errors.documentNumber = t('profile.validation.documentNumberRequired');
    } else if (!isValidDocumentNumber(form.documentNumber)) {
      errors.documentNumber = t('profile.validation.documentNumberInvalid');
    }

    if (!normalizeSpaces(form.emergencyFirstName)) {
      errors.emergencyFirstName = t(
        'profile.validation.emergencyFirstNameRequired'
      );
    } else if (!isValidPersonName(form.emergencyFirstName)) {
      errors.emergencyFirstName = t(
        'profile.validation.emergencyFirstNameInvalid'
      );
    }

    if (!normalizeSpaces(form.emergencyLastName)) {
      errors.emergencyLastName = t(
        'profile.validation.emergencyLastNameRequired'
      );
    } else if (!isValidPersonName(form.emergencyLastName)) {
      errors.emergencyLastName = t(
        'profile.validation.emergencyLastNameInvalid'
      );
    }

    if (!form.emergencyRelationship.trim()) {
      errors.emergencyRelationship = t(
        'profile.validation.relationshipRequired'
      );
    }

    if (!emergencyPhone.nationalNumber) {
      errors.emergencyPhone = t('profile.validation.emergencyPhoneRequired');
    } else if (
      !toE164Phone(emergencyPhone.countryCode, emergencyPhone.nationalNumber)
    ) {
      errors.emergencyPhone = t('profile.validation.emergencyPhoneInvalid');
    }

    return errors;
  };

  const focusField = (field: ProfileField) => {
    window.requestAnimationFrame(() => {
      const control = formRef.current?.elements.namedItem(field);
      if (!(control instanceof HTMLElement)) return;

      control.focus({ preventScroll: true });
      control.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmissionError(null);

    const errors = validate();
    const invalidFields = Object.keys(errors) as ProfileField[];

    if (invalidFields.length > 0) {
      setFieldErrors(errors);
      focusField(invalidFields[0]);
      return;
    }

    const e164Phone = toE164Phone(phone.countryCode, phone.nationalNumber);
    const e164EmergencyPhone = toE164Phone(
      emergencyPhone.countryCode,
      emergencyPhone.nationalNumber
    );

    if (!e164Phone || !e164EmergencyPhone) return;

    const normalized: TouristProfileData = {
      ...form,
      nationalityCountryCode: form.nationalityCountryCode.toUpperCase(),
      phone: e164Phone,
      documentNumber: normalizeSpaces(form.documentNumber),
      emergencyFirstName: normalizeSpaces(form.emergencyFirstName),
      emergencyLastName: normalizeSpaces(form.emergencyLastName),
      emergencyRelationship: form.emergencyRelationship.trim(),
      emergencyPhone: e164EmergencyPhone,
    };

    setSubmitting(true);

    try {
      const savedProfile = await saveTouristProfile(userId, normalized);
      onSaved(savedProfile);
    } catch {
      setSubmissionError(t('validation.saveProfile'));
      setSubmitting(false);
    }
  };

  const errorCount = Object.keys(fieldErrors).length;
  const currentRelationshipIsCustom =
    Boolean(form.emergencyRelationship) &&
    !RELATIONSHIP_OPTIONS.includes(
      form.emergencyRelationship as (typeof RELATIONSHIP_OPTIONS)[number]
    );

  return (
    <main className="auth-shell">
      <section
        className="auth-card profile-card"
        aria-labelledby="profile-title"
      >
        <header className="auth-header">
          <span className="eyebrow">{t('common.brand')}</span>
          <h1 id="profile-title">
            {t(
              requiredCompletion ? 'profile.completeTitle' : 'profile.editTitle'
            )}
          </h1>
          <p>{t('profile.subtitle')}</p>
        </header>

        <form
          ref={formRef}
          className="auth-form profile-form"
          onSubmit={handleSubmit}
          onKeyDown={preventImplicitSubmit}
          noValidate
        >
          {submitAttempted && errorCount > 0 && (
            <p className="form-message validation-summary" role="alert">
              {t('validation.completeRequiredFields')}
            </p>
          )}

          <fieldset>
            <legend>{t('profile.personalInformation')}</legend>
            <div className="form-grid">
              <CountrySelect
                id="nationalityCountryCode"
                label={t('profile.nationality')}
                value={form.nationalityCountryCode}
                onChange={handleNationalityChange}
                error={fieldErrors.nationalityCountryCode}
                disabled={submitting}
                required
              />

              <DatePicker
                id="dateOfBirth"
                label={t('profile.dateOfBirth')}
                value={form.dateOfBirth}
                onChange={(value) => {
                  setField('dateOfBirth', value);
                  updateVisibleFieldError(
                    'dateOfBirth',
                    !value
                      ? t('profile.validation.dateOfBirthRequired')
                      : !isValidDateOfBirth(value)
                        ? t('profile.validation.dateOfBirthInvalid')
                        : null
                  );
                }}
                min={MIN_DATE_OF_BIRTH}
                max={MAX_DATE_OF_BIRTH}
                error={fieldErrors.dateOfBirth}
                invalidDateMessage={t('profile.validation.dateOfBirthInvalid')}
                validationEnabled={submitAttempted}
                autoComplete="bday"
                disabled={submitting}
                required
              />

              <InternationalPhoneInput
                id="phone"
                label={t('common.phone')}
                countryCode={phone.countryCode}
                nationalNumber={phone.nationalNumber}
                error={fieldErrors.phone}
                onCountryChange={(countryCode) => {
                  setPhoneCountryOverridden(true);
                  setPhone((current) => ({ ...current, countryCode }));
                  updateVisibleFieldError(
                    'phone',
                    !phone.nationalNumber
                      ? t('profile.validation.phoneRequired')
                      : !toE164Phone(countryCode, phone.nationalNumber)
                        ? t('profile.validation.phoneInvalid')
                        : null
                  );
                }}
                onNumberChange={(nationalNumber) => {
                  setPhone((current) => ({ ...current, nationalNumber }));
                  updateVisibleFieldError(
                    'phone',
                    !nationalNumber
                      ? t('profile.validation.phoneRequired')
                      : !toE164Phone(phone.countryCode, nationalNumber)
                        ? t('profile.validation.phoneInvalid')
                        : null
                  );
                }}
                autoComplete="tel-national"
                disabled={submitting}
                required
              />

              <div
                className={`form-control${fieldErrors.documentType ? ' has-error' : ''}`}
              >
                <label htmlFor="documentType">
                  {t('profile.documentType')}
                </label>
                <select
                  id="documentType"
                  name="documentType"
                  value={form.documentType}
                  aria-invalid={Boolean(fieldErrors.documentType)}
                  aria-describedby={
                    fieldErrors.documentType ? 'documentType-error' : undefined
                  }
                  onChange={(event) => {
                    const value = event.target.value as DocumentType | '';
                    setField('documentType', value);
                    updateVisibleFieldError(
                      'documentType',
                      value && DOCUMENT_TYPES.includes(value)
                        ? null
                        : t('profile.validation.documentTypeRequired')
                    );
                  }}
                  disabled={submitting}
                  required
                >
                  <option value="">{t('profile.selectOption')}</option>
                  <option value="dpi">{t('profile.documentTypes.dpi')}</option>
                  <option value="passport">
                    {t('profile.documentTypes.passport')}
                  </option>
                  <option value="other">
                    {t('profile.documentTypes.other')}
                  </option>
                </select>
                {fieldErrors.documentType && (
                  <p id="documentType-error" className="field-error">
                    {fieldErrors.documentType}
                  </p>
                )}
              </div>

              <div
                className={`form-control${fieldErrors.documentNumber ? ' has-error' : ''}`}
              >
                <label htmlFor="documentNumber">
                  {t('profile.documentNumber')}
                </label>
                <input
                  id="documentNumber"
                  type="text"
                  name="documentNumber"
                  value={form.documentNumber}
                  minLength={3}
                  maxLength={40}
                  autoCapitalize="characters"
                  aria-invalid={Boolean(fieldErrors.documentNumber)}
                  aria-describedby={
                    fieldErrors.documentNumber
                      ? 'documentNumber-error'
                      : undefined
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setField('documentNumber', value);
                    updateVisibleFieldError(
                      'documentNumber',
                      !normalizeSpaces(value)
                        ? t('profile.validation.documentNumberRequired')
                        : !isValidDocumentNumber(value)
                          ? t('profile.validation.documentNumberInvalid')
                          : null
                    );
                  }}
                  disabled={submitting}
                  required
                />
                {fieldErrors.documentNumber && (
                  <p id="documentNumber-error" className="field-error">
                    {fieldErrors.documentNumber}
                  </p>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>{t('profile.emergencyContact')}</legend>
            <div className="form-grid">
              <div
                className={`form-control${fieldErrors.emergencyFirstName ? ' has-error' : ''}`}
              >
                <label htmlFor="emergencyFirstName">
                  {t('common.firstName')}
                </label>
                <input
                  id="emergencyFirstName"
                  type="text"
                  name="emergencyFirstName"
                  autoComplete="off"
                  value={form.emergencyFirstName}
                  maxLength={80}
                  aria-invalid={Boolean(fieldErrors.emergencyFirstName)}
                  aria-describedby={
                    fieldErrors.emergencyFirstName
                      ? 'emergencyFirstName-error'
                      : undefined
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setField('emergencyFirstName', value);
                    updateVisibleFieldError(
                      'emergencyFirstName',
                      !normalizeSpaces(value)
                        ? t('profile.validation.emergencyFirstNameRequired')
                        : !isValidPersonName(value)
                          ? t('profile.validation.emergencyFirstNameInvalid')
                          : null
                    );
                  }}
                  disabled={submitting}
                  required
                />
                {fieldErrors.emergencyFirstName && (
                  <p id="emergencyFirstName-error" className="field-error">
                    {fieldErrors.emergencyFirstName}
                  </p>
                )}
              </div>

              <div
                className={`form-control${fieldErrors.emergencyLastName ? ' has-error' : ''}`}
              >
                <label htmlFor="emergencyLastName">
                  {t('common.lastName')}
                </label>
                <input
                  id="emergencyLastName"
                  type="text"
                  name="emergencyLastName"
                  autoComplete="off"
                  value={form.emergencyLastName}
                  maxLength={80}
                  aria-invalid={Boolean(fieldErrors.emergencyLastName)}
                  aria-describedby={
                    fieldErrors.emergencyLastName
                      ? 'emergencyLastName-error'
                      : undefined
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setField('emergencyLastName', value);
                    updateVisibleFieldError(
                      'emergencyLastName',
                      !normalizeSpaces(value)
                        ? t('profile.validation.emergencyLastNameRequired')
                        : !isValidPersonName(value)
                          ? t('profile.validation.emergencyLastNameInvalid')
                          : null
                    );
                  }}
                  disabled={submitting}
                  required
                />
                {fieldErrors.emergencyLastName && (
                  <p id="emergencyLastName-error" className="field-error">
                    {fieldErrors.emergencyLastName}
                  </p>
                )}
              </div>

              <div
                className={`form-control${fieldErrors.emergencyRelationship ? ' has-error' : ''}`}
              >
                <label htmlFor="emergencyRelationship">
                  {t('profile.relationship')}
                </label>
                <select
                  id="emergencyRelationship"
                  name="emergencyRelationship"
                  value={form.emergencyRelationship}
                  aria-invalid={Boolean(fieldErrors.emergencyRelationship)}
                  aria-describedby={
                    fieldErrors.emergencyRelationship
                      ? 'emergencyRelationship-error'
                      : undefined
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setField('emergencyRelationship', value);
                    updateVisibleFieldError(
                      'emergencyRelationship',
                      value
                        ? null
                        : t('profile.validation.relationshipRequired')
                    );
                  }}
                  disabled={submitting}
                  required
                >
                  <option value="">{t('profile.selectOption')}</option>
                  {currentRelationshipIsCustom && (
                    <option value={form.emergencyRelationship}>
                      {form.emergencyRelationship}
                    </option>
                  )}
                  {RELATIONSHIP_OPTIONS.map((relationship) => (
                    <option key={relationship} value={relationship}>
                      {t(`profile.relationships.${relationship}`)}
                    </option>
                  ))}
                </select>
                {fieldErrors.emergencyRelationship && (
                  <p id="emergencyRelationship-error" className="field-error">
                    {fieldErrors.emergencyRelationship}
                  </p>
                )}
              </div>

              <InternationalPhoneInput
                id="emergencyPhone"
                label={t('common.phone')}
                countryCode={emergencyPhone.countryCode}
                nationalNumber={emergencyPhone.nationalNumber}
                error={fieldErrors.emergencyPhone}
                onCountryChange={(countryCode) => {
                  setEmergencyPhoneCountryOverridden(true);
                  setEmergencyPhone((current) => ({
                    ...current,
                    countryCode,
                  }));
                  updateVisibleFieldError(
                    'emergencyPhone',
                    !emergencyPhone.nationalNumber
                      ? t('profile.validation.emergencyPhoneRequired')
                      : !toE164Phone(countryCode, emergencyPhone.nationalNumber)
                        ? t('profile.validation.emergencyPhoneInvalid')
                        : null
                  );
                }}
                onNumberChange={(nationalNumber) => {
                  setEmergencyPhone((current) => ({
                    ...current,
                    nationalNumber,
                  }));
                  updateVisibleFieldError(
                    'emergencyPhone',
                    !nationalNumber
                      ? t('profile.validation.emergencyPhoneRequired')
                      : !toE164Phone(emergencyPhone.countryCode, nationalNumber)
                        ? t('profile.validation.emergencyPhoneInvalid')
                        : null
                  );
                }}
                disabled={submitting}
                required
              />
            </div>
          </fieldset>

          {submissionError && (
            <p className="form-message error-message" role="alert">
              {submissionError}
            </p>
          )}

          <div className="form-actions">
            {!requiredCompletion && (
              <button
                className="secondary-button"
                type="button"
                onClick={onCancel}
                disabled={submitting}
              >
                {t('common.cancel')}
              </button>
            )}
            <button
              className="primary-button"
              type="submit"
              disabled={submitting}
            >
              {t(submitting ? 'profile.saving' : 'profile.save')}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

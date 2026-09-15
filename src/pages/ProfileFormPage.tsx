import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CountrySelect } from '../components/CountrySelect'
import { InternationalPhoneInput } from '../components/InternationalPhoneInput'
import { saveTouristProfile } from '../features/profile/profile-service'
import {
  getSuggestedPhoneCountry,
  splitE164Phone,
  toE164Phone,
  type PhoneInputValue,
} from '../features/profile/phone-utils'
import type {
  DocumentType,
  TouristProfileData,
} from '../features/profile/profile-types'
import { normalizeSpaces } from '../lib/text'

type ProfileFormPageProps = {
  userId: string
  initialData: TouristProfileData
  requiredCompletion: boolean
  onSaved: (profile: TouristProfileData) => void
  onCancel: () => void
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const today = new Date()
const MAX_DATE_OF_BIRTH = toDateInputValue(today)
const MIN_DATE_OF_BIRTH = toDateInputValue(
  new Date(today.getFullYear() - 120, today.getMonth(), today.getDate()),
)
const DOCUMENT_TYPES: DocumentType[] = ['dpi', 'passport', 'other']

function isValidDateOfBirth(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const parsedDate = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsedDate.getTime())) return false

  return (
    parsedDate.toISOString().slice(0, 10) === value &&
    value >= MIN_DATE_OF_BIRTH &&
    value <= MAX_DATE_OF_BIRTH
  )
}

export function ProfileFormPage({
  userId,
  initialData,
  requiredCompletion,
  onSaved,
  onCancel,
}: ProfileFormPageProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<TouristProfileData>(initialData)
  const suggestedPhoneCountry = getSuggestedPhoneCountry(
    initialData.nationalityCountryCode,
  )
  const initialPhone = splitE164Phone(
    initialData.phone,
    suggestedPhoneCountry,
  )
  const initialEmergencyPhone = splitE164Phone(
    initialData.emergencyPhone,
    suggestedPhoneCountry,
  )
  const [phone, setPhone] = useState<PhoneInputValue>(initialPhone)
  const [emergencyPhone, setEmergencyPhone] =
    useState<PhoneInputValue>(initialEmergencyPhone)
  const [phoneCountryOverridden, setPhoneCountryOverridden] = useState(
    Boolean(
      initialData.phone && initialPhone.countryCode !== suggestedPhoneCountry,
    ),
  )
  const [emergencyPhoneCountryOverridden, setEmergencyPhoneCountryOverridden] =
    useState(
      Boolean(
        initialData.emergencyPhone &&
          initialEmergencyPhone.countryCode !== suggestedPhoneCountry,
      ),
    )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const setField = <Field extends keyof TouristProfileData>(
    field: Field,
    value: TouristProfileData[Field],
  ) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleNationalityChange = (countryCode: string) => {
    setField('nationalityCountryCode', countryCode)
    const phoneCountry = getSuggestedPhoneCountry(countryCode)

    if (!phoneCountryOverridden) {
      setPhone((current) => ({ ...current, countryCode: phoneCountry }))
    }

    if (!emergencyPhoneCountryOverridden) {
      setEmergencyPhone((current) => ({
        ...current,
        countryCode: phoneCountry,
      }))
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const requiredValues = [
      form.nationalityCountryCode,
      form.dateOfBirth,
      phone.nationalNumber,
      form.documentType,
      form.documentNumber,
      form.emergencyFirstName,
      form.emergencyLastName,
      form.emergencyRelationship,
      emergencyPhone.nationalNumber,
    ]

    if (requiredValues.some((value) => !value.trim())) {
      setError(t('validation.required'))
      return
    }

    if (
      !form.documentType ||
      !DOCUMENT_TYPES.includes(form.documentType)
    ) {
      setError(t('validation.required'))
      return
    }

    if (!isValidDateOfBirth(form.dateOfBirth)) {
      setError(t('validation.invalidDate'))
      return
    }

    const e164Phone = toE164Phone(phone.countryCode, phone.nationalNumber)
    if (!e164Phone) {
      setError(t('validation.invalidPhone'))
      return
    }

    const e164EmergencyPhone = toE164Phone(
      emergencyPhone.countryCode,
      emergencyPhone.nationalNumber,
    )
    if (!e164EmergencyPhone) {
      setError(t('validation.invalidEmergencyPhone'))
      return
    }

    const normalized: TouristProfileData = {
      ...form,
      nationalityCountryCode: form.nationalityCountryCode.toUpperCase(),
      phone: e164Phone,
      documentNumber: normalizeSpaces(form.documentNumber),
      emergencyFirstName: normalizeSpaces(form.emergencyFirstName),
      emergencyLastName: normalizeSpaces(form.emergencyLastName),
      emergencyRelationship: normalizeSpaces(form.emergencyRelationship),
      emergencyPhone: e164EmergencyPhone,
    }

    setSubmitting(true)

    try {
      const savedProfile = await saveTouristProfile(userId, normalized)
      onSaved(savedProfile)
    } catch {
      setError(t('validation.saveProfile'))
      setSubmitting(false)
    }
  }

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
              requiredCompletion
                ? 'profile.completeTitle'
                : 'profile.editTitle',
            )}
          </h1>
          <p>{t('profile.subtitle')}</p>
        </header>

        <form
          className="auth-form profile-form"
          onSubmit={handleSubmit}
          noValidate
        >
          <fieldset>
            <legend>{t('profile.personalInformation')}</legend>
            <div className="form-grid">
              <CountrySelect
                id="nationalityCountryCode"
                label={t('profile.nationality')}
                value={form.nationalityCountryCode}
                onChange={handleNationalityChange}
                disabled={submitting}
                required
              />

              <div className="form-control">
                <label htmlFor="dateOfBirth">{t('profile.dateOfBirth')}</label>
                <input
                  id="dateOfBirth"
                  type="date"
                  name="dateOfBirth"
                  autoComplete="bday"
                  min={MIN_DATE_OF_BIRTH}
                  max={MAX_DATE_OF_BIRTH}
                  value={form.dateOfBirth}
                  onChange={(event) =>
                    setField('dateOfBirth', event.target.value)
                  }
                  disabled={submitting}
                  required
                />
              </div>

              <InternationalPhoneInput
                id="phone"
                label={t('common.phone')}
                countryCode={phone.countryCode}
                nationalNumber={phone.nationalNumber}
                onCountryChange={(countryCode) => {
                  setPhoneCountryOverridden(true)
                  setPhone((current) => ({ ...current, countryCode }))
                }}
                onNumberChange={(nationalNumber) =>
                  setPhone((current) => ({ ...current, nationalNumber }))
                }
                autoComplete="tel-national"
                disabled={submitting}
                required
              />

              <div className="form-control">
                <label htmlFor="documentType">{t('profile.documentType')}</label>
                <select
                  id="documentType"
                  name="documentType"
                  value={form.documentType}
                  onChange={(event) =>
                    setField(
                      'documentType',
                      event.target.value as DocumentType | '',
                    )
                  }
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
              </div>

              <div className="form-control">
                <label htmlFor="documentNumber">
                  {t('profile.documentNumber')}
                </label>
                <input
                  id="documentNumber"
                  type="text"
                  name="documentNumber"
                  value={form.documentNumber}
                  onChange={(event) =>
                    setField('documentNumber', event.target.value)
                  }
                  disabled={submitting}
                  required
                />
              </div>

            </div>
          </fieldset>

          <fieldset>
            <legend>{t('profile.emergencyContact')}</legend>
            <div className="form-grid">
              <div className="form-control">
                <label htmlFor="emergencyFirstName">
                  {t('common.firstName')}
                </label>
                <input
                  id="emergencyFirstName"
                  type="text"
                  name="emergencyFirstName"
                  autoComplete="off"
                  value={form.emergencyFirstName}
                  onChange={(event) =>
                    setField('emergencyFirstName', event.target.value)
                  }
                  disabled={submitting}
                  required
                />
              </div>

              <div className="form-control">
                <label htmlFor="emergencyLastName">
                  {t('common.lastName')}
                </label>
                <input
                  id="emergencyLastName"
                  type="text"
                  name="emergencyLastName"
                  autoComplete="off"
                  value={form.emergencyLastName}
                  onChange={(event) =>
                    setField('emergencyLastName', event.target.value)
                  }
                  disabled={submitting}
                  required
                />
              </div>

              <div className="form-control">
                <label htmlFor="emergencyRelationship">
                  {t('profile.relationship')}
                </label>
                <input
                  id="emergencyRelationship"
                  type="text"
                  name="emergencyRelationship"
                  value={form.emergencyRelationship}
                  onChange={(event) =>
                    setField('emergencyRelationship', event.target.value)
                  }
                  disabled={submitting}
                  required
                />
              </div>

              <InternationalPhoneInput
                id="emergencyPhone"
                label={t('common.phone')}
                countryCode={emergencyPhone.countryCode}
                nationalNumber={emergencyPhone.nationalNumber}
                onCountryChange={(countryCode) => {
                  setEmergencyPhoneCountryOverridden(true)
                  setEmergencyPhone((current) => ({
                    ...current,
                    countryCode,
                  }))
                }}
                onNumberChange={(nationalNumber) =>
                  setEmergencyPhone((current) => ({
                    ...current,
                    nationalNumber,
                  }))
                }
                disabled={submitting}
                required
              />
            </div>
          </fieldset>

          {error && (
            <p className="form-message error-message" role="alert">
              {error}
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
  )
}

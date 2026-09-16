import { useMemo, type ClipboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import { getAppLanguage } from '../i18n';
import {
  getCountryFlag,
  getCountryOptions,
} from '../features/profile/country-data';
import { PHONE_COUNTRIES } from '../features/profile/phone-utils';

type InternationalPhoneInputProps = {
  id: string;
  label: string;
  countryCode: CountryCode;
  nationalNumber: string;
  onCountryChange: (countryCode: CountryCode) => void;
  onNumberChange: (nationalNumber: string) => void;
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
};

const PHONE_COUNTRY_SET = new Set<string>(PHONE_COUNTRIES);

export function InternationalPhoneInput({
  id,
  label,
  countryCode,
  nationalNumber,
  onCountryChange,
  onNumberChange,
  error,
  autoComplete,
  disabled = false,
  required = false,
}: InternationalPhoneInputProps) {
  const { i18n, t } = useTranslation();
  const language = getAppLanguage(i18n.resolvedLanguage);
  const phoneCountries = useMemo(
    () =>
      getCountryOptions(language).filter((country) =>
        PHONE_COUNTRY_SET.has(country.code)
      ),
    [language]
  );
  const errorId = `${id}-error`;

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedValue = event.clipboardData.getData('text');
    const internationalNumber = pastedValue.trim().startsWith('+')
      ? parsePhoneNumberFromString(pastedValue)
      : undefined;

    if (internationalNumber?.country) {
      event.preventDefault();
      onCountryChange(internationalNumber.country);
      onNumberChange(internationalNumber.nationalNumber);
    }
  };

  return (
    <div className={`form-control${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="international-phone">
        <select
          className="phone-country"
          aria-label={t('phone.countryPrefix')}
          value={countryCode}
          onChange={(event) =>
            onCountryChange(event.target.value as CountryCode)
          }
          disabled={disabled}
        >
          {phoneCountries.map((country) => (
            <option key={country.code} value={country.code}>
              {getCountryFlag(country.code)} +
              {getCountryCallingCode(country.code as CountryCode)}
            </option>
          ))}
        </select>
        <input
          id={id}
          name={id}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={t('phone.localNumber')}
          autoComplete={autoComplete}
          value={nationalNumber}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) =>
            onNumberChange(event.target.value.replace(/[^0-9]/g, ''))
          }
          onPaste={handlePaste}
          disabled={disabled}
          required={required}
        />
      </div>
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

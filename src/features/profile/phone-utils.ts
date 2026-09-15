import {
  getCountries,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js'

export type PhoneInputValue = {
  countryCode: CountryCode
  nationalNumber: string
}

export const PHONE_COUNTRIES = getCountries()

export function getSuggestedPhoneCountry(countryCode: string): CountryCode {
  return isSupportedCountry(countryCode) ? countryCode : 'GT'
}

export function splitE164Phone(
  value: string,
  fallbackCountry: CountryCode,
): PhoneInputValue {
  const phoneNumber = value ? parsePhoneNumberFromString(value) : undefined

  return {
    countryCode: phoneNumber?.country ?? fallbackCountry,
    nationalNumber: phoneNumber?.nationalNumber ?? '',
  }
}

export function toE164Phone(
  countryCode: CountryCode,
  nationalNumber: string,
): string | null {
  const phoneNumber = parsePhoneNumberFromString(nationalNumber, countryCode)
  return phoneNumber?.isValid() ? phoneNumber.number : null
}

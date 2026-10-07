import countries from 'i18n-iso-countries';
import esLocale from 'i18n-iso-countries/langs/es.json';
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

countries.registerLocale(esLocale);

export interface CountryOption {
  code: CountryCode;
  name: string;
}
export interface PhoneValue {
  countryCode: CountryCode;
  nationalNumber: string;
  manuallySelected: boolean;
}

export const COUNTRY_OPTIONS: CountryOption[] = Object.keys(
  countries.getAlpha2Codes()
)
  .map((code) => ({
    code: code as CountryCode,
    name: countries.getName(code, 'es', { select: 'official' }) ?? code,
  }))
  .sort((first, second) =>
    first.name.localeCompare(second.name, 'es', { sensitivity: 'base' })
  );
export const COUNTRY_BY_NAME = new Map(
  COUNTRY_OPTIONS.map((country) => [
    country.name.toLocaleLowerCase('es'),
    country,
  ])
);
export const PHONE_COUNTRIES = COUNTRY_OPTIONS.filter((country) =>
  getCountries().includes(country.code)
);
export const GUATEMALA_DEPARTMENTS = [
  ['alta_verapaz', 'Alta Verapaz'], ['baja_verapaz', 'Baja Verapaz'],
  ['chimaltenango', 'Chimaltenango'], ['chiquimula', 'Chiquimula'],
  ['el_progreso', 'El Progreso'], ['escuintla', 'Escuintla'],
  ['guatemala', 'Guatemala'], ['huehuetenango', 'Huehuetenango'],
  ['izabal', 'Izabal'], ['jalapa', 'Jalapa'], ['jutiapa', 'Jutiapa'],
  ['peten', 'Petén'], ['quetzaltenango', 'Quetzaltenango'], ['quiche', 'Quiché'],
  ['retalhuleu', 'Retalhuleu'], ['sacatepequez', 'Sacatepéquez'],
  ['san_marcos', 'San Marcos'], ['santa_rosa', 'Santa Rosa'], ['solola', 'Sololá'],
  ['suchitepequez', 'Suchitepéquez'], ['totonicapan', 'Totonicapán'], ['zacapa', 'Zacapa'],
] as const;

export function departmentName(code: string | null | undefined) {
  return GUATEMALA_DEPARTMENTS.find(([value]) => value === code)?.[1] ?? 'No disponible';
}

export function countryName(code: string | null | undefined) {
  return (
    COUNTRY_OPTIONS.find((country) => country.code === code)?.name ??
    code ??
    'No disponible'
  );
}
export function emptyPhone(countryCode: CountryCode = 'GT'): PhoneValue {
  return { countryCode, nationalNumber: '', manuallySelected: false };
}
export function formatInternationalPhone(value: PhoneValue): string | null {
  const digits = value.nationalNumber.replace(/\D/gu, '');
  if (!digits) return null;
  const parsed = parsePhoneNumberFromString(
    `+${getCountryCallingCode(value.countryCode)}${digits}`
  );
  return parsed?.isPossible() ? parsed.number : null;
}
export function parseDisplayDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${match[3]}-${match[2]}-${match[1]}`
    : null;
}
export function formatDisplayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

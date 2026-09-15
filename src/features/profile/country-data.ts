import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import esLocale from 'i18n-iso-countries/langs/es.json'
import type { AppLanguage } from '../../i18n'

countries.registerLocale(esLocale)
countries.registerLocale(enLocale)

export type CountryOption = {
  code: string
  name: string
}

export function getCountryOptions(language: AppLanguage): CountryOption[] {
  const localizedNames = countries.getNames(language, { select: 'official' })
  const collator = new Intl.Collator(language, { sensitivity: 'base' })

  return Object.keys(countries.getAlpha2Codes())
    .map((code) => ({ code, name: localizedNames[code] }))
    .filter((country): country is CountryOption => Boolean(country.name))
    .sort((first, second) => collator.compare(first.name, second.name))
}

export function getCountryFlag(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/[A-Z]/g, (letter) =>
      String.fromCodePoint(letter.charCodeAt(0) + 127397),
    )
}

import { useTranslation } from 'react-i18next'
import { getAppLanguage, type AppLanguage } from '../i18n'

const LANGUAGES: AppLanguage[] = ['es', 'en']

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const activeLanguage = getAppLanguage(i18n.resolvedLanguage)

  return (
    <nav className="language-switcher" aria-label={t('common.language')}>
      {LANGUAGES.map((language, index) => (
        <span key={language}>
          {index > 0 && <span aria-hidden="true"> | </span>}
          <button
            type="button"
            aria-pressed={activeLanguage === language}
            onClick={() => void i18n.changeLanguage(language)}
          >
            {language.toUpperCase()}
          </button>
        </span>
      ))}
    </nav>
  )
}

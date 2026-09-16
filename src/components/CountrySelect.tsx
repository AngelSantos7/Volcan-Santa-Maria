import { useId, useMemo, useState, type FocusEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../i18n';
import {
  getCountryFlag,
  getCountryOptions,
} from '../features/profile/country-data';

type CountrySelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (countryCode: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
};

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

export function CountrySelect({
  id,
  label,
  value,
  onChange,
  error,
  disabled = false,
  required = false,
}: CountrySelectProps) {
  const { i18n, t } = useTranslation();
  const language = getAppLanguage(i18n.resolvedLanguage);
  const options = useMemo(() => getCountryOptions(language), [language]);
  const selectedCountry = options.find((country) => country.code === value);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const listId = `${useId()}-countries`;
  const errorId = `${id}-error`;
  const visibleValue = query ?? selectedCountry?.name ?? '';
  const normalizedQuery = normalizeSearch(query ?? '');
  const filteredOptions = normalizedQuery
    ? options.filter((country) =>
        normalizeSearch(country.name).includes(normalizedQuery)
      )
    : options;

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(nextTarget)
    ) {
      return;
    }

    setOpen(false);
    setQuery(null);
  };

  return (
    <div
      className={`form-control country-select${error ? ' has-error' : ''}`}
      onBlur={handleBlur}
    >
      <label htmlFor={id}>{label}</label>
      <div className="country-combobox">
        <input
          id={id}
          name={id}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          placeholder={t('country.search')}
          value={visibleValue}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          disabled={disabled}
          required={required}
        />

        {open && !disabled && (
          <ul id={listId} role="listbox" className="country-options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((country) => (
                <li
                  key={country.code}
                  role="option"
                  aria-selected={country.code === value}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onChange(country.code);
                      setQuery(null);
                      setOpen(false);
                    }}
                  >
                    <span aria-hidden="true">
                      {getCountryFlag(country.code)}
                    </span>
                    <span>{country.name}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="country-empty">{t('country.noResults')}</li>
            )}
          </ul>
        )}
      </div>
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

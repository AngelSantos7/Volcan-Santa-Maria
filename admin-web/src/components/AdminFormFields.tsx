import { useId, useState } from 'react';
import { getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import {
  COUNTRY_BY_NAME,
  COUNTRY_OPTIONS,
  PHONE_COUNTRIES,
  formatDisplayDate,
  parseDisplayDate,
  type PhoneValue,
} from '../lib/admin-form-utils';

export function CountryField({
  value,
  onChange,
  disabled = false,
}: {
  value: CountryCode;
  onChange: (value: CountryCode) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const selected = COUNTRY_OPTIONS.find((country) => country.code === value);
  const [text, setText] = useState(selected?.name ?? '');

  return (
    <label>
      Nacionalidad
      <input
        type="search"
        list={listId}
        value={text}
        autoComplete="off"
        disabled={disabled}
        required
        placeholder="Buscar país"
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const match = COUNTRY_BY_NAME.get(next.toLocaleLowerCase('es'));
          if (match) onChange(match.code);
        }}
        onBlur={() =>
          setText(
            COUNTRY_OPTIONS.find((country) => country.code === value)?.name ??
              ''
          )
        }
      />
      <datalist id={listId}>
        {COUNTRY_OPTIONS.map((country) => (
          <option key={country.code} value={country.name}>
            {country.code}
          </option>
        ))}
      </datalist>
    </label>
  );
}

export function PhoneField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  disabled?: boolean;
}) {
  const callingCode = getCountryCallingCode(value.countryCode);
  return (
    <label>
      {label}
      <span className="phone-field">
        <select
          aria-label={`Prefijo de ${label}`}
          value={value.countryCode}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              countryCode: event.target.value as CountryCode,
              manuallySelected: true,
            })
          }
        >
          {PHONE_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              +{getCountryCallingCode(country.code)} · {country.name}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          value={value.nationalNumber}
          disabled={disabled}
          placeholder={`+${callingCode}`}
          onChange={(event) =>
            onChange({
              ...value,
              nationalNumber: event.target.value.replace(/[^0-9]/gu, ''),
            })
          }
        />
      </span>
    </label>
  );
}

export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  required = true,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [display, setDisplay] = useState(() => formatDisplayDate(value));
  const invalid = Boolean(display) && !parseDisplayDate(display);
  return (
    <label>
      {label}
      <span className="admin-date-field">
        <input
          type="text"
          inputMode="numeric"
          placeholder="DD/MM/AAAA"
          value={display}
          required={required}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/gu, '').slice(0, 8);
            const next = [
              digits.slice(0, 2),
              digits.slice(2, 4),
              digits.slice(4),
            ]
              .filter(Boolean)
              .join('/');
            setDisplay(next);
            const parsed = parseDisplayDate(next);
            onChange(
              parsed && (!min || parsed >= min) && (!max || parsed <= max)
                ? parsed
                : ''
            );
          }}
        />
        <input
          className="calendar-control"
          type="date"
          aria-label={`Abrir calendario para ${label}`}
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
            setDisplay(formatDisplayDate(event.target.value));
          }}
        />
      </span>
      {invalid && (
        <small className="field-error">
          Ingrese una fecha real en formato DD/MM/AAAA.
        </small>
      )}
    </label>
  );
}

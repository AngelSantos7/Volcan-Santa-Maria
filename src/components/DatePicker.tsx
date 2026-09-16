import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

type DatePickerProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  min?: string;
  max?: string;
  error?: string;
  invalid?: boolean;
  invalidDateMessage?: string;
  validationEnabled?: boolean;
  describedBy?: string;
  className?: string;
  dataFieldName?: string;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
};

type CalendarView = {
  year: number;
  month: number;
};

function formatDateForDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '';

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function formatDateInput(value: string): string {
  const digits = value.replace(/\D/gu, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return [day, month, year].filter(Boolean).join('/');
}

function toNormalizedDate(day: number, month: number, year: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDisplayDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return toNormalizedDate(day, month, year);
}

function dateParts(value: string): CalendarView | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  if (!match) return null;

  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

function initialCalendarView(value: string, max?: string): CalendarView {
  const preferred = dateParts(value) ?? dateParts(max ?? '');
  if (preferred) return preferred;

  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() };
}

function isAllowedDate(value: string, min?: string, max?: string): boolean {
  return (!min || value >= min) && (!max || value <= max);
}

export function DatePicker({
  id,
  label,
  value,
  onChange,
  name = id,
  min,
  max,
  error,
  invalid,
  invalidDateMessage,
  validationEnabled = true,
  describedBy,
  className = '',
  dataFieldName,
  autoComplete,
  disabled = false,
  required = false,
  placeholder = 'DD/MM/AAAA',
}: DatePickerProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'es-GT';
  const containerRef = useRef<HTMLDivElement>(null);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(() => formatDateForDisplay(value));
  const [localError, setLocalError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<CalendarView>(() =>
    initialCalendarView(value, max)
  );

  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const calendarId = `${id}-calendar`;
  const visibleError = validationEnabled ? (localError ?? error) : undefined;
  const descriptionIds = [helpId, visibleError ? errorId : '', describedBy]
    .filter(Boolean)
    .join(' ');

  const minimumYear =
    dateParts(min ?? '')?.year ?? new Date().getFullYear() - 120;
  const maximumYear =
    dateParts(max ?? '')?.year ?? new Date().getFullYear() + 10;
  const years = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, maximumYear - minimumYear + 1) },
        (_, index) => maximumYear - index
      ),
    [maximumYear, minimumYear]
  );
  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) =>
        new Intl.DateTimeFormat(locale, { month: 'long' }).format(
          new Date(2024, month, 1)
        )
      ),
    [locale]
  );
  const weekdayNames = useMemo(
    () =>
      Array.from({ length: 7 }, (_, weekday) =>
        new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(
          new Date(Date.UTC(2024, 0, weekday + 1))
        )
      ),
    [locale]
  );

  useEffect(() => {
    if (!calendarOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setCalendarOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setCalendarOpen(false);
      calendarButtonRef.current?.focus();
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [calendarOpen]);

  const invalidMessage = invalidDateMessage ?? t('validation.invalidDate');

  const updateDraft = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = formatDateInput(event.target.value);
    const normalized = parseDisplayDate(nextDraft);
    setDraft(nextDraft);

    if (!nextDraft) {
      setLocalError(null);
      onChange('');
      return;
    }

    if (normalized && isAllowedDate(normalized, min, max)) {
      setLocalError(null);
      onChange(normalized);
      setCalendarView(dateParts(normalized) ?? calendarView);
      return;
    }

    setLocalError(null);
    onChange('');
  };

  const validateDraft = () => {
    if (!draft) {
      setLocalError(null);
      return;
    }

    const normalized = parseDisplayDate(draft);
    if (!normalized || !isAllowedDate(normalized, min, max)) {
      setLocalError(invalidMessage);
    }
  };

  const selectCalendarDate = (day: number) => {
    const normalized = toNormalizedDate(
      day,
      calendarView.month + 1,
      calendarView.year
    );
    if (!isAllowedDate(normalized, min, max)) return;

    setDraft(formatDateForDisplay(normalized));
    setLocalError(null);
    onChange(normalized);
    setCalendarOpen(false);
    calendarButtonRef.current?.focus();
  };

  const firstWeekday =
    (new Date(calendarView.year, calendarView.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(
    calendarView.year,
    calendarView.month + 1,
    0
  ).getDate();
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <div
      ref={containerRef}
      className={`form-control${className ? ` ${className}` : ''}${visibleError || (validationEnabled && invalid) ? ' has-error' : ''}`}
      data-field-name={dataFieldName}
    >
      <label htmlFor={id}>{label}</label>
      <div className={`date-picker${disabled ? ' is-disabled' : ''}`}>
        <input
          id={id}
          className="date-picker-input"
          type="text"
          name={name}
          autoComplete={autoComplete}
          inputMode="numeric"
          placeholder={placeholder}
          value={draft}
          maxLength={10}
          aria-invalid={Boolean(visibleError || (validationEnabled && invalid))}
          aria-describedby={descriptionIds || undefined}
          onChange={updateDraft}
          onBlur={validateDraft}
          disabled={disabled}
          required={required}
        />
        <button
          ref={calendarButtonRef}
          className="date-picker-button"
          type="button"
          aria-label={t('common.openCalendar', { field: label })}
          aria-expanded={calendarOpen}
          aria-controls={calendarId}
          onClick={() => setCalendarOpen((current) => !current)}
          disabled={disabled}
        >
          <span aria-hidden="true">▦</span>
        </button>

        {calendarOpen && (
          <div
            id={calendarId}
            className="date-picker-popover"
            role="dialog"
            aria-label={t('common.chooseDate', { field: label })}
          >
            <div className="date-picker-selectors">
              <label>
                <span>{t('common.month')}</span>
                <select
                  value={calendarView.month}
                  onChange={(event) =>
                    setCalendarView((current) => ({
                      ...current,
                      month: Number(event.target.value),
                    }))
                  }
                >
                  {monthNames.map((month, index) => (
                    <option key={month} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('common.year')}</span>
                <select
                  value={calendarView.year}
                  onChange={(event) =>
                    setCalendarView((current) => ({
                      ...current,
                      year: Number(event.target.value),
                    }))
                  }
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="date-picker-weekdays" aria-hidden="true">
              {weekdayNames.map((weekday, index) => (
                <span key={`${weekday}-${index}`}>{weekday}</span>
              ))}
            </div>
            <div className="date-picker-grid">
              {calendarCells.map((day, index) => {
                if (!day) {
                  return <span key={`empty-${index}`} aria-hidden="true" />;
                }

                const normalized = toNormalizedDate(
                  day,
                  calendarView.month + 1,
                  calendarView.year
                );
                const selected = normalized === value;
                const allowed = isAllowedDate(normalized, min, max);
                const accessibleDate = new Intl.DateTimeFormat(locale, {
                  dateStyle: 'long',
                }).format(new Date(calendarView.year, calendarView.month, day));

                return (
                  <button
                    key={normalized}
                    className={selected ? 'is-selected' : undefined}
                    type="button"
                    aria-label={accessibleDate}
                    aria-pressed={selected}
                    onClick={() => selectCalendarDate(day)}
                    disabled={!allowed}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <span id={helpId} className="date-picker-help">
        {t('common.dateFormatHelp')}
      </span>
      {visibleError && (
        <p id={errorId} className="field-error">
          {visibleError}
        </p>
      )}
    </div>
  );
}

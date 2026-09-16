import { useSyncExternalStore } from 'react';

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, '0')
);
const MINUTES = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, '0')
);
const COARSE_POINTER_QUERY = '(pointer: coarse), (hover: none)';

type ReturnTimePickerProps = {
  id: string;
  name: string;
  value: string;
  label: string;
  hourLabel: string;
  minuteLabel: string;
  onChange: (value: string) => void;
  error?: string;
  errorId?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
};

function subscribeToPointerChanges(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(COARSE_POINTER_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);

  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function hasCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.(COARSE_POINTER_QUERY).matches)
  );
}

function useNativeTimePicker(): boolean {
  return useSyncExternalStore(
    subscribeToPointerChanges,
    hasCoarsePointer,
    () => false
  );
}

function getTimeParts(value: string): { hour: string; minute: string } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

  return match
    ? { hour: match[1], minute: match[2] }
    : { hour: '', minute: '' };
}

export function ReturnTimePicker({
  id,
  name,
  value,
  label,
  hourLabel,
  minuteLabel,
  onChange,
  error,
  errorId,
  describedBy,
  invalid = false,
  disabled = false,
  required = false,
}: ReturnTimePickerProps) {
  const useNativePicker = useNativeTimePicker();
  const { hour, minute } = getTimeParts(value);
  const titleId = `${id}-title`;

  return (
    <div
      className="visit-field visit-datetime-field return-time-picker"
      data-field-name={name}
      role="group"
      aria-labelledby={titleId}
    >
      <span id={titleId} className="return-time-picker-title">
        {label}
      </span>

      {useNativePicker ? (
        <>
          <span
            className="return-time-picker-native-sublabel"
            aria-hidden="true"
          />
          <input
            className="return-time-picker-native"
            id={id}
            name={name}
            type="time"
            lang="en-GB"
            step={60}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            disabled={disabled}
            required={required}
          />
        </>
      ) : (
        <>
          <div className="return-time-picker-sublabels">
            <label htmlFor={`${id}-hour`}>{hourLabel}</label>
            <span aria-hidden="true" />
            <label htmlFor={`${id}-minute`}>{minuteLabel}</label>
          </div>

          <div
            className="return-time-picker-controls"
            aria-describedby={describedBy}
          >
            <select
              className="return-time-picker-select"
              id={`${id}-hour`}
              name={`${name}Hour`}
              value={hour}
              onChange={(event) => {
                const nextHour = event.target.value;
                onChange(nextHour ? `${nextHour}:${minute || '00'}` : '');
              }}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              disabled={disabled}
              required={required}
            >
              <option value="">--</option>
              {HOURS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <span className="return-time-picker-separator" aria-hidden="true">
              :
            </span>

            <select
              className="return-time-picker-select"
              id={`${id}-minute`}
              name={`${name}Minute`}
              value={minute}
              onChange={(event) => onChange(`${hour}:${event.target.value}`)}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              disabled={disabled || !hour}
              required={required}
            >
              {MINUTES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {error && errorId && (
        <span id={errorId} className="field-error-message" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

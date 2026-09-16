import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '../../components/DatePicker';
import { ReturnTimePicker } from '../../components/ReturnTimePicker';
import { normalizeSpaces } from '../../lib/text';
import { getVisitErrorMessage } from './visit-errors';
import { createGroupVisit } from './visit-service';
import type { VisitType } from './visit-types';

type CreateVisitFormProps = {
  onCreated: (visitId: string) => Promise<void>;
  onCancel: () => void;
};

const VISIT_TYPES: VisitType[] = ['day_hike', 'expedition_camping'];

type CreateVisitField =
  | 'returnDate'
  | 'returnTime'
  | 'expectedReturn'
  | 'guideName'
  | 'termsAccepted';

type CreateVisitErrors = Partial<Record<CreateVisitField, string>>;

const FIELD_FOCUS_ORDER: CreateVisitField[] = [
  'returnDate',
  'returnTime',
  'guideName',
  'termsAccepted',
];

function getLocalDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toExpectedReturnTimestamp(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const expectedReturn = new Date(year, month - 1, day, hour, minute, 0, 0);

  const isValidLocalDateTime =
    expectedReturn.getFullYear() === year &&
    expectedReturn.getMonth() === month - 1 &&
    expectedReturn.getDate() === day &&
    expectedReturn.getHours() === hour &&
    expectedReturn.getMinutes() === minute;

  if (!isValidLocalDateTime || expectedReturn <= new Date()) {
    return null;
  }

  return expectedReturn.toISOString();
}

function describedBy(...ids: Array<string | false>): string | undefined {
  const value = ids.filter(Boolean).join(' ');
  return value || undefined;
}

function focusFirstInvalidField(
  form: HTMLFormElement,
  errors: CreateVisitErrors
): void {
  const field = FIELD_FOCUS_ORDER.find((name) => {
    if (name === 'returnDate' || name === 'returnTime') {
      return Boolean(errors[name] || errors.expectedReturn);
    }

    return Boolean(errors[name]);
  });

  if (!field) return;

  const fieldContainer = form.querySelector<HTMLElement>(
    `[data-field-name="${field}"]`
  );
  const nestedControls = fieldContainer
    ? Array.from(
        fieldContainer.querySelectorAll<HTMLElement>('input, select, button')
      ).filter((element) => !element.hasAttribute('disabled'))
    : [];
  const nestedControl =
    nestedControls.find((element) => element.getClientRects().length > 0) ??
    nestedControls[0];
  const control = nestedControl ?? form.elements.namedItem(field);
  if (control instanceof HTMLElement) {
    control.focus({ preventScroll: true });
    control.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export function CreateVisitForm({ onCreated, onCancel }: CreateVisitFormProps) {
  const { t } = useTranslation();
  const [visitType, setVisitType] = useState<VisitType>('day_hike');
  const [returnDate, setReturnDate] = useState(getLocalDateValue);
  const [returnTime, setReturnTime] = useState('');
  const [hasLocalGuide, setHasLocalGuide] = useState(false);
  const [guideName, setGuideName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CreateVisitErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateVisibleFieldError = (
    field: CreateVisitField,
    nextError: string | null
  ) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;

      const next = { ...current };
      if (nextError) next[field] = nextError;
      else delete next[field];
      return next;
    });
  };

  const updateVisibleReturnErrors = (date: string, time: string) => {
    setFieldErrors((current) => {
      if (
        !current.returnDate &&
        !current.returnTime &&
        !current.expectedReturn
      ) {
        return current;
      }

      const next = { ...current };
      delete next.returnDate;
      delete next.returnTime;
      delete next.expectedReturn;

      if (!date) {
        next.returnDate = t('visits.validation.returnDateRequired');
      } else if (date < getLocalDateValue()) {
        next.returnDate = t('visits.validation.returnDatePast');
      }

      if (!time) {
        next.returnTime = t('visits.validation.returnTimeRequired');
      }

      if (
        !next.returnDate &&
        !next.returnTime &&
        !toExpectedReturnTimestamp(date, time)
      ) {
        next.expectedReturn = t('visits.validation.futureReturn');
      }

      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitError(null);

    const errors: CreateVisitErrors = {};
    const today = getLocalDateValue();
    const normalizedGuideName = normalizeSpaces(guideName);

    if (!returnDate) {
      errors.returnDate = t('visits.validation.returnDateRequired');
    } else if (returnDate < today) {
      errors.returnDate = t('visits.validation.returnDatePast');
    }

    if (!returnTime) {
      errors.returnTime = t('visits.validation.returnTimeRequired');
    }

    const expectedReturnAt =
      errors.returnDate || errors.returnTime
        ? null
        : toExpectedReturnTimestamp(returnDate, returnTime);

    if (!errors.returnDate && !errors.returnTime && !expectedReturnAt) {
      errors.expectedReturn = t('visits.validation.futureReturn');
    }

    if (hasLocalGuide && !normalizedGuideName) {
      errors.guideName = t('visits.validation.guideName');
    }

    if (!termsAccepted) {
      errors.termsAccepted = t('visits.validation.acceptTerms');
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0 || !expectedReturnAt) {
      window.requestAnimationFrame(() => focusFirstInvalidField(form, errors));
      return;
    }

    setSubmitting(true);

    try {
      const visitId = await createGroupVisit({
        visitType,
        expectedReturnAt,
        hasLocalGuide,
        guideName: hasLocalGuide ? normalizedGuideName : null,
      });
      await onCreated(visitId);
    } catch (createError) {
      setSubmitError(getVisitErrorMessage(createError));
      setSubmitting(false);
    }
  };

  const returnDateInvalid = Boolean(
    fieldErrors.returnDate || fieldErrors.expectedReturn
  );
  const returnTimeInvalid = Boolean(
    fieldErrors.returnTime || fieldErrors.expectedReturn
  );
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return (
    <section aria-labelledby="create-visit-title">
      <header className="visit-section-header">
        <button
          className="text-button"
          type="button"
          onClick={onCancel}
          disabled={submitting}
        >
          {t('visits.back')}
        </button>
        <h2 id="create-visit-title">{t('visits.create.title')}</h2>
      </header>

      <form className="visit-form" onSubmit={handleSubmit} noValidate>
        {hasFieldErrors && (
          <p className="form-message error-message" role="alert">
            {t('validation.completeRequiredFields')}
          </p>
        )}

        <div className="visit-summary-row">
          <span>{t('visits.route')}</span>
          <strong>{t('visits.summitRoute')}</strong>
        </div>

        <fieldset className="visit-type-fieldset">
          <legend>{t('visits.tripType')}</legend>
          <div className="visit-type-options">
            {VISIT_TYPES.map((option) => (
              <button
                key={option}
                className="visit-type-card"
                type="button"
                aria-pressed={visitType === option}
                onClick={() => setVisitType(option)}
                disabled={submitting}
              >
                {t(`visits.types.${option}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="return-fields">
          <DatePicker
            id="returnDate"
            name="returnDate"
            label={t('visits.returnDate')}
            value={returnDate}
            min={getLocalDateValue()}
            onChange={(nextValue) => {
              setReturnDate(nextValue);
              updateVisibleReturnErrors(nextValue, returnTime);
            }}
            error={fieldErrors.returnDate}
            invalid={returnDateInvalid}
            invalidDateMessage={t('visits.validation.returnDateInvalid')}
            describedBy={
              fieldErrors.expectedReturn ? 'expectedReturn-error' : undefined
            }
            className="visit-field visit-datetime-field return-date-field"
            dataFieldName="returnDate"
            disabled={submitting}
            required
          />

          <ReturnTimePicker
            id="returnTime"
            name="returnTime"
            value={returnTime}
            label={t('visits.returnTime')}
            hourLabel={t('visits.timePicker.hour')}
            minuteLabel={t('visits.timePicker.minute')}
            onChange={(nextValue) => {
              setReturnTime(nextValue);
              updateVisibleReturnErrors(returnDate, nextValue);
            }}
            invalid={returnTimeInvalid}
            describedBy={describedBy(
              Boolean(fieldErrors.returnTime) && 'returnTime-error',
              Boolean(fieldErrors.expectedReturn) && 'expectedReturn-error'
            )}
            error={fieldErrors.returnTime}
            errorId="returnTime-error"
            disabled={submitting}
            required
          />
        </div>

        {fieldErrors.expectedReturn && (
          <p
            id="expectedReturn-error"
            className="field-error-message"
            role="alert"
          >
            {fieldErrors.expectedReturn}
          </p>
        )}

        <label className="switch-row">
          <span>{t('visits.create.localGuideQuestion')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={hasLocalGuide}
            onChange={(event) => {
              setHasLocalGuide(event.target.checked);
              if (!event.target.checked) {
                updateVisibleFieldError('guideName', null);
              }
            }}
            disabled={submitting}
          />
        </label>

        {hasLocalGuide && (
          <label className="visit-field" htmlFor="guideName">
            {t('visits.guideName')}
            <input
              id="guideName"
              name="guideName"
              type="text"
              autoComplete="name"
              value={guideName}
              onChange={(event) => {
                const value = event.target.value;
                setGuideName(value);
                updateVisibleFieldError(
                  'guideName',
                  normalizeSpaces(value)
                    ? null
                    : t('visits.validation.guideName')
                );
              }}
              aria-invalid={Boolean(fieldErrors.guideName)}
              aria-describedby={
                fieldErrors.guideName ? 'guideName-error' : undefined
              }
              disabled={submitting}
              required
            />
            {fieldErrors.guideName && (
              <span
                id="guideName-error"
                className="field-error-message"
                role="alert"
              >
                {fieldErrors.guideName}
              </span>
            )}
          </label>
        )}

        <label className="terms-row" htmlFor="createVisitTerms">
          <input
            id="createVisitTerms"
            name="termsAccepted"
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => {
              setTermsAccepted(event.target.checked);
              updateVisibleFieldError(
                'termsAccepted',
                event.target.checked ? null : t('visits.validation.acceptTerms')
              );
            }}
            aria-invalid={Boolean(fieldErrors.termsAccepted)}
            aria-describedby={
              fieldErrors.termsAccepted ? 'termsAccepted-error' : undefined
            }
            disabled={submitting}
            required
          />
          <span>{t('visits.terms')}</span>
        </label>

        {fieldErrors.termsAccepted && (
          <p
            id="termsAccepted-error"
            className="field-error-message"
            role="alert"
          >
            {fieldErrors.termsAccepted}
          </p>
        )}

        {submitError && (
          <p className="form-message error-message" role="alert">
            {submitError}
          </p>
        )}

        <button className="primary-button visit-submit" disabled={submitting}>
          {t(submitting ? 'visits.create.creating' : 'visits.create.submit')}
        </button>
      </form>
    </section>
  );
}

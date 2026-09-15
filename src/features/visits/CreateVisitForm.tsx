import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeSpaces } from '../../lib/text';
import { getVisitErrorMessage } from './visit-errors';
import { createGroupVisit } from './visit-service';
import type { VisitType } from './visit-types';

type CreateVisitFormProps = {
  onCreated: (visitId: string) => Promise<void>;
  onCancel: () => void;
};

const VISIT_TYPES: VisitType[] = ['day_hike', 'expedition_camping'];

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

  const expectedReturn = new Date(`${date}T${time}:00`);
  if (Number.isNaN(expectedReturn.getTime()) || expectedReturn <= new Date()) {
    return null;
  }

  return expectedReturn.toISOString();
}

export function CreateVisitForm({ onCreated, onCancel }: CreateVisitFormProps) {
  const { t } = useTranslation();
  const [visitType, setVisitType] = useState<VisitType>('day_hike');
  const [returnDate, setReturnDate] = useState(getLocalDateValue);
  const [returnTime, setReturnTime] = useState('');
  const [hasLocalGuide, setHasLocalGuide] = useState(false);
  const [guideName, setGuideName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const selectedReturnDate =
      visitType === 'day_hike' ? getLocalDateValue() : returnDate;
    const expectedReturnAt = toExpectedReturnTimestamp(
      selectedReturnDate,
      returnTime
    );
    const normalizedGuideName = normalizeSpaces(guideName);

    if (!expectedReturnAt) {
      setError(t('visits.validation.futureReturn'));
      return;
    }

    if (hasLocalGuide && !normalizedGuideName) {
      setError(t('visits.validation.guideName'));
      return;
    }

    if (!termsAccepted) {
      setError(t('visits.validation.acceptTerms'));
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
      setError(getVisitErrorMessage(createError));
      setSubmitting(false);
    }
  };

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
          {visitType === 'expedition_camping' && (
            <label className="visit-field" htmlFor="returnDate">
              {t('visits.returnDate')}
              <input
                id="returnDate"
                name="returnDate"
                type="date"
                min={getLocalDateValue()}
                value={returnDate}
                onChange={(event) => setReturnDate(event.target.value)}
                disabled={submitting}
                required
              />
            </label>
          )}

          <label className="visit-field" htmlFor="returnTime">
            {t('visits.returnTime')}
            <input
              id="returnTime"
              name="returnTime"
              type="time"
              value={returnTime}
              onChange={(event) => setReturnTime(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
        </div>

        <label className="switch-row">
          <span>{t('visits.create.localGuideQuestion')}</span>
          <input
            type="checkbox"
            role="switch"
            checked={hasLocalGuide}
            onChange={(event) => setHasLocalGuide(event.target.checked)}
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
              onChange={(event) => setGuideName(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
        )}

        <label className="terms-row">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            disabled={submitting}
            required
          />
          <span>{t('visits.terms')}</span>
        </label>

        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}

        <button className="primary-button visit-submit" disabled={submitting}>
          {t(submitting ? 'visits.create.creating' : 'visits.create.submit')}
        </button>
      </form>
    </section>
  );
}

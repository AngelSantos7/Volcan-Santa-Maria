import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getVisitErrorMessage } from './visit-errors';
import { joinGroupVisit } from './visit-service';

type JoinVisitFormProps = {
  onJoined: (visitId: string) => Promise<void>;
  onCancel: () => void;
};

function sanitizeJoinCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function JoinVisitForm({ onJoined, onCancel }: JoinVisitFormProps) {
  const { t } = useTranslation();
  const [joinCode, setJoinCode] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (joinCode.length !== 6) {
      setError(t('visits.validation.invalidCode'));
      return;
    }

    if (!termsAccepted) {
      setError(t('visits.validation.acceptTerms'));
      return;
    }

    setSubmitting(true);

    try {
      const visitId = await joinGroupVisit(joinCode);
      await onJoined(visitId);
    } catch (joinError) {
      setError(getVisitErrorMessage(joinError));
      setSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="join-visit-title">
      <header className="visit-section-header">
        <button
          className="text-button"
          type="button"
          onClick={onCancel}
          disabled={submitting}
        >
          {t('visits.back')}
        </button>
        <h2 id="join-visit-title">{t('visits.join.title')}</h2>
      </header>

      <form className="visit-form" onSubmit={handleSubmit} noValidate>
        <label className="visit-field" htmlFor="joinCode">
          {t('visits.join.code')}
          <input
            id="joinCode"
            className="join-code-input"
            name="joinCode"
            type="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            maxLength={6}
            pattern="[A-Z0-9]{6}"
            value={joinCode}
            onChange={(event) =>
              setJoinCode(sanitizeJoinCode(event.target.value))
            }
            disabled={submitting}
            required
          />
        </label>

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
          {t(submitting ? 'visits.join.joining' : 'visits.join.submit')}
        </button>
      </form>
    </section>
  );
}

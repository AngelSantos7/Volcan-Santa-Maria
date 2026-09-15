import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { EarlyReturnReason } from './visit-types';

type EarlyReturnFormProps = {
  mode: 'self' | 'organizer';
  participantName?: string;
  onConfirm: (reason: EarlyReturnReason, notes: string | null) => Promise<void>;
  onCancel: () => void;
};

const REASONS: EarlyReturnReason[] = [
  'physical_discomfort',
  'injury',
  'emergency',
  'personal_decision',
  'other',
];

export function EarlyReturnForm({
  mode,
  participantName,
  onConfirm,
  onCancel,
}: EarlyReturnFormProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<EarlyReturnReason | ''>('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (!reason) {
      setValidationError(t('visits.earlyReturn.reasonRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(reason, notes.trim() || null);
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <form className="early-return-form" onSubmit={handleSubmit} noValidate>
      <h3>
        {mode === 'self'
          ? t('visits.earlyReturn.title')
          : t('visits.earlyReturn.organizerTitle', {
              name: participantName,
            })}
      </h3>

      <label className="visit-field" htmlFor="earlyReturnReason">
        {t('visits.earlyReturn.reason')}
        <select
          id="earlyReturnReason"
          value={reason}
          onChange={(event) =>
            setReason(event.target.value as EarlyReturnReason | '')
          }
          disabled={submitting}
          required
        >
          <option value="">{t('visits.earlyReturn.selectReason')}</option>
          {REASONS.map((option) => (
            <option key={option} value={option}>
              {t(`visits.earlyReturn.reasons.${option}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="visit-field" htmlFor="earlyReturnNotes">
        {t('visits.earlyReturn.notes')}
        <textarea
          id="earlyReturnNotes"
          value={notes}
          maxLength={1000}
          rows={3}
          onChange={(event) => setNotes(event.target.value)}
          disabled={submitting}
        />
      </label>

      {validationError && (
        <p className="form-message error-message" role="alert">
          {validationError}
        </p>
      )}

      <div className="form-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onCancel}
          disabled={submitting}
        >
          {t('common.cancel')}
        </button>
        <button className="primary-button" type="submit" disabled={submitting}>
          {t(
            submitting
              ? 'visits.earlyReturn.saving'
              : mode === 'self'
                ? 'visits.earlyReturn.confirm'
                : 'visits.earlyReturn.organizerConfirm'
          )}
        </button>
      </div>
    </form>
  );
}

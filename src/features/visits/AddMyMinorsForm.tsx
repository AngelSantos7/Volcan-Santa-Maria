import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MinorDraftEditor } from './MinorDraftEditor';
import { emptyMinor } from './minor-draft';
import { addMyVisitMinors } from './visit-service';
import { getVisitErrorMessage } from './visit-errors';

export function AddMyMinorsForm({
  visitId,
  currentUserName,
  onSaved,
  onCancel,
}: {
  visitId: string;
  currentUserName: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [minors, setMinors] = useState([emptyMinor()]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (
      !minors.length ||
      minors.some(
        (m) =>
          !m.fullName.trim() ||
          m.age === '' ||
          !Number.isInteger(Number(m.age)) ||
          (m.relationship === 'other' && !m.relationshipDetail.trim())
      )
    ) {
      setError(t('visits.errors.invalidMinorData'));
      return;
    }
    setBusy(true);
    try {
      await addMyVisitMinors(
        visitId,
        minors.map((m) => ({
          fullName: m.fullName.trim(),
          age: Number(m.age),
          sex: m.sex,
          relationship:
            m.relationship === 'other'
              ? `other:${m.relationshipDetail.trim()}`
              : m.relationship,
        })),
        consent
      );
      await onSaved();
    } catch (reason) {
      setError(getVisitErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <MinorDraftEditor
        minors={minors}
        setMinors={setMinors}
        currentUserName={currentUserName}
        minorResponsibilityConsentAccepted={consent}
        setMinorResponsibilityConsentAccepted={setConsent}
        submitting={busy}
      />
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button className="primary-button" disabled={busy || !minors.length}>
          {t('final.saveMinors')}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={onCancel}
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

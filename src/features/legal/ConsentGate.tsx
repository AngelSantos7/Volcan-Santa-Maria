import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LegalLinks } from './LegalDocuments';
import { acceptCurrentLegalDocuments } from './legal-service';

export function ConsentGate({
  onAccepted,
  onSignOut,
}: {
  onAccepted: () => void;
  onSignOut: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function confirm() {
    if (!accepted) return;
    setBusy(true);
    setError(false);
    try {
      await acceptCurrentLegalDocuments();
      onAccepted();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card legal-consent-card" aria-labelledby="legal-consent-title">
        <header className="auth-header">
          <span className="eyebrow">{t('legal.entity')}</span>
          <h1 id="legal-consent-title">{t('legal.consent.title')}</h1>
          <p>{t('legal.consent.existingUser')}</p>
        </header>
        <LegalLinks />
        <label className="terms-row">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            disabled={busy}
          />
          <span>{t('legal.consent.label')}</span>
        </label>
        {error && <p className="form-message error-message">{t('legal.consent.error')}</p>}
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={() => void onSignOut()} disabled={busy}>
            {t('common.signOut')}
          </button>
          <button className="primary-button" type="button" onClick={() => void confirm()} disabled={!accepted || busy}>
            {t(busy ? 'legal.consent.saving' : 'legal.consent.accept')}
          </button>
        </div>
      </section>
    </main>
  );
}

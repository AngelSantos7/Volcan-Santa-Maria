import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PRIVACY_VERSION, TERMS_VERSION } from './legal-service';

type LegalDocument = 'privacy' | 'terms' | 'safety';

const DOCUMENTS: LegalDocument[] = ['privacy', 'terms', 'safety'];

export function LegalDocumentContent({ document }: { document: LegalDocument }) {
  const { t } = useTranslation();
  const sections = t(`legal.${document}.sections`, {
    returnObjects: true,
  }) as Array<{ title: string; body: string }>;
  return (
    <article className="legal-document">
      <header>
        <span className="eyebrow">{t('legal.entity')}</span>
        <h2>{t(`legal.${document}.title`)}</h2>
        {document !== 'safety' && (
          <small>
            {t('legal.version', {
              version: document === 'privacy' ? PRIVACY_VERSION : TERMS_VERSION,
            })}
          </small>
        )}
      </header>
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </section>
      ))}
    </article>
  );
}

export function LegalLinks({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<LegalDocument | null>(null);
  return (
    <>
      <div className={compact ? 'legal-links compact' : 'legal-links'}>
        {DOCUMENTS.map((document) => (
          <button key={document} type="button" onClick={() => setSelected(document)}>
            {t(`legal.${document}.title`)}
          </button>
        ))}
      </div>
      {selected && (
        <div className="legal-dialog-backdrop" role="presentation">
          <section
            className="legal-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t(`legal.${selected}.title`)}
          >
            <LegalDocumentContent document={selected} />
            <button className="primary-button" type="button" onClick={() => setSelected(null)}>
              {t('common.close')}
            </button>
          </section>
        </div>
      )}
    </>
  );
}

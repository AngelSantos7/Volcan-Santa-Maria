import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MINOR_RELATIONSHIPS,
  emptyMinor,
  type MinorDraft,
  type MinorRelationship,
} from './minor-draft';

export function MinorDraftEditor({
  minors,
  setMinors,
  currentUserName,
  minorResponsibilityConsentAccepted,
  setMinorResponsibilityConsentAccepted,
  submitting,
}: {
  minors: MinorDraft[];
  setMinors: Dispatch<SetStateAction<MinorDraft[]>>;
  currentUserName: string;
  minorResponsibilityConsentAccepted: boolean;
  setMinorResponsibilityConsentAccepted: (value: boolean) => void;
  submitting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="minor-editor" disabled={submitting}>
      <div className="minor-list">
        <p className="muted">{t('visits.minors.responsibleHelp')}</p>
        {minors.map((minor, index) => (
          <fieldset key={minor.id} className="minor-card">
            <legend>{t('visits.minors.item', { number: index + 1 })}</legend>
            <label>
              {t('visits.minors.fullName')}
              <input
                value={minor.fullName}
                onChange={(event) =>
                  setMinors((current) =>
                    current.map((item) =>
                      item.id === minor.id
                        ? { ...item, fullName: event.target.value }
                        : item
                    )
                  )
                }
                required
                maxLength={160}
              />
            </label>
            <div className="form-grid">
              <label>
                {t('visits.minors.age')}
                <input
                  type="number"
                  min="0"
                  max="17"
                  value={minor.age}
                  onChange={(event) =>
                    setMinors((current) =>
                      current.map((item) =>
                        item.id === minor.id
                          ? { ...item, age: event.target.value }
                          : item
                      )
                    )
                  }
                  required
                />
              </label>
              <label>
                {t('profile.sex')}
                <select
                  value={minor.sex}
                  onChange={(event) =>
                    setMinors((current) =>
                      current.map((item) =>
                        item.id === minor.id
                          ? {
                              ...item,
                              sex: event.target.value as 'male' | 'female',
                            }
                          : item
                      )
                    )
                  }
                >
                  <option value="male">{t('profile.sexOptions.male')}</option>
                  <option value="female">
                    {t('profile.sexOptions.female')}
                  </option>
                </select>
              </label>
            </div>
            <label>
              {t('visits.minors.relationship')}
              <select
                value={minor.relationship}
                onChange={(event) =>
                  setMinors((current) =>
                    current.map((item) =>
                      item.id === minor.id
                        ? {
                            ...item,
                            relationship: event.target.value as
                              MinorRelationship | '',
                            relationshipDetail:
                              event.target.value === 'other'
                                ? item.relationshipDetail
                                : '',
                          }
                        : item
                    )
                  )
                }
                required
              >
                <option value="">
                  {t('visits.minors.selectRelationship')}
                </option>
                {MINOR_RELATIONSHIPS.map((relationship) => (
                  <option key={relationship} value={relationship}>
                    {t(`visits.minors.relationships.${relationship}`)}
                  </option>
                ))}
              </select>
            </label>
            {minor.relationship === 'other' && (
              <label>
                {t('visits.minors.relationshipDetail')}
                <input
                  value={minor.relationshipDetail}
                  onChange={(event) =>
                    setMinors((current) =>
                      current.map((item) =>
                        item.id === minor.id
                          ? {
                              ...item,
                              relationshipDetail: event.target.value,
                            }
                          : item
                      )
                    )
                  }
                  required
                  maxLength={72}
                />
              </label>
            )}
            <p className="minor-responsible">
              <span>{t('visits.minors.responsible')}</span>
              <strong>{currentUserName}</strong>
            </p>
            <button
              className="text-button"
              type="button"
              onClick={() =>
                setMinors((current) =>
                  current.filter((item) => item.id !== minor.id)
                )
              }
            >
              {t('visits.minors.remove')}
            </button>
          </fieldset>
        ))}
        <button
          className="secondary-button"
          type="button"
          onClick={() => setMinors((current) => [...current, emptyMinor()])}
        >
          {t('visits.minors.add')}
        </button>
        <label className="terms-row minor-consent-row">
          <input
            type="checkbox"
            checked={minorResponsibilityConsentAccepted}
            onChange={(event) =>
              setMinorResponsibilityConsentAccepted(event.target.checked)
            }
            disabled={submitting}
            required
          />
          <span>{t('visits.minors.consent')}</span>
        </label>
      </div>
    </fieldset>
  );
}

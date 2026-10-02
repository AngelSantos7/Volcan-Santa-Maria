import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '../../components/DatePicker';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { ReturnTimePicker } from '../../components/ReturnTimePicker';
import { AnnouncementBanner } from '../announcements/AnnouncementBanner';
import { RouteRecommendations } from '../routes/components/RouteRecommendations';
import { HikeForecastCard } from '../weather/HikeForecastCard';
import { getGuatemalaLocalTime } from '../weather/weather-service';
import { normalizeSpaces } from '../../lib/text';
import { getVisitErrorMessage } from './visit-errors';
import { createGroupVisit } from './visit-service';
import type { VisitStartMode, VisitType } from './visit-types';

type CreateVisitFormProps = {
  currentUserName: string;
  onCreated: (visitId: string) => Promise<void>;
  onCancel: () => void;
};

const VISIT_TYPES: VisitType[] = ['day_hike', 'expedition_camping'];
const MINOR_RELATIONSHIPS = [
  'child',
  'sibling',
  'niece_nephew',
  'grandchild',
  'cousin',
  'other',
] as const;
type MinorRelationship = (typeof MINOR_RELATIONSHIPS)[number];
type MinorDraft = {
  id: string;
  fullName: string;
  age: string;
  sex: 'male' | 'female';
  relationship: MinorRelationship | '';
  relationshipDetail: string;
};

function emptyMinor(): MinorDraft {
  return {
    id: crypto.randomUUID(),
    fullName: '',
    age: '',
    sex: 'male',
    relationship: '',
    relationshipDetail: '',
  };
}

type CreateVisitField =
  | 'startMode'
  | 'startDate'
  | 'startTime'
  | 'plannedStart'
  | 'returnDate'
  | 'returnTime'
  | 'expectedReturn'
  | 'schedule'
  | 'guideName'
  | 'recommendationsAccepted';

type CreateVisitErrors = Partial<Record<CreateVisitField, string>>;

const FIELD_FOCUS_ORDER: CreateVisitField[] = [
  'startMode',
  'startDate',
  'startTime',
  'returnDate',
  'returnTime',
  'guideName',
  'recommendationsAccepted',
];

function getLocalDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toVisitTimestamp(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const dateTime = new Date(year, month - 1, day, hour, minute, 0, 0);

  const isValidLocalDateTime =
    dateTime.getFullYear() === year &&
    dateTime.getMonth() === month - 1 &&
    dateTime.getDate() === day &&
    dateTime.getHours() === hour &&
    dateTime.getMinutes() === minute;

  if (!isValidLocalDateTime) return null;

  return dateTime.toISOString();
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
    if (name === 'startDate' || name === 'startTime') {
      return Boolean(errors[name] || errors.plannedStart || errors.schedule);
    }

    if (name === 'returnDate' || name === 'returnTime') {
      return Boolean(errors[name] || errors.expectedReturn || errors.schedule);
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

export function CreateVisitForm({
  currentUserName,
  onCreated,
  onCancel,
}: CreateVisitFormProps) {
  const { t } = useTranslation();
  const [startMode, setStartMode] = useState<VisitStartMode>('now');
  const [visitType, setVisitType] = useState<VisitType>('day_hike');
  const [initialDate] = useState(getLocalDateValue);
  const [startDate, setStartDate] = useState(initialDate);
  const [startTime, setStartTime] = useState('');
  const [returnDate, setReturnDate] = useState(initialDate);
  const [returnTime, setReturnTime] = useState('');
  const [hasLocalGuide, setHasLocalGuide] = useState(false);
  const [guideName, setGuideName] = useState('');
  const [recommendationsAccepted, setRecommendationsAccepted] = useState(false);
  const [travelsWithMinors, setTravelsWithMinors] = useState(false);
  const [minors, setMinors] = useState<MinorDraft[]>([]);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [nowReference, setNowReference] = useState(getGuatemalaLocalTime);
  const [fieldErrors, setFieldErrors] = useState<CreateVisitErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isDirty =
    startMode !== 'now' ||
    visitType !== 'day_hike' ||
    startDate !== initialDate ||
    startTime !== '' ||
    returnDate !== initialDate ||
    returnTime !== '' ||
    hasLocalGuide ||
    guideName !== '' ||
    recommendationsAccepted ||
    travelsWithMinors ||
    minors.length > 0;
  const requestCancel = () => {
    if (isDirty) setDiscardConfirmationOpen(true);
    else onCancel();
  };

  useEffect(() => {
    const interval = window.setInterval(
      () => setNowReference(getGuatemalaLocalTime()),
      60_000
    );
    return () => window.clearInterval(interval);
  }, []);

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

  const updateVisibleScheduleErrors = (
    nextStartDate: string,
    nextStartTime: string,
    nextReturnDate: string,
    nextReturnTime: string
  ) => {
    setFieldErrors((current) => {
      if (
        !current.startDate &&
        !current.startTime &&
        !current.plannedStart &&
        !current.returnDate &&
        !current.returnTime &&
        !current.expectedReturn &&
        !current.schedule
      ) {
        return current;
      }

      const next = { ...current };
      delete next.startDate;
      delete next.startTime;
      delete next.plannedStart;
      delete next.returnDate;
      delete next.returnTime;
      delete next.expectedReturn;
      delete next.schedule;

      if (startMode === 'scheduled') {
        if (!nextStartDate) {
          next.startDate = t('visits.validation.startDateRequired');
        } else if (nextStartDate < getLocalDateValue()) {
          next.startDate = t('visits.validation.startDatePast');
        }

        if (!nextStartTime) {
          next.startTime = t('visits.validation.startTimeRequired');
        }
      }

      if (!nextReturnDate) {
        next.returnDate = t('visits.validation.returnDateRequired');
      } else if (nextReturnDate < getLocalDateValue()) {
        next.returnDate = t('visits.validation.returnDatePast');
      }

      if (!nextReturnTime) {
        next.returnTime = t('visits.validation.returnTimeRequired');
      }

      const plannedStartAt =
        startMode === 'scheduled' && !next.startDate && !next.startTime
          ? toVisitTimestamp(nextStartDate, nextStartTime)
          : null;
      const expectedReturnAt =
        next.returnDate || next.returnTime
          ? null
          : toVisitTimestamp(nextReturnDate, nextReturnTime);

      if (plannedStartAt && new Date(plannedStartAt) <= new Date()) {
        next.plannedStart = t('visits.validation.futureStart');
      }

      if (expectedReturnAt && new Date(expectedReturnAt) <= new Date()) {
        next.expectedReturn = t('visits.validation.futureReturn');
      }

      if (
        plannedStartAt &&
        expectedReturnAt &&
        plannedStartAt >= expectedReturnAt
      ) {
        next.schedule = t('visits.validation.startBeforeReturn');
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

    if (startMode === 'scheduled') {
      if (!startDate) {
        errors.startDate = t('visits.validation.startDateRequired');
      } else if (startDate < today) {
        errors.startDate = t('visits.validation.startDatePast');
      }

      if (!startTime) {
        errors.startTime = t('visits.validation.startTimeRequired');
      }
    }

    if (!returnDate) {
      errors.returnDate = t('visits.validation.returnDateRequired');
    } else if (returnDate < today) {
      errors.returnDate = t('visits.validation.returnDatePast');
    }

    if (!returnTime) {
      errors.returnTime = t('visits.validation.returnTimeRequired');
    }

    const plannedStartAt =
      startMode === 'scheduled' && !errors.startDate && !errors.startTime
        ? toVisitTimestamp(startDate, startTime)
        : null;
    const expectedReturnAt =
      errors.returnDate || errors.returnTime
        ? null
        : toVisitTimestamp(returnDate, returnTime);

    if (
      startMode === 'scheduled' &&
      !errors.startDate &&
      !errors.startTime &&
      (!plannedStartAt || new Date(plannedStartAt) <= new Date())
    ) {
      errors.plannedStart = t('visits.validation.futureStart');
    }

    if (
      !errors.returnDate &&
      !errors.returnTime &&
      (!expectedReturnAt || new Date(expectedReturnAt) <= new Date())
    ) {
      errors.expectedReturn = t('visits.validation.futureReturn');
    }

    if (
      plannedStartAt &&
      expectedReturnAt &&
      plannedStartAt >= expectedReturnAt
    ) {
      errors.schedule = t('visits.validation.startBeforeReturn');
    }

    if (hasLocalGuide && !normalizedGuideName) {
      errors.guideName = t('visits.validation.guideName');
    }

    if (!recommendationsAccepted) {
      errors.recommendationsAccepted = t(
        'visits.validation.acceptRecommendations'
      );
    }
    if (
      travelsWithMinors &&
      (minors.length === 0 ||
        minors.some(
          (minor) =>
            !normalizeSpaces(minor.fullName) ||
            !minor.relationship ||
            (minor.relationship === 'other' &&
              !normalizeSpaces(minor.relationshipDetail)) ||
            !/^\d+$/.test(minor.age) ||
            Number(minor.age) < 0 ||
            Number(minor.age) > 17
        ))
    ) {
      setSubmitError(t('visits.minors.validation'));
      return;
    }

    setFieldErrors(errors);

    if (
      Object.keys(errors).length > 0 ||
      (startMode === 'scheduled' && !plannedStartAt) ||
      !expectedReturnAt
    ) {
      window.requestAnimationFrame(() => focusFirstInvalidField(form, errors));
      return;
    }

    setSubmitting(true);

    try {
      const visitId = await createGroupVisit({
        visitType,
        startMode,
        plannedStartAt,
        expectedReturnAt,
        hasLocalGuide,
        guideName: hasLocalGuide ? normalizedGuideName : null,
        recommendationsAccepted,
        minors: travelsWithMinors
          ? minors.map((minor) => ({
              fullName: normalizeSpaces(minor.fullName),
              age: Number(minor.age),
              sex: minor.sex,
              relationship:
                minor.relationship === 'other'
                  ? `other:${normalizeSpaces(minor.relationshipDetail)}`
                  : minor.relationship,
            }))
          : [],
      });
      await onCreated(visitId);
    } catch (createError) {
      setSubmitError(getVisitErrorMessage(createError));
      setSubmitting(false);
    }
  };

  const startDateInvalid = Boolean(
    fieldErrors.startDate || fieldErrors.plannedStart || fieldErrors.schedule
  );
  const startTimeInvalid = Boolean(
    fieldErrors.startTime || fieldErrors.plannedStart || fieldErrors.schedule
  );
  const returnDateInvalid = Boolean(
    fieldErrors.returnDate || fieldErrors.expectedReturn || fieldErrors.schedule
  );
  const returnTimeInvalid = Boolean(
    fieldErrors.returnTime || fieldErrors.expectedReturn || fieldErrors.schedule
  );
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const forecastStartDate =
    startMode === 'now' ? nowReference.slice(0, 10) : startDate;
  const forecastStartTime =
    startMode === 'now' ? nowReference.slice(11, 16) : startTime;
  const forecastStartAt =
    startMode === 'now'
      ? Date.parse(nowReference)
      : Date.parse(toVisitTimestamp(startDate, startTime) ?? '');
  const forecastReturnAt = Date.parse(
    toVisitTimestamp(returnDate, returnTime) ?? ''
  );
  const forecastEnabled = Boolean(
    (startMode === 'now' || (startDate && startTime)) &&
    returnDate &&
    returnTime &&
    Number.isFinite(forecastStartAt) &&
    Number.isFinite(forecastReturnAt) &&
    forecastStartAt < forecastReturnAt
  );
  return (
    <section aria-labelledby="create-visit-title">
      <header className="visit-section-header">
        <button
          className="text-button"
          type="button"
          onClick={requestCancel}
          disabled={submitting}
        >
          {t('visits.back')}
        </button>
        <h2 id="create-visit-title">{t('visits.create.title')}</h2>
      </header>

      <AnnouncementBanner placement="createAscent" />

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

        <fieldset className="visit-type-fieldset" data-field-name="startMode">
          <legend>{t('visits.startMode.title')}</legend>
          <div className="start-mode-options">
            {(['now', 'scheduled'] as const).map((mode) => (
              <button
                key={mode}
                className="start-mode-card"
                type="button"
                aria-pressed={startMode === mode}
                onClick={() => {
                  setStartMode(mode);
                  setFieldErrors((current) => {
                    const next = { ...current };
                    delete next.startMode;
                    delete next.startDate;
                    delete next.startTime;
                    delete next.plannedStart;
                    delete next.schedule;
                    return next;
                  });
                }}
                disabled={submitting}
              >
                <strong>{t(`visits.startMode.${mode}.title`)}</strong>
                <span>{t(`visits.startMode.${mode}.description`)}</span>
              </button>
            ))}
          </div>
        </fieldset>

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

        {startMode === 'now' ? (
          <div className="visit-now-summary">
            <span>{t('visits.startMode.start')}</span>
            <strong>{t('visits.startMode.todayNow')}</strong>
          </div>
        ) : (
          <>
            <div className="schedule-fields">
              <DatePicker
                id="startDate"
                name="startDate"
                label={t('visits.startDate')}
                value={startDate}
                min={getLocalDateValue()}
                onChange={(nextValue) => {
                  setStartDate(nextValue);
                  updateVisibleScheduleErrors(
                    nextValue,
                    startTime,
                    returnDate,
                    returnTime
                  );
                }}
                error={fieldErrors.startDate}
                invalid={startDateInvalid}
                invalidDateMessage={t('visits.validation.startDateInvalid')}
                describedBy={describedBy(
                  Boolean(fieldErrors.plannedStart) && 'plannedStart-error',
                  Boolean(fieldErrors.schedule) && 'schedule-error'
                )}
                className="visit-field visit-datetime-field return-date-field"
                dataFieldName="startDate"
                disabled={submitting}
                required
              />

              <ReturnTimePicker
                id="startTime"
                name="startTime"
                value={startTime}
                label={t('visits.startTime')}
                hourLabel={t('visits.timePicker.hour')}
                minuteLabel={t('visits.timePicker.minute')}
                onChange={(nextValue) => {
                  setStartTime(nextValue);
                  updateVisibleScheduleErrors(
                    startDate,
                    nextValue,
                    returnDate,
                    returnTime
                  );
                }}
                invalid={startTimeInvalid}
                describedBy={describedBy(
                  Boolean(fieldErrors.startTime) && 'startTime-error',
                  Boolean(fieldErrors.plannedStart) && 'plannedStart-error',
                  Boolean(fieldErrors.schedule) && 'schedule-error'
                )}
                error={fieldErrors.startTime}
                errorId="startTime-error"
                disabled={submitting}
                required
              />
            </div>

            {fieldErrors.plannedStart && (
              <p
                id="plannedStart-error"
                className="field-error-message"
                role="alert"
              >
                {fieldErrors.plannedStart}
              </p>
            )}
          </>
        )}

        <div className="schedule-fields">
          <DatePicker
            id="returnDate"
            name="returnDate"
            label={t('visits.returnDate')}
            value={returnDate}
            min={getLocalDateValue()}
            onChange={(nextValue) => {
              setReturnDate(nextValue);
              updateVisibleScheduleErrors(
                startDate,
                startTime,
                nextValue,
                returnTime
              );
            }}
            error={fieldErrors.returnDate}
            invalid={returnDateInvalid}
            invalidDateMessage={t('visits.validation.returnDateInvalid')}
            describedBy={describedBy(
              Boolean(fieldErrors.expectedReturn) && 'expectedReturn-error',
              Boolean(fieldErrors.schedule) && 'schedule-error'
            )}
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
              updateVisibleScheduleErrors(
                startDate,
                startTime,
                returnDate,
                nextValue
              );
            }}
            invalid={returnTimeInvalid}
            describedBy={describedBy(
              Boolean(fieldErrors.returnTime) && 'returnTime-error',
              Boolean(fieldErrors.expectedReturn) && 'expectedReturn-error',
              Boolean(fieldErrors.schedule) && 'schedule-error'
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

        {fieldErrors.schedule && (
          <p id="schedule-error" className="field-error-message" role="alert">
            {fieldErrors.schedule}
          </p>
        )}

        {forecastEnabled && (
          <HikeForecastCard
            startDate={forecastStartDate}
            startTime={forecastStartTime}
            returnDate={returnDate}
            returnTime={returnTime}
            enabled
          />
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

        <section
          className="visit-minors-section"
          aria-labelledby="visit-minors-title"
        >
          <div className="switch-row">
            <span id="visit-minors-title">{t('visits.minors.question')}</span>
            <input
              type="checkbox"
              role="switch"
              checked={travelsWithMinors}
              onChange={(event) => {
                const enabled = event.target.checked;
                setTravelsWithMinors(enabled);
                if (enabled && minors.length === 0) setMinors([emptyMinor()]);
              }}
              disabled={submitting}
            />
          </div>
          {travelsWithMinors && (
            <div className="minor-list">
              <p className="muted">{t('visits.minors.responsibleHelp')}</p>
              {minors.map((minor, index) => (
                <fieldset key={minor.id} className="minor-card">
                  <legend>
                    {t('visits.minors.item', { number: index + 1 })}
                  </legend>
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
                                    sex: event.target.value as
                                      'male' | 'female',
                                  }
                                : item
                            )
                          )
                        }
                      >
                        <option value="male">
                          {t('profile.sexOptions.male')}
                        </option>
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
                onClick={() =>
                  setMinors((current) => [...current, emptyMinor()])
                }
              >
                {t('visits.minors.add')}
              </button>
            </div>
          )}
        </section>

        <div
          className="recommendations-consent"
          data-field-name="recommendationsAccepted"
        >
          <label className="terms-row" htmlFor="recommendationsAccepted">
            <input
              id="recommendationsAccepted"
              name="recommendationsAccepted"
              type="checkbox"
              checked={recommendationsAccepted}
              onChange={(event) => {
                setRecommendationsAccepted(event.target.checked);
                updateVisibleFieldError(
                  'recommendationsAccepted',
                  event.target.checked
                    ? null
                    : t('visits.validation.acceptRecommendations')
                );
              }}
              aria-invalid={Boolean(fieldErrors.recommendationsAccepted)}
              aria-describedby={
                fieldErrors.recommendationsAccepted
                  ? 'recommendationsAccepted-error'
                  : undefined
              }
              disabled={submitting}
              required
            />
            <span>{t('visits.recommendationsConsent')}</span>
          </label>
          <button
            className="text-button recommendations-link"
            type="button"
            onClick={() => setRecommendationsOpen(true)}
            disabled={submitting}
          >
            {t('visits.viewRecommendations')}
          </button>
        </div>

        {fieldErrors.recommendationsAccepted && (
          <p
            id="recommendationsAccepted-error"
            className="field-error-message"
            role="alert"
          >
            {fieldErrors.recommendationsAccepted}
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

      {recommendationsOpen && (
        <div className="recommendations-dialog-backdrop">
          <section
            className="recommendations-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recommendations-dialog-title"
          >
            <header>
              <h2 id="recommendations-dialog-title">
                {t('routes.tabs.recommendations')}
              </h2>
              <button
                type="button"
                onClick={() => setRecommendationsOpen(false)}
                aria-label={t('common.close')}
              >
                ×
              </button>
            </header>
            <RouteRecommendations />
            <button
              className="primary-button"
              type="button"
              onClick={() => setRecommendationsOpen(false)}
            >
              {t('common.close')}
            </button>
          </section>
        </div>
      )}
      <ConfirmationDialog
        open={discardConfirmationOpen}
        message={t('visits.create.cancelMessage')}
        confirmLabel={t('visits.create.discard')}
        cancelLabel={t('visits.create.continueEditing')}
        danger
        onConfirm={onCancel}
        onCancel={() => setDiscardConfirmationOpen(false)}
      />
    </section>
  );
}

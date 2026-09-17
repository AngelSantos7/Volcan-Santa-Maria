import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { getAppLanguage } from '../../i18n';
import type { RouteTab } from '../routes/route-types';
import { EarlyReturnForm } from './EarlyReturnForm';
import { getVisitErrorMessage } from './visit-errors';
import {
  cancelGroupVisit,
  completeGroupVisit,
  confirmMyEarlyCheckout,
  markMemberReturningEarly,
  removeMemberBeforeStart,
  startEarlyReturn,
  startGroupVisit,
  withdrawFromGroup,
} from './visit-service';
import type {
  EarlyReturnReason,
  GroupVisitDetails,
  GroupVisitParticipant,
} from './visit-types';
import { SlideToStart } from './SlideToStart';

type GroupVisitScreenProps = {
  currentUserId: string;
  details: GroupVisitDetails;
  loadError: string | null;
  onRefresh: () => Promise<void>;
  onVisitClosed: () => void;
  onOpenRoute: (tab: RouteTab) => void;
};

type EarlyReturnTarget =
  | { mode: 'self' }
  | { mode: 'organizer'; userId: string; participantName: string };

type PendingConfirmation =
  | { action: 'cancel' }
  | { action: 'complete' }
  | { action: 'withdraw' }
  | { action: 'checkout' }
  | { action: 'remove'; participant: GroupVisitParticipant };

function formatExpectedReturn(value: string | null, language: string): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(language === 'es' ? 'es-GT' : 'en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatTime(value: string | null, language: string): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(language === 'es' ? 'es-GT' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function participantName(participant: GroupVisitParticipant): string {
  return `${participant.firstName} ${participant.lastName}`.trim();
}

export function GroupVisitScreen({
  currentUserId,
  details,
  loadError,
  onRefresh,
  onVisitClosed,
  onOpenRoute,
}: GroupVisitScreenProps) {
  const { t, i18n } = useTranslation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [earlyReturnTarget, setEarlyReturnTarget] =
    useState<EarlyReturnTarget | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const language = getAppLanguage(i18n.resolvedLanguage);
  const routeName =
    language === 'es' ? details.routeNameEs : details.routeNameEn;
  const isOrganizer = details.createdBy === currentUserId;
  const currentParticipant = details.participants.find(
    (participant) => participant.userId === currentUserId
  );
  const participantCount = details.participants.filter(
    (participant) => participant.memberStatus !== 'withdrawn_before_start'
  ).length;

  const copyCode = async () => {
    if (!details.joinCode) return;

    setActionError(null);
    try {
      await navigator.clipboard.writeText(details.joinCode);
      setNotice(t('visits.group.codeCopied'));
    } catch {
      setActionError(t('visits.errors.copyFailed'));
    }
  };

  const shareCode = async () => {
    if (!details.joinCode) return;

    const text = t('visits.group.shareText', {
      code: details.joinCode,
      route: routeName,
    });

    setActionError(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: t('visits.group.title'), text });
        setNotice(t('visits.group.shared'));
      } else {
        await navigator.clipboard.writeText(text);
        setNotice(t('visits.group.shareCopied'));
      }
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === 'AbortError'
      ) {
        return;
      }
      setActionError(t('visits.errors.shareFailed'));
    }
  };

  const handleStart = async () => {
    setBusy(true);
    setActionError(null);

    try {
      await startGroupVisit(details.visitId);
      await onRefresh();
    } catch (startError) {
      setActionError(getVisitErrorMessage(startError));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    setActionError(null);

    try {
      await cancelGroupVisit(details.visitId);
      onVisitClosed();
    } catch (cancelError) {
      setActionError(getVisitErrorMessage(cancelError));
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    setBusy(true);
    setActionError(null);

    try {
      await completeGroupVisit(details.visitId);
      await onRefresh();
    } catch (completeError) {
      setActionError(getVisitErrorMessage(completeError));
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await withdrawFromGroup(details.visitId);
      onVisitClosed();
    } catch (withdrawError) {
      setActionError(getVisitErrorMessage(withdrawError));
      setBusy(false);
    }
  };

  const handleRemoveMember = async (participant: GroupVisitParticipant) => {
    setBusy(true);
    setActionError(null);
    try {
      await removeMemberBeforeStart(details.visitId, participant.userId);
      await onRefresh();
    } catch (removeError) {
      setActionError(getVisitErrorMessage(removeError));
    } finally {
      setBusy(false);
    }
  };

  const handleEarlyReturn = async (
    reason: EarlyReturnReason,
    notes: string | null
  ) => {
    if (!earlyReturnTarget) return;

    setBusy(true);
    setActionError(null);
    try {
      if (earlyReturnTarget.mode === 'self') {
        await startEarlyReturn(details.visitId, reason, notes);
      } else {
        await markMemberReturningEarly(
          details.visitId,
          earlyReturnTarget.userId,
          reason,
          notes
        );
      }

      setEarlyReturnTarget(null);
      await onRefresh();
    } catch (returnError) {
      setActionError(getVisitErrorMessage(returnError));
      throw returnError;
    } finally {
      setBusy(false);
    }
  };

  const handleCheckout = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await confirmMyEarlyCheckout(details.visitId);
      if (currentParticipant?.memberRole === 'leader') {
        await onRefresh();
      } else {
        onVisitClosed();
      }
    } catch (checkoutError) {
      setActionError(getVisitErrorMessage(checkoutError));
    } finally {
      setBusy(false);
    }
  };

  const confirmPendingAction = () => {
    const confirmation = pendingConfirmation;
    setPendingConfirmation(null);

    if (!confirmation) return;

    switch (confirmation.action) {
      case 'cancel':
        void handleCancel();
        break;
      case 'complete':
        void handleComplete();
        break;
      case 'withdraw':
        void handleWithdraw();
        break;
      case 'checkout':
        void handleCheckout();
        break;
      case 'remove':
        void handleRemoveMember(confirmation.participant);
        break;
    }
  };

  const confirmationMessage = pendingConfirmation
    ? pendingConfirmation.action === 'cancel'
      ? t('visits.cancel.confirm')
      : pendingConfirmation.action === 'complete'
        ? t('visits.complete.confirm')
        : pendingConfirmation.action === 'withdraw'
          ? t('visits.members.withdrawConfirm')
          : pendingConfirmation.action === 'checkout'
            ? t('visits.earlyReturn.checkoutConfirm')
            : t('visits.members.removeConfirm', {
                name: participantName(pendingConfirmation.participant),
              })
    : '';

  const confirmationLabel = pendingConfirmation
    ? pendingConfirmation.action === 'cancel'
      ? t('visits.cancel.action')
      : pendingConfirmation.action === 'complete'
        ? t('visits.complete.action')
        : pendingConfirmation.action === 'withdraw'
          ? t('visits.members.withdraw')
          : pendingConfirmation.action === 'checkout'
            ? t('visits.earlyReturn.checkout')
            : t('visits.members.remove')
    : '';

  return (
    <section className="group-visit" aria-labelledby="group-visit-title">
      <header className="visit-section-header centered">
        <span className="visit-status-pill">
          {t(
            details.status === 'forming'
              ? 'visits.group.preparing'
              : details.status === 'completed'
                ? 'visits.complete.completed'
                : 'visits.inProgress.status'
          )}
        </span>
        <h2 id="group-visit-title">
          {t(
            details.status === 'forming'
              ? 'visits.group.title'
              : details.status === 'completed'
                ? 'visits.complete.title'
                : 'visits.inProgress.title'
          )}
        </h2>
      </header>

      <dl className="visit-details-grid">
        <div>
          <dt>{t('visits.route')}</dt>
          <dd>{routeName}</dd>
        </div>
        <div>
          <dt>{t('visits.tripType')}</dt>
          <dd>{t(`visits.types.${details.visitType}`)}</dd>
        </div>
        <div>
          <dt>{t('visits.expectedReturn')}</dt>
          <dd>{formatExpectedReturn(details.expectedReturnAt, language)}</dd>
        </div>
        {(details.status === 'in_progress' ||
          details.status === 'completed') && (
          <div>
            <dt>{t('visits.inProgress.startedAt')}</dt>
            <dd>{formatTime(details.startedAt, language)}</dd>
          </div>
        )}
        {details.hasLocalGuide && details.guideName && (
          <div className="full-width">
            <dt>{t('visits.localGuide')}</dt>
            <dd>{details.guideName}</dd>
          </div>
        )}
      </dl>

      {details.status === 'completed' && details.completedAt && (
        <p className="completed-visit-time" role="status">
          {t('visits.complete.completed')}:{' '}
          {formatTime(details.completedAt, language)}
        </p>
      )}

      {details.status === 'forming' && details.joinCode && (
        <div className="join-code-panel">
          <span>{t('visits.group.code')}</span>
          <strong>{details.joinCode}</strong>
          <div className="join-code-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={copyCode}
            >
              {t('visits.group.copyCode')}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={shareCode}
            >
              {t('visits.group.share')}
            </button>
          </div>
        </div>
      )}

      <section
        className="participants-section"
        aria-labelledby="participants-title"
      >
        <div className="participants-heading">
          <h3 id="participants-title">{t('visits.participants')}</h3>
          <span>{participantCount}</span>
        </div>
        <ul className="participants-list">
          {details.participants.map((participant) => {
            const statusTime =
              participant.memberStatus === 'returning_early'
                ? participant.returnStartedAt
                : participant.memberStatus === 'returned_early'
                  ? participant.checkedOutAt
                  : null;
            const canManageParticipant =
              isOrganizer &&
              participant.userId !== currentUserId &&
              participant.memberStatus === 'active';

            return (
              <li key={participant.userId}>
                <div className="participant-details">
                  <div className="participant-name">
                    <span>{participantName(participant)}</span>
                    {participant.memberRole === 'leader' && (
                      <strong>{t('visits.organizer')}</strong>
                    )}
                  </div>
                  <small>
                    {t(`visits.memberStatus.${participant.memberStatus}`)}
                    {statusTime && ` · ${formatTime(statusTime, language)}`}
                  </small>
                </div>

                {canManageParticipant && details.status === 'forming' && (
                  <button
                    className="participant-action"
                    type="button"
                    onClick={() =>
                      setPendingConfirmation({ action: 'remove', participant })
                    }
                    disabled={busy}
                  >
                    {t('visits.members.remove')}
                  </button>
                )}

                {canManageParticipant && details.status === 'in_progress' && (
                  <button
                    className="participant-action"
                    type="button"
                    onClick={() =>
                      setEarlyReturnTarget({
                        mode: 'organizer',
                        userId: participant.userId,
                        participantName: participantName(participant),
                      })
                    }
                    disabled={busy}
                  >
                    {t('visits.members.markEarlyReturn')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {earlyReturnTarget && (
        <EarlyReturnForm
          mode={earlyReturnTarget.mode}
          participantName={
            earlyReturnTarget.mode === 'organizer'
              ? earlyReturnTarget.participantName
              : undefined
          }
          onConfirm={handleEarlyReturn}
          onCancel={() => setEarlyReturnTarget(null)}
        />
      )}

      {(loadError || actionError) && (
        <p className="form-message error-message" role="alert">
          {actionError ?? loadError}
        </p>
      )}
      {notice && (
        <p className="form-message success-message" role="status">
          {notice}
        </p>
      )}

      {details.status === 'forming' &&
        currentParticipant?.memberRole === 'member' &&
        currentParticipant.memberStatus === 'active' && (
          <button
            className="danger-outline-button member-primary-action"
            type="button"
            onClick={() => setPendingConfirmation({ action: 'withdraw' })}
            disabled={busy}
          >
            {t('visits.members.withdraw')}
          </button>
        )}

      {details.status === 'in_progress' &&
        currentParticipant?.memberStatus === 'active' &&
        !earlyReturnTarget && (
          <button
            className="danger-outline-button member-primary-action"
            type="button"
            onClick={() => setEarlyReturnTarget({ mode: 'self' })}
            disabled={busy}
          >
            {t('visits.earlyReturn.action')}
          </button>
        )}

      {details.status === 'in_progress' &&
        currentParticipant?.memberStatus === 'returning_early' && (
          <button
            className="primary-button member-primary-action"
            type="button"
            onClick={() => setPendingConfirmation({ action: 'checkout' })}
            disabled={busy}
          >
            {t('visits.earlyReturn.checkout')}
          </button>
        )}

      {details.status === 'forming' && isOrganizer && (
        <div className="organizer-actions">
          <SlideToStart onComplete={handleStart} disabled={busy} />
          <button
            className="danger-text-button"
            type="button"
            onClick={() => setPendingConfirmation({ action: 'cancel' })}
            disabled={busy}
          >
            {t(busy ? 'visits.cancel.cancelling' : 'visits.cancel.action')}
          </button>
        </div>
      )}

      {details.status === 'in_progress' && (
        <div className="in-progress-actions">
          <div className="future-actions">
            {(['route', 'map', 'references'] as const).map((feature) => (
              <button
                key={feature}
                className="secondary-button"
                type="button"
                onClick={() =>
                  onOpenRoute(feature === 'route' ? 'information' : feature)
                }
                disabled={busy}
              >
                {t(`visits.inProgress.${feature}`)}
              </button>
            ))}
          </div>
          {isOrganizer && (
            <button
              className="primary-button complete-visit-button"
              type="button"
              onClick={() => setPendingConfirmation({ action: 'complete' })}
              disabled={busy}
            >
              {t(
                busy ? 'visits.complete.completing' : 'visits.complete.action'
              )}
            </button>
          )}
        </div>
      )}

      {details.status === 'completed' && (
        <button
          className="secondary-button completed-back-button"
          type="button"
          onClick={onVisitClosed}
        >
          {t('visits.complete.back')}
        </button>
      )}

      <ConfirmationDialog
        open={pendingConfirmation !== null}
        message={confirmationMessage}
        confirmLabel={confirmationLabel}
        danger={
          pendingConfirmation?.action === 'cancel' ||
          pendingConfirmation?.action === 'withdraw' ||
          pendingConfirmation?.action === 'remove'
        }
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingConfirmation(null)}
      />
    </section>
  );
}

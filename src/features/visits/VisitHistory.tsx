import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../../i18n';
import { getVisitErrorMessage } from './visit-errors';
import { getMyVisitHistory, getVisitHistoryMembers } from './visit-service';
import type {
  VisitHistoryItem,
  VisitHistoryMember,
  VisitMemberStatus,
} from './visit-types';

const PAGE_SIZE = 10;

function formatVisitDate(value: string, language: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3])
      )
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(language === 'es' ? 'es-GT' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatHistoryTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(language === 'es' ? 'es-GT' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function historyEndTimestamp(item: VisitHistoryItem): string | null {
  if (item.memberStatus === 'returned_early' && item.checkedOutAt) {
    return item.checkedOutAt;
  }

  if (
    item.visitStatus === 'completed' &&
    item.memberStatus === 'completed' &&
    item.completedAt
  ) {
    return item.completedAt;
  }

  return null;
}

function durationParts(
  startedAt: string,
  endedAt: string
): { hours: number; minutes: number } | null {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  const totalMinutes = Math.round((end - start) / 60_000);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function historyStatusKey(item: VisitHistoryItem): string {
  if (item.visitStatus === 'cancelled') return 'cancelled';

  switch (item.memberStatus) {
    case 'withdrawn_before_start':
      return 'withdrawn';
    case 'returning_early':
      return 'returningEarly';
    case 'returned_early':
      return 'returnedEarly';
    case 'completed':
      return 'completed';
    default:
      return 'active';
  }
}

function historyMemberStatusKey(status: VisitMemberStatus): string {
  switch (status) {
    case 'withdrawn_before_start':
      return 'withdrawn';
    case 'returning_early':
      return 'returningEarly';
    case 'returned_early':
      return 'returnedEarly';
    case 'completed':
      return 'completed';
    default:
      return 'active';
  }
}

export function VisitHistory() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<VisitHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedVisits, setExpandedVisits] = useState<Set<string>>(
    () => new Set()
  );
  const [membersByVisit, setMembersByVisit] = useState<
    Record<string, VisitHistoryMember[]>
  >({});
  const [membersLoading, setMembersLoading] = useState<Set<string>>(
    () => new Set()
  );
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({});
  const language = getAppLanguage(i18n.resolvedLanguage);

  useEffect(() => {
    let active = true;

    void getMyVisitHistory(PAGE_SIZE, 0)
      .then((history) => {
        if (!active) return;
        setItems(history);
        setHasMore(history.length === PAGE_SIZE);
        setError(null);
      })
      .catch((loadError) => {
        if (active) setError(getVisitErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    setError(null);

    try {
      const nextItems = await getMyVisitHistory(PAGE_SIZE, items.length);
      setItems((current) => [...current, ...nextItems]);
      setHasMore(nextItems.length === PAGE_SIZE);
    } catch (loadError) {
      setError(getVisitErrorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleMembers = async (visitId: string) => {
    if (expandedVisits.has(visitId)) {
      setExpandedVisits((current) => {
        const next = new Set(current);
        next.delete(visitId);
        return next;
      });
      return;
    }

    setExpandedVisits((current) => new Set(current).add(visitId));
    if (Object.hasOwn(membersByVisit, visitId) || membersLoading.has(visitId)) {
      return;
    }

    setMembersLoading((current) => new Set(current).add(visitId));
    setMemberErrors((current) => {
      const next = { ...current };
      delete next[visitId];
      return next;
    });

    try {
      const members = await getVisitHistoryMembers(visitId);
      setMembersByVisit((current) => ({ ...current, [visitId]: members }));
    } catch (loadError) {
      setMemberErrors((current) => ({
        ...current,
        [visitId]: getVisitErrorMessage(loadError),
      }));
    } finally {
      setMembersLoading((current) => {
        const next = new Set(current);
        next.delete(visitId);
        return next;
      });
    }
  };

  return (
    <section className="visit-history" aria-labelledby="visit-history-title">
      <header className="history-header">
        <h2 id="visit-history-title">{t('visits.history.title')}</h2>
      </header>

      {loading ? (
        <p className="history-empty" role="status">
          {t('visits.history.loading')}
        </p>
      ) : items.length === 0 ? (
        <p className="history-empty">{t('visits.history.empty')}</p>
      ) : (
        <ul className="history-list">
          {items.map((item) => {
            const routeName =
              language === 'es' ? item.routeNameEs : item.routeNameEn;
            const isGroup = item.participantCount > 1;
            const endedAt = historyEndTimestamp(item);
            const didStart =
              Boolean(item.startedAt) &&
              item.memberStatus !== 'withdrawn_before_start';
            const duration =
              didStart && item.startedAt && endedAt
                ? durationParts(item.startedAt, endedAt)
                : null;
            const membersExpanded = expandedVisits.has(item.visitId);
            const members = membersByVisit[item.visitId];
            const loadingMembers = membersLoading.has(item.visitId);
            const membersError = memberErrors[item.visitId];
            const membersPanelId = `history-members-${item.visitId}`;

            return (
              <li key={item.visitId} className="history-card">
                <article>
                  <header className="history-card-header">
                    <time dateTime={item.visitDate}>
                      {formatVisitDate(item.visitDate, language)}
                    </time>
                    <span className="history-status">
                      {t(`visits.history.status.${historyStatusKey(item)}`)}
                    </span>
                  </header>

                  <h3>{t(`visits.types.${item.visitType}`)}</h3>
                  <p className="history-route">{routeName}</p>

                  <div className="history-tags">
                    <span>
                      {t(
                        isGroup
                          ? 'visits.history.groupWithCount'
                          : 'visits.history.individual',
                        isGroup ? { count: item.participantCount } : undefined
                      )}
                    </span>
                    {isGroup && item.memberRole === 'leader' && (
                      <span>{t('visits.history.organizer')}</span>
                    )}
                  </div>

                  {didStart && item.startedAt && (
                    <dl className="history-timing">
                      <div>
                        <dt>{t('visits.history.startedAt')}</dt>
                        <dd>{formatHistoryTime(item.startedAt, language)}</dd>
                      </div>
                      {endedAt && (
                        <div>
                          <dt>{t('visits.history.endedAt')}</dt>
                          <dd>{formatHistoryTime(endedAt, language)}</dd>
                        </div>
                      )}
                      {duration && (
                        <div>
                          <dt>{t('visits.history.duration')}</dt>
                          <dd>
                            {duration.hours > 0
                              ? t('visits.history.durationHoursMinutes', {
                                  hours: duration.hours,
                                  minutes: duration.minutes,
                                })
                              : t('visits.history.durationMinutes', {
                                  minutes: duration.minutes,
                                })}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {isGroup && (
                    <button
                      className="history-members-toggle"
                      type="button"
                      aria-expanded={membersExpanded}
                      aria-controls={membersPanelId}
                      onClick={() => void toggleMembers(item.visitId)}
                    >
                      {t(
                        membersExpanded
                          ? 'visits.history.hideMembers'
                          : 'visits.history.viewMembers'
                      )}
                    </button>
                  )}

                  {isGroup && membersExpanded && (
                    <section
                      id={membersPanelId}
                      className="history-members-panel"
                      aria-labelledby={`${membersPanelId}-title`}
                    >
                      <h4 id={`${membersPanelId}-title`}>
                        {t('visits.history.membersTitle')}
                      </h4>

                      {loadingMembers ? (
                        <p className="history-members-feedback" role="status">
                          {t('visits.history.loadingMembers')}
                        </p>
                      ) : membersError ? (
                        <p
                          className="history-members-feedback field-error"
                          role="alert"
                        >
                          {membersError}
                        </p>
                      ) : (
                        <ul className="history-members-list">
                          {(members ?? []).map((member, index) => {
                            const memberName =
                              `${member.firstName} ${member.lastName}`.trim();
                            const returnedEarlyAt =
                              member.memberStatus === 'returned_early'
                                ? member.checkedOutAt
                                : null;

                            return (
                              <li
                                key={`${memberName}-${member.memberRole}-${index}`}
                              >
                                <strong>{memberName}</strong>
                                <span>
                                  {member.memberRole === 'leader' && (
                                    <>
                                      {t('visits.history.organizer')}
                                      {' · '}
                                    </>
                                  )}
                                  {t(
                                    `visits.history.memberStatus.${historyMemberStatusKey(member.memberStatus)}`
                                  )}
                                  {returnedEarlyAt && (
                                    <>
                                      {' · '}
                                      <time dateTime={returnedEarlyAt}>
                                        {formatHistoryTime(
                                          returnedEarlyAt,
                                          language
                                        )}
                                      </time>
                                    </>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      {hasMore && (
        <button
          className="secondary-button history-more-button"
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
        >
          {t(
            loadingMore
              ? 'visits.history.loadingMore'
              : 'visits.history.loadMore'
          )}
        </button>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../../i18n';
import { getVisitErrorMessage } from './visit-errors';
import { getMyVisitHistory } from './visit-service';
import type { VisitHistoryItem } from './visit-types';

const PAGE_SIZE = 10;

function formatVisitDate(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(language === 'es' ? 'es-GT' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
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

export function VisitHistory() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<VisitHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            const groupLabel =
              item.participantCount <= 1
                ? t('visits.history.individual')
                : item.memberRole === 'leader'
                  ? t('visits.history.groupOrganizer')
                  : t('visits.history.group');

            return (
              <li key={item.visitId}>
                <time dateTime={item.visitDate}>
                  {formatVisitDate(item.visitDate, language)}
                </time>
                <strong>{t(`visits.types.${item.visitType}`)}</strong>
                <span>{routeName}</span>
                <span>{groupLabel}</span>
                <em>{t(`visits.history.status.${historyStatusKey(item)}`)}</em>
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

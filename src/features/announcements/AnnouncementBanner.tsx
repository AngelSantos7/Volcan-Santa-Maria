import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppLanguage } from '../../i18n';
import { getAnnouncements } from './announcement-service';
import type {
  Announcement,
  AnnouncementPlacement,
  AnnouncementType,
} from './announcement-types';

const DISMISSED_STORAGE_KEY = 'dismissed-announcements:v1';

function readDismissedIds(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(DISMISSED_STORAGE_KEY) ?? '[]'
    );
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : []
    );
  } catch {
    return new Set();
  }
}

function storeDismissedIds(ids: Set<string>): void {
  try {
    window.localStorage.setItem(
      DISMISSED_STORAGE_KEY,
      JSON.stringify([...ids])
    );
  } catch {
    // Dismissal still applies for the current component lifecycle.
  }
}

function announcementIcon(type: AnnouncementType): string {
  if (type === 'environmental') return '🌱';
  if (type === 'warning') return '⚠';
  if (type === 'event') return '◆';
  return 'i';
}

type AnnouncementBannerProps = {
  placement: AnnouncementPlacement;
};

export function AnnouncementBanner({ placement }: AnnouncementBannerProps) {
  const { t, i18n } = useTranslation();
  const language = getAppLanguage(i18n.resolvedLanguage);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedIds, setDismissedIds] = useState(readDismissedIds);

  useEffect(() => {
    let active = true;
    void getAnnouncements(placement)
      .then((nextAnnouncements) => {
        if (active) setAnnouncements(nextAnnouncements);
      })
      .catch(() => {
        // Informational announcements never block the surrounding screen.
      });
    return () => {
      active = false;
    };
  }, [placement]);

  const current = useMemo(
    () =>
      announcements.find(
        (announcement) => !dismissedIds.has(announcement.id)
      ) ?? null,
    [announcements, dismissedIds]
  );

  if (!current) return null;

  const title =
    language === 'es' ? current.titleEs : (current.titleEn ?? current.titleEs);
  const message =
    language === 'es'
      ? current.messageEs
      : (current.messageEn ?? current.messageEs);
  const dismiss = () => {
    if (!current.dismissible) return;
    setDismissedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(current.id);
      storeDismissedIds(nextIds);
      return nextIds;
    });
  };

  return (
    <aside
      className={`announcement-banner announcement-${current.type}`}
      aria-labelledby={`announcement-title-${current.id}`}
    >
      <span className="announcement-icon" aria-hidden="true">
        {announcementIcon(current.type)}
      </span>
      <div>
        {title && <h2 id={`announcement-title-${current.id}`}>{title}</h2>}
        <p>{message}</p>
        {current.dismissible && (
          <button className="text-button" type="button" onClick={dismiss}>
            {t('announcements.understood')}
          </button>
        )}
      </div>
      {current.dismissible && (
        <button
          className="announcement-close"
          type="button"
          onClick={dismiss}
          aria-label={t('announcements.dismiss')}
        >
          ×
        </button>
      )}
    </aside>
  );
}

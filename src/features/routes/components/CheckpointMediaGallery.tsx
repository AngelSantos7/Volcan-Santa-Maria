import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../../../i18n';
import type { RouteMedia } from '../route-types';

type CheckpointMediaGalleryProps = {
  media: RouteMedia[];
  fallbackAlt: string;
  language: AppLanguage;
  onMediaError: (mediaId: string) => void;
  compact?: boolean;
};

export function CheckpointMediaGallery({
  media,
  fallbackAlt,
  language,
  onMediaError,
  compact = false,
}: CheckpointMediaGalleryProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (compact || paused || media.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = window.setInterval(
      () => setIndex((currentIndex) => (currentIndex + 1) % media.length),
      6_000
    );
    return () => window.clearInterval(interval);
  }, [compact, media.length, paused]);

  if (media.length === 0) return null;

  const safeIndex = Math.min(index, media.length - 1);
  const current = media[safeIndex];
  const caption = language === 'es' ? current.captionEs : current.captionEn;
  const title = language === 'es' ? current.titleEs : current.titleEn;
  const description =
    language === 'es' ? current.descriptionEs : current.descriptionEn;
  const move = (direction: number) => {
    setIndex(
      (currentIndex) =>
        (currentIndex + direction + media.length) % media.length
    );
  };

  return (
    <div
      className={`checkpoint-gallery${compact ? ' compact' : ''}`}
      onTouchStart={(event) => {
        touchStartRef.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartRef.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 45)
          return;
        move(end < start ? 1 : -1);
      }}
    >
      <figure>
        <img
          src={current.publicUrl}
          alt={caption ?? fallbackAlt}
          loading="lazy"
          onError={() => onMediaError(current.id)}
        />
        {(title || caption || description) && (
          <figcaption>
            {title && <strong>{title}</strong>}
            {(description || caption) && <span>{description ?? caption}</span>}
          </figcaption>
        )}
      </figure>
      {media.length > 1 && (
        <div className="checkpoint-gallery-controls">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label={t('routes.photos.previous')}
          >
            ‹
          </button>
          <div className="gallery-dots" aria-label={t('routes.photos.position', { current: safeIndex + 1, total: media.length })}>
            {media.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                className={itemIndex === safeIndex ? 'active' : ''}
                onClick={() => setIndex(itemIndex)}
                aria-label={t('routes.photos.goTo', { number: itemIndex + 1 })}
                aria-current={itemIndex === safeIndex ? 'true' : undefined}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label={t('routes.photos.next')}
          >
            ›
          </button>
          {!compact && (
            <button
              type="button"
              className="gallery-pause"
              onClick={() => setPaused((current) => !current)}
              aria-pressed={paused}
            >
              {t(paused ? 'routes.photos.resume' : 'routes.photos.pause')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

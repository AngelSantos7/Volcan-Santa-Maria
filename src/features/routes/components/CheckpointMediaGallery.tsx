import { useState } from 'react';
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

  if (media.length === 0) return null;

  const safeIndex = Math.min(index, media.length - 1);
  const current = media[safeIndex];
  const caption = language === 'es' ? current.captionEs : current.captionEn;

  return (
    <div className={`checkpoint-gallery${compact ? ' compact' : ''}`}>
      <figure>
        <img
          src={current.publicUrl}
          alt={caption ?? fallbackAlt}
          loading="lazy"
          onError={() => onMediaError(current.id)}
        />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
      {media.length > 1 && (
        <div className="checkpoint-gallery-controls">
          <button
            type="button"
            onClick={() =>
              setIndex(
                (currentIndex) =>
                  (currentIndex - 1 + media.length) % media.length
              )
            }
            aria-label={t('routes.photos.previous')}
          >
            ‹
          </button>
          <span>
            {t('routes.photos.position', {
              current: safeIndex + 1,
              total: media.length,
            })}
          </span>
          <button
            type="button"
            onClick={() =>
              setIndex((currentIndex) => (currentIndex + 1) % media.length)
            }
            aria-label={t('routes.photos.next')}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

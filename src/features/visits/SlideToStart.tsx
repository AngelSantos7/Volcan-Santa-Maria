import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

type SlideToStartProps = {
  onComplete: () => Promise<void>;
  disabled?: boolean;
};

const COMPLETE_THRESHOLD = 90;

export function SlideToStart({
  onComplete,
  disabled = false,
}: SlideToStartProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const activePointerRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [activating, setActivating] = useState(false);

  const progressAt = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;

    const availableDistance = Math.max(track.clientWidth - 64, 1);
    const distance = Math.max(clientX - startXRef.current, 0);
    return Math.min((distance / availableDistance) * 100, 100);
  };

  const activate = async () => {
    if (disabled || activating) return;

    setActivating(true);
    setProgress(100);

    try {
      await onComplete();
    } finally {
      setActivating(false);
      setProgress(0);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || activating) return;

    activePointerRef.current = event.pointerId;
    startXRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
    setProgress(0);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    setProgress(progressAt(event.clientX));
  };

  const finishPointerGesture = (event: PointerEvent<HTMLButtonElement>) => {
    if (activePointerRef.current !== event.pointerId) return;

    const finalProgress = progressAt(event.clientX);
    activePointerRef.current = null;

    if (finalProgress >= COMPLETE_THRESHOLD) {
      void activate();
    } else {
      setProgress(0);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || activating) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setProgress((current) => Math.min(current + 20, 100));
    } else if (event.key === 'ArrowLeft' || event.key === 'Home') {
      event.preventDefault();
      setProgress(0);
    } else if (
      (event.key === 'Enter' || event.key === ' ') &&
      progress === 100
    ) {
      event.preventDefault();
      void activate();
    }
  };

  return (
    <div
      ref={trackRef}
      className="start-slider"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={t('visits.start.slide')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      aria-disabled={disabled || activating}
      onKeyDown={handleKeyDown}
    >
      <span className="start-slider-label">
        {t(activating ? 'visits.start.starting' : 'visits.start.slide')}
      </span>
      <button
        className="start-slider-handle"
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        style={{ left: `calc(${progress}% - ${progress * 0.56}px)` }}
        disabled={disabled || activating}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
        onPointerCancel={() => {
          activePointerRef.current = null;
          setProgress(0);
        }}
      >
        →
      </button>
    </div>
  );
}

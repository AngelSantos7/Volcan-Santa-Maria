import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ToastContext,
  type ToastContextValue,
  type ToastTone,
} from './toast-context';

type ToastState = {
  id: number;
  message: string;
  description?: string;
  tone: ToastTone;
};

type ToastProviderProps = {
  children: ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const { t } = useTranslation();
  const nextId = useRef(0);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success', description?: string) => {
      nextId.current += 1;
      setToast({ id: nextId.current, message, tone, description });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={`toast-region${toast ? ' is-visible' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {toast && (
          <div className={`toast toast-${toast.tone}`} role="status">
            <span className="toast-mark" aria-hidden="true">
              {toast.tone === 'success'
                ? '✓'
                : toast.tone === 'error'
                  ? '!'
                  : 'i'}
            </span>
            <div className="toast-content">
              <p>{toast.message}</p>
              {toast.description && (
                <p className="toast-description">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label={t('common.closeNotification')}
              onClick={() => setToast(null)}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

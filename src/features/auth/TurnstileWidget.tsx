import { useEffect, useRef } from 'react';

type TurnstileRenderOptions = {
  sitekey: string;
  theme: 'auto';
  action: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT_SELECTOR = 'script[data-volcan-turnstile]';
let turnstilePromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstilePromise) return turnstilePromise;

  turnstilePromise = new Promise<TurnstileApi>((resolve, reject) => {
    const handleLoad = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(new Error('Turnstile unavailable'));
      }
    };
    const handleError = () => {
      document
        .querySelector<HTMLScriptElement>(TURNSTILE_SCRIPT_SELECTOR)
        ?.remove();
      reject(new Error('Turnstile failed to load'));
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      TURNSTILE_SCRIPT_SELECTOR
    );
    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.volcanTurnstile = 'true';
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.head.append(script);
  }).catch((error: unknown) => {
    turnstilePromise = null;
    throw error;
  });

  return turnstilePromise;
}

type TurnstileWidgetProps = {
  siteKey: string;
  action: string;
  resetKey: number;
  onTokenChange: (token: string | null) => void;
  onExpire: () => void;
  onError: () => void;
};

export function TurnstileWidget({
  siteKey,
  action,
  resetKey,
  onTokenChange,
  onExpire,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onTokenChange, onExpire, onError });

  useEffect(() => {
    callbacksRef.current = { onTokenChange, onExpire, onError };
  }, [onTokenChange, onExpire, onError]);

  useEffect(() => {
    let active = true;
    let widgetId: string | null = null;

    void loadTurnstile()
      .then((turnstile) => {
        if (!active || !containerRef.current) return;

        widgetId = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          action,
          callback: (token) => callbacksRef.current.onTokenChange(token),
          'expired-callback': () => {
            callbacksRef.current.onTokenChange(null);
            callbacksRef.current.onExpire();
          },
          'error-callback': () => {
            callbacksRef.current.onTokenChange(null);
            callbacksRef.current.onError();
          },
        });
      })
      .catch(() => {
        if (active) callbacksRef.current.onError();
      });

    return () => {
      active = false;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [action, resetKey, siteKey]);

  return <div className="turnstile-widget" ref={containerRef} />;
}

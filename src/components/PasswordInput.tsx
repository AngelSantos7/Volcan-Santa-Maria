import { useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function PasswordInput(props: PasswordInputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <span className="password-input-wrap">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        className="password-visibility-button"
        type="button"
        onClick={() => setVisible((current) => !current)}
        disabled={props.disabled}
        aria-label={t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
        aria-pressed={visible}
        title={t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          {visible ? (
            <>
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 002.8 2.8" />
              <path d="M9.9 4.3A10.8 10.8 0 0112 4c5.5 0 9 5 9 5a15 15 0 01-2.2 2.7M6.6 6.6C4.3 8 3 10 3 10s3.5 5 9 5a9.7 9.7 0 003.2-.5" />
            </>
          ) : (
            <>
              <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5z" />
              <circle cx="12" cy="12" r="2.5" />
            </>
          )}
        </svg>
      </button>
    </span>
  );
}

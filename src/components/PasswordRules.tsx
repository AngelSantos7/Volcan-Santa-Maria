import { useTranslation } from 'react-i18next';
import { passwordChecks } from '../../shared/account-policy';

export function PasswordRules({ password }: { password: string }) {
  const { t } = useTranslation();
  return <span className="password-rules" aria-live="polite">
    {Object.entries(passwordChecks(password)).map(([key, valid]) =>
      <span key={key} className={valid ? 'rule-valid' : ''}>{valid ? '✓' : '○'} {t(`final.password.${key}`)}</span>
    )}
  </span>;
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getShortName, maskEmail } from '../features/profile/avatar-utils';
import type { AvatarIdentity } from '../features/profile/profile-types';
import { UserAvatar } from './UserAvatar';
import { useTheme } from '../features/theme/theme-context';

type UserMenuProps = {
  identity: AvatarIdentity;
  email: string;
  disabled?: boolean;
  onEditProfile: () => void;
  onOpenLegal: () => void;
  onSignOut: () => void;
};

export function UserMenu({
  identity,
  email,
  disabled = false,
  onEditProfile,
  onOpenLegal,
  onSignOut,
}: UserMenuProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fullName = `${identity.firstName} ${identity.lastName}`.trim();
  const shortName = getShortName(identity.firstName, identity.lastName, email);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  const editProfile = () => {
    setOpen(false);
    onEditProfile();
  };

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        className="user-menu-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
      >
        <UserAvatar {...identity} />
        <span className="user-menu-name">
          {shortName || t('auth.myProfile')}
        </span>
        <svg
          className={`user-menu-chevron${open ? ' is-open' : ''}`}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      {open && (
        <div className="user-menu-popover" role="menu">
          <div className="user-menu-heading">
            <UserAvatar {...identity} className="profile-avatar--menu" />
            <div>
              <strong>{fullName || email}</strong>
              <span>{maskEmail(email)}</span>
            </div>
          </div>
          <button type="button" role="menuitem" onClick={editProfile}>
            {t('auth.editProfile')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenLegal();
            }}
          >
            {t('legal.menu')}
          </button>
          <div className="theme-menu-control" role="group" aria-label={t('theme.label')}>
            <span>{t('theme.label')}</span>
            <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
              {t('theme.light')}
            </button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
              {t('theme.dark')}
            </button>
          </div>
          <hr />
          <button
            className="user-menu-signout"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            {t(disabled ? 'common.signingOut' : 'common.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

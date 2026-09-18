import { useEffect, useState } from 'react';
import { createAvatarSignedUrl } from '../features/profile/profile-service';
import {
  AVATAR_PRESET_GLYPHS,
  getInitials,
} from '../features/profile/avatar-utils';
import type {
  AvatarKind,
  AvatarPreset,
} from '../features/profile/profile-types';

type UserAvatarProps = {
  firstName: string;
  lastName: string;
  avatarKind?: AvatarKind | null;
  avatarPath?: string | null;
  avatarPreset?: AvatarPreset | null;
  avatarUrl?: string | null;
  className?: string;
};

export function UserAvatar({
  firstName,
  lastName,
  avatarKind,
  avatarPath,
  avatarPreset,
  avatarUrl,
  className = '',
}: UserAvatarProps) {
  const [signedAvatar, setSignedAvatar] = useState<{
    path: string;
    url: string | null;
  } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (avatarUrl || !avatarPath) return;

    void createAvatarSignedUrl(avatarPath).then((url) => {
      if (active) setSignedAvatar({ path: avatarPath, url });
    });
    return () => {
      active = false;
    };
  }, [avatarPath, avatarUrl]);

  const candidateUrl =
    avatarUrl ??
    (signedAvatar && signedAvatar.path === avatarPath
      ? signedAvatar.url
      : null);
  const resolvedUrl = candidateUrl === failedUrl ? null : candidateUrl;

  const preset = avatarPreset ?? 'mountain';
  const classes =
    `profile-avatar profile-avatar--${preset} ${className}`.trim();

  if (avatarKind === 'uploaded' && resolvedUrl) {
    return (
      <span className={classes} aria-hidden="true">
        <img
          src={resolvedUrl}
          alt=""
          onError={() => setFailedUrl(resolvedUrl)}
        />
      </span>
    );
  }

  if (avatarKind === 'preset' && avatarPreset) {
    return (
      <span className={classes} aria-hidden="true">
        {AVATAR_PRESET_GLYPHS[avatarPreset]}
      </span>
    );
  }

  return (
    <span className={`${classes} profile-avatar--initials`} aria-hidden="true">
      {getInitials(firstName, lastName)}
    </span>
  );
}

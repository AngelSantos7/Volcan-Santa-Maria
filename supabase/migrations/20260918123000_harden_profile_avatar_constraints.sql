alter table public.profiles
  drop constraint profiles_avatar_consistent,
  add constraint profiles_avatar_preset_valid check (
    avatar_preset is null
    or avatar_preset in (
      'mountain',
      'volcano',
      'pine',
      'compass',
      'hiking',
      'sunrise',
      'forest',
      'summit'
    )
  ),
  add constraint profiles_avatar_consistent check (
    (
      avatar_kind is null
      and avatar_path is null
      and avatar_preset is null
    )
    or (
      avatar_kind = 'uploaded'
      and avatar_path = id::text || '/avatar.webp'
      and avatar_preset is null
    )
    or (
      avatar_kind = 'preset'
      and avatar_path is null
      and nullif(btrim(avatar_preset), '') is not null
    )
    or (
      avatar_kind = 'initials'
      and avatar_path is null
      and avatar_preset is null
    )
  );

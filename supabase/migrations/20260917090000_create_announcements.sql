create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title_es text,
  title_en text,
  message_es text not null,
  message_en text,
  announcement_type text not null default 'info',
  priority integer not null default 0,
  show_on_login boolean not null default true,
  show_on_create_ascent boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  dismissible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_type_allowed check (
    announcement_type in ('info', 'environmental', 'warning', 'event')
  ),
  constraint announcements_date_range_valid check (
    ends_at is null or starts_at is null or ends_at > starts_at
  ),
  constraint announcements_message_es_not_blank check (
    nullif(btrim(message_es), '') is not null
  )
);

create index announcements_active_window_priority_idx
on public.announcements (is_active, priority desc, starts_at, ends_at);

create or replace function public.set_announcements_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke execute on function public.set_announcements_updated_at()
from public, anon, authenticated;

create trigger announcements_before_update_set_updated_at
before update on public.announcements
for each row execute function public.set_announcements_updated_at();

alter table public.announcements enable row level security;

revoke all on table public.announcements from public, anon, authenticated;
grant select on table public.announcements to anon, authenticated;

create policy announcements_read_current
on public.announcements
for select
to anon, authenticated
using (
  is_active
  and (starts_at is null or starts_at <= pg_catalog.now())
  and (ends_at is null or ends_at > pg_catalog.now())
);

insert into public.announcements (
  title_es,
  title_en,
  message_es,
  message_en,
  announcement_type,
  dismissible
)
values (
  'Cuida el Volcán Santa María',
  'Protect Santa María Volcano',
  'No dejes basura en el trayecto. Conservemos limpio nuestro entorno natural.',
  'Do not leave trash along the trail. Help us keep the natural environment clean.',
  'environmental',
  true
);

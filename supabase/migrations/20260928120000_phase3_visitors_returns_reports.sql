-- Phase 3 is intentionally incremental. It does not rewrite existing rows.

alter table public.profiles
  add column if not exists document_type_detail text;

alter table public.emergency_contacts
  alter column phone drop not null;

alter table public.visit_members
  add column if not exists administrative_return_reason_detail text;

alter table public.visit_members drop constraint if exists visit_members_administrative_return_reason_valid;
alter table public.visit_members add constraint visit_members_administrative_return_reason_valid check (
  administrative_return_reason is null or administrative_return_reason in (
    'confirmed_in_person', 'phone_battery', 'no_connection',
    'forgot_to_finish', 'early_return', 'other'
  )
);
alter table public.visit_members add constraint visit_members_administrative_return_reason_detail_length
  check (administrative_return_reason_detail is null or char_length(administrative_return_reason_detail) <= 200);

alter table public.visit_members drop constraint if exists visit_members_return_state_consistent;
alter table public.visit_members add constraint visit_members_return_state_consistent check (
  (member_status in ('active', 'withdrawn_before_start') and return_started_at is null and exit_reason is null and exit_notes is null and checked_out_at is null and checkout_method is null and checked_out_by is null)
  or (member_status = 'completed' and return_started_at is null and exit_reason is null and exit_notes is null and checked_out_at is null and checkout_method is null and checked_out_by is null)
  or (member_status = 'completed' and return_started_at is null and exit_reason is null and exit_notes is null and checked_out_at is not null and ((checkout_method = 'self' and checked_out_by is null) or (checkout_method = 'staff' and checked_out_by is not null)))
  or (member_status = 'returning_early' and return_started_at is not null and nullif(btrim(exit_reason), '') is not null and checked_out_at is null and checkout_method is null and checked_out_by is null)
  or (member_status = 'returned_early' and return_started_at is not null and nullif(btrim(exit_reason), '') is not null and checked_out_at is not null and checked_out_at >= return_started_at and ((checkout_method = 'self' and checked_out_by is null) or (checkout_method = 'staff' and checked_out_by is not null)))
);

create or replace function public.is_supported_country_code(p_code text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select pg_catalog.upper(pg_catalog.btrim(p_code)) = any(array[
    'AF','AL','DZ','AS','AD','AO','AI','AQ','AG','AR','AM','AW','AU','AT','AZ','BS','BH','BD','BB','BY','BE','BZ','BJ','BM','BT','BO','BA','BW','BV','BR','IO','BN','BG','BF','BI','KH','CM','CA','CV','KY','CF','TD','CL','CN','CX','CC','CO','KM','CG','CD','CK','CR','CI','HR','CU','CY','CZ','DK','DJ','DM','DO','EC','EG','SV','GQ','ER','EE','ET','FK','FO','FJ','FI','FR','GF','PF','TF','GA','GM','GE','DE','GH','GI','GR','GL','GD','GP','GU','GT','GN','GW','GY','HT','HM','VA','HN','HK','HU','IS','IN','ID','IR','IQ','IE','IL','IT','JM','JP','JO','KZ','KE','KI','KP','KR','KW','KG','LA','LV','LB','LS','LR','LY','LI','LT','LU','MO','MG','MW','MY','MV','ML','MT','MH','MQ','MR','MU','YT','MX','FM','MD','MC','MN','MS','MA','MZ','MM','NA','NR','NP','NL','NC','NZ','NI','NE','NG','NU','NF','MP','MK','NO','OM','PK','PW','PS','PA','PG','PY','PE','PH','PN','PL','PT','PR','QA','RE','RO','RU','RW','SH','KN','LC','PM','VC','WS','SM','ST','SA','SN','SC','SL','SG','SK','SI','SB','SO','ZA','GS','ES','LK','SD','SR','SJ','SZ','SE','CH','SY','TW','TJ','TZ','TH','TL','TG','TK','TO','TT','TN','TR','TM','TC','TV','UG','UA','AE','GB','US','UM','UY','UZ','VU','VE','VN','VG','VI','WF','EH','YE','ZM','ZW','AX','BQ','CW','GG','IM','JE','ME','BL','MF','RS','SX','SS','XK'
  ]::text[]);
$$;
revoke all on function public.is_supported_country_code(text) from public, anon, authenticated;

create or replace function public.staff_find_visitor(p_document_type text, p_document_number text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare normalized_type text := lower(btrim(p_document_type)); normalized_number text := upper(regexp_replace(p_document_number, '\s+', '', 'g')); result jsonb;
begin
  if not (public.has_staff_permission('can_register_walk_in_visitors') or public.has_staff_permission('can_manage_visits')) then raise exception using errcode = '42501', message = 'Walk-in visitor permission is required.'; end if;
  if normalized_type not in ('dpi', 'passport', 'other') or nullif(normalized_number, '') is null then raise exception using errcode = '22023', message = 'A valid identity document is required.'; end if;
  select jsonb_build_object('visitor_id', profile.id, 'full_name', concat_ws(' ', profile.first_name, profile.last_name), 'first_name', profile.first_name, 'last_name', profile.last_name, 'nationality_country_code', profile.nationality_country_code, 'registration_origin', profile.registration_origin) into result
  from public.profiles profile where profile.document_type::text = normalized_type and upper(regexp_replace(profile.document_number, '\s+', '', 'g')) = normalized_number order by profile.created_at limit 1;
  return result;
end; $$;

create function public.staff_register_walk_in_visitor(
  p_first_name text, p_last_name text, p_nationality_country_code text, p_date_of_birth date,
  p_phone text, p_alternate_phone text, p_document_type text, p_document_type_detail text,
  p_document_number text, p_emergency_first_name text, p_emergency_last_name text,
  p_emergency_relationship text, p_emergency_phone text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); new_visitor_id uuid := extensions.gen_random_uuid(); request_time timestamptz := clock_timestamp();
  normalized_first_name text := nullif(btrim(p_first_name), ''); normalized_last_name text := nullif(btrim(p_last_name), '');
  normalized_country text := upper(btrim(p_nationality_country_code)); normalized_type text := lower(btrim(p_document_type));
  normalized_detail text := nullif(btrim(p_document_type_detail), ''); normalized_number text := upper(regexp_replace(p_document_number, '\s+', '', 'g')); existing_id uuid;
begin
  if current_user_id is null or not public.has_staff_permission('can_register_walk_in_visitors') then raise exception using errcode = '42501', message = 'Walk-in visitor permission is required.'; end if;
  if normalized_first_name is null or normalized_last_name is null or not public.is_supported_country_code(normalized_country)
    or p_date_of_birth is null or p_date_of_birth > current_date or p_date_of_birth < current_date - interval '120 years'
    or normalized_type not in ('dpi', 'passport', 'other') or (normalized_type = 'other' and normalized_detail is null)
    or nullif(normalized_number, '') is null or nullif(btrim(p_emergency_first_name), '') is null
    or nullif(btrim(p_emergency_last_name), '') is null or nullif(btrim(p_emergency_relationship), '') is null
    or (nullif(btrim(p_phone), '') is null and nullif(btrim(p_alternate_phone), '') is null and nullif(btrim(p_emergency_phone), '') is null)
    or (nullif(btrim(p_phone), '') is not null and btrim(p_phone) !~ '^\+[1-9][0-9]{1,14}$')
    or (nullif(btrim(p_alternate_phone), '') is not null and btrim(p_alternate_phone) !~ '^\+[1-9][0-9]{1,14}$')
    or (nullif(btrim(p_emergency_phone), '') is not null and btrim(p_emergency_phone) !~ '^\+[1-9][0-9]{1,14}$')
  then raise exception using errcode = '22023', message = 'Required visitor information is incomplete or invalid.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(normalized_type || ':' || normalized_number, 0));
  select id into existing_id from public.profiles where document_type::text = normalized_type and upper(regexp_replace(document_number, '\s+', '', 'g')) = normalized_number limit 1;
  if existing_id is not null then raise exception using errcode = '23505', message = 'A visitor with this identity document already exists.'; end if;
  insert into public.profiles (id, first_name, last_name, nationality_country_code, date_of_birth, phone, alternate_phone, document_type, document_type_detail, document_number, registration_origin, registered_by, registered_at)
  values (new_visitor_id, normalized_first_name, normalized_last_name, normalized_country, p_date_of_birth, nullif(btrim(p_phone), ''), nullif(btrim(p_alternate_phone), ''), normalized_type::public.document_type, case when normalized_type = 'other' then normalized_detail end, btrim(p_document_number), 'administrative', current_user_id, request_time);
  insert into public.emergency_contacts (user_id, first_name, last_name, relationship, phone) values (new_visitor_id, btrim(p_emergency_first_name), btrim(p_emergency_last_name), btrim(p_emergency_relationship), nullif(btrim(p_emergency_phone), ''));
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata) values (current_user_id, 'administrative_visitor_created', 'visitor', new_visitor_id::text, jsonb_build_object('origin', 'administrative'));
  return jsonb_build_object('visitor_id', new_visitor_id, 'first_name', normalized_first_name, 'last_name', normalized_last_name, 'registration_origin', 'administrative', 'registered_at', request_time);
end; $$;
revoke all on function public.staff_register_walk_in_visitor(text,text,text,date,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.staff_register_walk_in_visitor(text,text,text,date,text,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.complete_my_visit_participation(visit_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); current_status public.visit_member_status; visit_status public.visit_status; completion_time timestamptz := clock_timestamp();
begin
  if current_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  select member.member_status, visit.status into current_status, visit_status from public.visit_members member join public.visits visit on visit.id = member.visit_id where member.visit_id = $1 and member.user_id = current_user_id for update of member, visit;
  if current_status is null then raise exception using errcode = 'P0002', message = 'Visit membership was not found.'; end if;
  if current_status in ('completed', 'returned_early') then return $1; end if;
  if visit_status <> 'in_progress' or current_status <> 'active' then raise exception using errcode = 'P0001', message = 'This participation cannot be completed normally.'; end if;
  update public.visit_members as target set member_status = 'completed', checked_out_at = completion_time, checkout_method = 'self', checked_out_by = null where target.visit_id = $1 and target.user_id = current_user_id and target.member_status = 'active';
  if not exists (select 1 from public.visit_members as pending where pending.visit_id = $1 and pending.member_status in ('active', 'returning_early')) then update public.visits set status = 'completed', completed_at = completion_time where id = $1 and status = 'in_progress'; end if;
  return $1;
end; $$;
revoke all on function public.complete_my_visit_participation(uuid) from public, anon, authenticated;
grant execute on function public.complete_my_visit_participation(uuid) to authenticated;

create function public.staff_register_administrative_return(p_visit_id uuid, p_user_id uuid, p_reason text, p_notes text default null, p_effective_return_at timestamptz default null, p_reason_detail text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); request_time timestamptz := clock_timestamp(); effective_time timestamptz := coalesce(p_effective_return_at, clock_timestamp()); normalized_reason text := lower(btrim(p_reason)); normalized_notes text := nullif(btrim(p_notes), ''); normalized_detail text := nullif(btrim(p_reason_detail), ''); previous_status public.visit_member_status; group_completed boolean := false;
begin
  if current_user_id is null or not public.has_staff_permission('can_confirm_returns') then raise exception using errcode = '42501', message = 'Return confirmation permission is required.'; end if;
  if normalized_reason not in ('confirmed_in_person','phone_battery','no_connection','forgot_to_finish','early_return','other') or (normalized_reason = 'other' and normalized_detail is null) or char_length(coalesce(normalized_detail,'')) > 200 or char_length(coalesce(normalized_notes,'')) > 1000 or effective_time > request_time + interval '5 minutes' then raise exception using errcode = '22023', message = 'Invalid administrative return information.'; end if;
  select member.member_status into previous_status from public.visit_members member where member.visit_id = p_visit_id and member.user_id = p_user_id for update;
  if previous_status is null then raise exception using errcode = 'P0002', message = 'Visit membership was not found.'; end if;
  if previous_status in ('completed','returned_early') then return jsonb_build_object('visit_id',p_visit_id,'visitor_id',p_user_id,'already_confirmed',true); end if;
  if previous_status not in ('active','returning_early') or not exists (select 1 from public.visits where id = p_visit_id and status = 'in_progress') then raise exception using errcode = 'P0001', message = 'This participant is not awaiting a return confirmation.'; end if;
  update public.visit_members set member_status = case when previous_status = 'returning_early' or normalized_reason = 'early_return' then 'returned_early'::public.visit_member_status else 'completed'::public.visit_member_status end,
    return_started_at = case when previous_status = 'returning_early' then return_started_at when normalized_reason = 'early_return' then effective_time else null end,
    exit_reason = case when previous_status = 'returning_early' then exit_reason when normalized_reason = 'early_return' then 'administrative_return' else null end,
    checked_out_at = effective_time, checkout_method = 'staff', checked_out_by = current_user_id, administrative_return_reason = normalized_reason,
    administrative_return_reason_detail = normalized_detail, administrative_return_notes = normalized_notes, administrative_return_recorded_at = request_time,
    administrative_return_retrospective = effective_time < request_time - interval '1 minute' where visit_id = p_visit_id and user_id = p_user_id;
  if not exists (select 1 from public.visit_members where visit_id = p_visit_id and member_status in ('active','returning_early')) then update public.visits set status = 'completed', completed_at = request_time where id = p_visit_id and status = 'in_progress'; group_completed := found; end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata) values (current_user_id,'administrative_individual_return_recorded','visitor',p_user_id::text,jsonb_strip_nulls(jsonb_build_object('visit_id',p_visit_id,'reason',normalized_reason,'reason_detail',normalized_detail,'effective_return_at',effective_time,'retrospective',effective_time < request_time - interval '1 minute')));
  return jsonb_build_object('visit_id',p_visit_id,'visitor_id',p_user_id,'effective_return_at',effective_time,'group_completed',group_completed);
end; $$;

create function public.staff_register_administrative_group_return(p_visit_id uuid, p_reason text, p_notes text default null, p_effective_return_at timestamptz default null, p_reason_detail text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare member_record record; returned_count integer := 0;
begin
  if auth.uid() is null or not public.has_staff_permission('can_confirm_returns') then raise exception using errcode = '42501', message = 'Return confirmation permission is required.'; end if;
  for member_record in select user_id from public.visit_members where visit_id = p_visit_id and member_status in ('active','returning_early') order by joined_at loop
    perform public.staff_register_administrative_return(p_visit_id,member_record.user_id,p_reason,p_notes,p_effective_return_at,p_reason_detail); returned_count := returned_count + 1;
  end loop;
  if returned_count > 0 then insert into public.audit_logs (actor_user_id,action,target_type,target_id,metadata) values (auth.uid(),'administrative_group_return_recorded','visit',p_visit_id::text,jsonb_build_object('participant_count',returned_count,'reason',p_reason)); end if;
  return jsonb_build_object('visit_id',p_visit_id,'participant_count',returned_count,'already_confirmed',returned_count = 0);
end; $$;
revoke all on function public.staff_register_administrative_return(uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.staff_register_administrative_group_return(uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.staff_register_administrative_return(uuid,uuid,text,text,timestamptz,text) to authenticated;
grant execute on function public.staff_register_administrative_group_return(uuid,text,text,timestamptz,text) to authenticated;

drop function public.get_my_visit_history(integer, integer);
create function public.get_my_visit_history(p_limit integer default 20, p_offset integer default 0)
returns table (visit_id uuid, visit_date timestamptz, visit_type public.visit_type, visit_status public.visit_status, route_name_es text, route_name_en text, member_role public.visit_member_role, member_status public.visit_member_status, planned_start_at timestamptz, started_at timestamptz, expected_return_at timestamptz, completed_at timestamptz, return_started_at timestamptz, checked_out_at timestamptz, participant_count bigint, creation_origin text, completion_method text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 or p_offset is null or p_offset < 0 then raise exception using errcode = '22023', message = 'Invalid history pagination.'; end if;
  return query select visit.id,coalesce(visit.started_at,visit.planned_start_at,visit.created_at),visit.visit_type,visit.status,route.name_es,route.name_en,member.member_role,member.member_status,visit.planned_start_at,visit.started_at,visit.expected_return_at,visit.completed_at,member.return_started_at,member.checked_out_at,
    (select count(*) from public.visit_members counted where counted.visit_id=visit.id and counted.member_status<>'withdrawn_before_start'),visit.creation_origin,
    case when member.checkout_method='staff' then 'administrative' when member.member_status in ('completed','returned_early') then 'normal' else 'pending' end
  from public.visit_members member join public.visits visit on visit.id=member.visit_id join public.routes route on route.id=visit.route_id
  where member.user_id=auth.uid() and not (visit.status in ('forming','in_progress') and (member.member_status in ('active','returning_early') or (member.member_role='leader' and member.member_status='returned_early'))) order by coalesce(visit.started_at,visit.planned_start_at,visit.created_at) desc,visit.id limit p_limit offset p_offset;
end; $$;
revoke all on function public.get_my_visit_history(integer,integer) from public,anon,authenticated;
grant execute on function public.get_my_visit_history(integer,integer) to authenticated;

alter table public.staff_permissions add column if not exists can_export_reports boolean not null default false;

create or replace function public.has_staff_permission(permission_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); permission_allowed boolean;
begin
  if public.is_admin(current_user_id) then return true; end if; if not public.is_visitor_manager(current_user_id) then return false; end if;
  select case permission_name when 'can_view_visitors' then p.can_view_visitors when 'can_view_sensitive_data' then p.can_view_sensitive_data when 'can_view_identity_documents' then p.can_view_identity_documents when 'can_manage_visits' then p.can_manage_visits when 'can_confirm_returns' then p.can_confirm_returns when 'can_register_walk_in_visitors' then p.can_register_walk_in_visitors when 'can_export_reports' then p.can_export_reports when 'can_manage_announcements' then p.can_manage_announcements when 'can_manage_route' then p.can_manage_route when 'can_manage_users' then p.can_manage_users when 'can_manage_staff' then p.can_manage_staff else false end into permission_allowed from public.staff_permissions p where p.user_id=current_user_id and p.is_active;
  return coalesce(permission_allowed,false);
end; $$;

create or replace function public.get_admin_session() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); result jsonb;
begin
  if current_user_id is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  select jsonb_build_object('user_id',current_user_id,'email',u.email,'first_name',p.first_name,'last_name',p.last_name,'role',r.role::text,'is_active',case when r.role='admin' then true else coalesce(sp.is_active,false) end,'permissions',jsonb_build_object('can_view_visitors',r.role='admin' or coalesce(sp.can_view_visitors,false),'can_view_sensitive_data',r.role='admin' or coalesce(sp.can_view_sensitive_data,false),'can_view_identity_documents',r.role='admin' or coalesce(sp.can_view_identity_documents,false),'can_manage_visits',r.role='admin' or coalesce(sp.can_manage_visits,false),'can_confirm_returns',r.role='admin' or coalesce(sp.can_confirm_returns,false),'can_register_walk_in_visitors',r.role='admin' or coalesce(sp.can_register_walk_in_visitors,false),'can_export_reports',r.role='admin' or coalesce(sp.can_export_reports,false),'can_manage_announcements',r.role='admin' or coalesce(sp.can_manage_announcements,false),'can_manage_route',r.role='admin' or coalesce(sp.can_manage_route,false),'can_manage_users',r.role='admin' or coalesce(sp.can_manage_users,false),'can_manage_staff',r.role='admin' or coalesce(sp.can_manage_staff,false))) into result from public.user_roles r join auth.users u on u.id=r.user_id left join public.profiles p on p.id=r.user_id left join public.staff_permissions sp on sp.user_id=r.user_id where r.user_id=current_user_id;
  return coalesce(result,jsonb_build_object('user_id',current_user_id,'role','tourist','is_active',false,'permissions','{}'::jsonb));
end; $$;

create or replace function public.admin_get_staff_permissions(p_user_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Administrator access is required.'; end if;
  select jsonb_build_object('user_id',r.user_id,'role',r.role::text,'full_name',concat_ws(' ',p.first_name,p.last_name),'email',u.email,'is_active',coalesce(sp.is_active,false),'can_view_visitors',coalesce(sp.can_view_visitors,false),'can_view_sensitive_data',coalesce(sp.can_view_sensitive_data,false),'can_view_identity_documents',coalesce(sp.can_view_identity_documents,false),'can_manage_visits',coalesce(sp.can_manage_visits,false),'can_confirm_returns',coalesce(sp.can_confirm_returns,false),'can_register_walk_in_visitors',coalesce(sp.can_register_walk_in_visitors,false),'can_export_reports',coalesce(sp.can_export_reports,false),'can_manage_announcements',coalesce(sp.can_manage_announcements,false),'can_manage_route',coalesce(sp.can_manage_route,false),'can_manage_users',coalesce(sp.can_manage_users,false),'can_manage_staff',coalesce(sp.can_manage_staff,false),'updated_at',sp.updated_at) into result from public.user_roles r join auth.users u on u.id=r.user_id left join public.profiles p on p.id=r.user_id left join public.staff_permissions sp on sp.user_id=r.user_id where r.user_id=p_user_id and r.role='visitor_manager';
  if result is null then raise exception using errcode='P0002',message='Visitor manager was not found.'; end if; return result;
end; $$;

create or replace function public.admin_update_staff_permissions(p_user_id uuid,p_permissions jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare current_user_id uuid:=auth.uid(); before_value jsonb; after_value jsonb; allowed_keys text[]:=array['can_view_visitors','can_view_sensitive_data','can_view_identity_documents','can_manage_visits','can_confirm_returns','can_register_walk_in_visitors','can_export_reports','can_manage_announcements','can_manage_route','can_manage_users','can_manage_staff'];
begin
  if not public.is_admin(current_user_id) then raise exception using errcode='42501',message='Administrator access is required.'; end if;
  if p_permissions is null or jsonb_typeof(p_permissions)<>'object' or exists(select 1 from jsonb_object_keys(p_permissions) supplied(key) where not supplied.key=any(allowed_keys)) or exists(select 1 from jsonb_each(p_permissions) supplied(key,value) where jsonb_typeof(supplied.value)<>'boolean') then raise exception using errcode='22023',message='Invalid permission payload.'; end if;
  if not exists(select 1 from public.user_roles where user_id=p_user_id and role='visitor_manager') then raise exception using errcode='P0002',message='Visitor manager was not found.'; end if;
  insert into public.staff_permissions(user_id) values(p_user_id) on conflict(user_id) do nothing; select to_jsonb(sp)-'user_id'-'created_at'-'updated_at' into before_value from public.staff_permissions sp where sp.user_id=p_user_id;
  update public.staff_permissions sp set can_view_visitors=coalesce((p_permissions->>'can_view_visitors')::boolean,sp.can_view_visitors),can_view_sensitive_data=coalesce((p_permissions->>'can_view_sensitive_data')::boolean,sp.can_view_sensitive_data),can_view_identity_documents=coalesce((p_permissions->>'can_view_identity_documents')::boolean,sp.can_view_identity_documents),can_manage_visits=coalesce((p_permissions->>'can_manage_visits')::boolean,sp.can_manage_visits),can_confirm_returns=coalesce((p_permissions->>'can_confirm_returns')::boolean,sp.can_confirm_returns),can_register_walk_in_visitors=coalesce((p_permissions->>'can_register_walk_in_visitors')::boolean,sp.can_register_walk_in_visitors),can_export_reports=coalesce((p_permissions->>'can_export_reports')::boolean,sp.can_export_reports),can_manage_announcements=coalesce((p_permissions->>'can_manage_announcements')::boolean,sp.can_manage_announcements),can_manage_route=coalesce((p_permissions->>'can_manage_route')::boolean,sp.can_manage_route),can_manage_users=coalesce((p_permissions->>'can_manage_users')::boolean,sp.can_manage_users),can_manage_staff=coalesce((p_permissions->>'can_manage_staff')::boolean,sp.can_manage_staff) where sp.user_id=p_user_id returning to_jsonb(sp)-'user_id'-'created_at'-'updated_at' into after_value;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values(current_user_id,'staff_permissions_changed','staff_user',p_user_id::text,jsonb_build_object('before',before_value,'after',after_value)); return after_value;
end; $$;

create or replace function public.get_visitor_dashboard_stats(p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.has_staff_permission('can_view_visitors') then raise exception using errcode='42501',message='Visitor access is required.'; end if; perform public.assert_admin_range(p_from,p_to);
  with sizes as (select visit_id,count(*)::integer participant_count from public.visit_members where member_status<>'withdrawn_before_start' group by visit_id),period_visits as (select v.*,coalesce(s.participant_count,0) participant_count from public.visits v left join sizes s on s.visit_id=v.id where coalesce(v.started_at,v.planned_start_at,v.created_at)>=p_from and coalesce(v.started_at,v.planned_start_at,v.created_at)<p_to and v.status<>'cancelled')
  select jsonb_build_object('visitors_registered',(select count(*) from public.profiles where coalesce(registered_at,created_at)>=p_from and coalesce(registered_at,created_at)<p_to),'entries_registered',(select count(*) from public.visit_members m join public.visits v on v.id=m.visit_id where v.started_at>=p_from and v.started_at<p_to and m.member_status<>'withdrawn_before_start'),'exits_registered',(select count(*) from public.visit_members m join public.visits v on v.id=m.visit_id where coalesce(m.checked_out_at,v.completed_at)>=p_from and coalesce(m.checked_out_at,v.completed_at)<p_to and m.member_status in('completed','returned_early')),'currently_on_route',(select count(*) from public.visit_members m join public.visits v on v.id=m.visit_id where v.status='in_progress' and m.member_status in('active','returning_early')),'ascents_total',(select count(*) from period_visits),'ascents_group',(select count(*) from period_visits where participant_count>1),'ascents_individual',(select count(*) from period_visits where participant_count=1),'ascents_started',(select count(*) from public.visits where started_at>=p_from and started_at<p_to),'ascents_scheduled',(select count(*) from public.visits where status='forming' and planned_start_at>=p_from and planned_start_at<p_to),'ascents_completed',(select count(*) from public.visits where completed_at>=p_from and completed_at<p_to),'early_returns',(select count(*) from public.visit_members where member_status='returned_early' and checked_out_at>=p_from and checked_out_at<p_to),'pending_returns',(select count(*) from public.visit_members m join public.visits v on v.id=m.visit_id where v.status='in_progress' and v.expected_return_at<clock_timestamp() and m.member_status in('active','returning_early'))) into result; return result;
end; $$;

create function public.staff_generate_visitor_report(p_from timestamptz,p_to timestamptz,p_report_type text) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb; summary_data jsonb; nationality_data jsonb; detail_data jsonb; generated_time timestamptz:=clock_timestamp();
begin
  if not public.has_staff_permission('can_export_reports') then raise exception using errcode='42501',message='Report export permission is required.'; end if; perform public.assert_admin_range(p_from,p_to); if p_report_type not in('summary','detailed') then raise exception using errcode='22023',message='Invalid report type.'; end if;
  -- Same operational definitions as the dashboard, with the report-only administrative return count.
  with sizes as (select visit_id,count(*)::integer participant_count from public.visit_members where member_status<>'withdrawn_before_start' group by visit_id),period_visits as (select v.*,coalesce(s.participant_count,0) participant_count from public.visits v left join sizes s on s.visit_id=v.id where coalesce(v.started_at,v.planned_start_at,v.created_at)>=p_from and coalesce(v.started_at,v.planned_start_at,v.created_at)<p_to and v.status<>'cancelled')
  select jsonb_build_object('visitors_registered',(select count(*) from public.profiles where coalesce(registered_at,created_at)>=p_from and coalesce(registered_at,created_at)<p_to),'entries_registered',(select count(*) from public.visit_members m join public.visits v on v.id=m.visit_id where v.started_at>=p_from and v.started_at<p_to and m.member_status<>'withdrawn_before_start'),'exits_registered',(select count(*) from public.visit_members m join public.visits v on v.id=m.visit_id where coalesce(m.checked_out_at,v.completed_at)>=p_from and coalesce(m.checked_out_at,v.completed_at)<p_to and m.member_status in('completed','returned_early')),'currently_on_route',(select count(*) from public.visit_members m join public.visits v on v.id=m.visit_id where v.status='in_progress' and m.member_status in('active','returning_early')),'ascents_total',(select count(*) from period_visits),'ascents_group',(select count(*) from period_visits where participant_count>1),'ascents_individual',(select count(*) from period_visits where participant_count=1),'ascents_started',(select count(*) from public.visits where started_at>=p_from and started_at<p_to),'ascents_scheduled',(select count(*) from public.visits where status='forming' and planned_start_at>=p_from and planned_start_at<p_to),'ascents_completed',(select count(*) from public.visits where completed_at>=p_from and completed_at<p_to),'early_returns',(select count(*) from public.visit_members where member_status='returned_early' and checked_out_at>=p_from and checked_out_at<p_to),'administrative_returns',(select count(*) from public.visit_members where checkout_method='staff' and checked_out_at>=p_from and checked_out_at<p_to),'pending_returns',(select count(*) from public.visit_members m join public.visits v on v.id=m.visit_id where v.status='in_progress' and v.expected_return_at<generated_time and m.member_status in('active','returning_early'))) into summary_data;
  select coalesce(jsonb_agg(jsonb_build_object('nationality_country_code',x.nationality_country_code,'visitors',x.visitors) order by x.visitors desc),'[]'::jsonb) into nationality_data from (select p.nationality_country_code,count(*) visitors from public.visit_members m join public.visits v on v.id=m.visit_id join public.profiles p on p.id=m.user_id where v.started_at>=p_from and v.started_at<p_to and m.member_status<>'withdrawn_before_start' group by p.nationality_country_code) x;
  if p_report_type='detailed' then select coalesce(jsonb_agg(jsonb_build_object('event_date',x.event_date,'visitor_name',x.visitor_name,'nationality_country_code',x.nationality_country_code,'join_code',x.join_code,'ascent_type',x.ascent_type,'started_at',x.started_at,'expected_return_at',x.expected_return_at,'checked_out_at',x.checked_out_at,'duration_minutes',x.duration_minutes,'operational_status',x.operational_status,'creation_origin',x.creation_origin,'completion_method',x.completion_method) order by x.event_date,x.visitor_name),'[]'::jsonb) into detail_data from (select coalesce(v.started_at,m.checked_out_at,v.planned_start_at) event_date,concat_ws(' ',p.first_name,p.last_name) visitor_name,p.nationality_country_code,v.join_code,v.visit_type::text ascent_type,v.started_at,v.expected_return_at,coalesce(m.checked_out_at,case when m.member_status='completed' then v.completed_at end) checked_out_at,case when v.started_at is not null and coalesce(m.checked_out_at,case when m.member_status='completed' then v.completed_at end) is not null then floor(extract(epoch from (coalesce(m.checked_out_at,v.completed_at)-v.started_at))/60)::integer end duration_minutes,m.member_status::text operational_status,v.creation_origin,case when m.checkout_method='staff' then 'administrative' when m.member_status in('completed','returned_early') then 'normal' else 'pending' end completion_method from public.visit_members m join public.visits v on v.id=m.visit_id join public.profiles p on p.id=m.user_id where m.member_status<>'withdrawn_before_start' and ((v.started_at>=p_from and v.started_at<p_to) or (coalesce(m.checked_out_at,v.completed_at)>=p_from and coalesce(m.checked_out_at,v.completed_at)<p_to))) x; else detail_data:='[]'::jsonb; end if;
  insert into public.audit_logs(actor_user_id,action,target_type,metadata) values(auth.uid(),'visitor_report_generated','report',jsonb_build_object('report_type',p_report_type,'from',p_from,'to',p_to,'generated_at',generated_time));
  result:=jsonb_build_object('generated_at',generated_time,'from',p_from,'to',p_to,'report_type',p_report_type,'time_zone','America/Guatemala','summary',summary_data,'nationality_breakdown',nationality_data,'rows',detail_data); return result;
end; $$;
revoke all on function public.staff_generate_visitor_report(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.staff_generate_visitor_report(timestamptz,timestamptz,text) to authenticated;

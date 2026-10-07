-- Keep the historical signature for non-Guatemalan visitors while preventing
-- it from bypassing the new conditional department requirement.
alter function public.staff_register_walk_in_visitor(
  text,text,text,date,text,text,text,text,text,text,text,text
) rename to staff_register_walk_in_visitor_legacy_core_v1;

revoke all on function public.staff_register_walk_in_visitor_legacy_core_v1(
  text,text,text,date,text,text,text,text,text,text,text,text
) from public,anon,authenticated;

alter function public.staff_register_walk_in_visitor(
  text,text,text,date,text,text,text,text,text,text,text,text,text
) rename to staff_register_walk_in_visitor_legacy_core;

revoke all on function public.staff_register_walk_in_visitor_legacy_core(
  text,text,text,date,text,text,text,text,text,text,text,text,text
) from public,anon,authenticated;

create function public.staff_register_walk_in_visitor(
  p_first_name text,p_last_name text,p_nationality_country_code text,
  p_date_of_birth date,p_phone text,p_alternate_phone text,p_document_type text,
  p_document_number text,p_emergency_first_name text,p_emergency_last_name text,
  p_emergency_relationship text,p_emergency_phone text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not public.has_staff_permission('can_register_walk_in_visitors') then
    raise exception using errcode='42501',message='Walk-in visitor permission is required.';
  end if;
  if upper(btrim(p_nationality_country_code))='GT' then
    raise exception using errcode='22023',message='A department is required for Guatemala.';
  end if;
  return public.staff_register_walk_in_visitor_legacy_core(
    p_first_name,p_last_name,p_nationality_country_code,p_date_of_birth,
    p_phone,p_alternate_phone,p_document_type,null,p_document_number,
    p_emergency_first_name,p_emergency_last_name,p_emergency_relationship,
    p_emergency_phone
  );
end;
$$;

create function public.staff_register_walk_in_visitor(
  p_first_name text,p_last_name text,p_nationality_country_code text,
  p_date_of_birth date,p_phone text,p_alternate_phone text,p_document_type text,
  p_document_type_detail text,p_document_number text,p_emergency_first_name text,
  p_emergency_last_name text,p_emergency_relationship text,p_emergency_phone text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not public.has_staff_permission('can_register_walk_in_visitors') then
    raise exception using errcode='42501',message='Walk-in visitor permission is required.';
  end if;
  if upper(btrim(p_nationality_country_code))='GT' then
    raise exception using errcode='22023',message='A department is required for Guatemala.';
  end if;
  return public.staff_register_walk_in_visitor_legacy_core(
    p_first_name,p_last_name,p_nationality_country_code,p_date_of_birth,
    p_phone,p_alternate_phone,p_document_type,p_document_type_detail,
    p_document_number,p_emergency_first_name,p_emergency_last_name,
    p_emergency_relationship,p_emergency_phone
  );
end;
$$;

create or replace function public.staff_register_walk_in_visitor(
  p_first_name text,p_last_name text,p_nationality_country_code text,
  p_date_of_birth date,p_phone text,p_alternate_phone text,p_document_type text,
  p_document_type_detail text,p_document_number text,p_emergency_first_name text,
  p_emergency_last_name text,p_emergency_relationship text,p_emergency_phone text,
  p_department_code text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; visitor_id uuid; normalized_country text:=upper(btrim(p_nationality_country_code));
begin
  if not public.has_staff_permission('can_register_walk_in_visitors') then
    raise exception using errcode='42501',message='Walk-in visitor permission is required.';
  end if;
  if (normalized_country='GT' and p_department_code is null)
    or (normalized_country<>'GT' and p_department_code is not null)
    or (p_department_code is not null and p_department_code not in(
      'alta_verapaz','baja_verapaz','chimaltenango','chiquimula','el_progreso',
      'escuintla','guatemala','huehuetenango','izabal','jalapa','jutiapa','peten',
      'quetzaltenango','quiche','retalhuleu','sacatepequez','san_marcos',
      'santa_rosa','solola','suchitepequez','totonicapan','zacapa')) then
    raise exception using errcode='22023',message='A valid department is required only for Guatemala.';
  end if;
  result:=public.staff_register_walk_in_visitor_legacy_core(
    p_first_name,p_last_name,p_nationality_country_code,p_date_of_birth,
    p_phone,p_alternate_phone,p_document_type,p_document_type_detail,
    p_document_number,p_emergency_first_name,p_emergency_last_name,
    p_emergency_relationship,p_emergency_phone
  );
  visitor_id:=(result->>'visitor_id')::uuid;
  update public.profiles set department_code=p_department_code where id=visitor_id;
  return result||jsonb_build_object('department_code',p_department_code);
end;
$$;

revoke all on function public.staff_register_walk_in_visitor(
  text,text,text,date,text,text,text,text,text,text,text,text
) from public,anon,authenticated;
revoke all on function public.staff_register_walk_in_visitor(
  text,text,text,date,text,text,text,text,text,text,text,text,text
) from public,anon,authenticated;
revoke all on function public.staff_register_walk_in_visitor(
  text,text,text,date,text,text,text,text,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.staff_register_walk_in_visitor(
  text,text,text,date,text,text,text,text,text,text,text,text
) to authenticated;
grant execute on function public.staff_register_walk_in_visitor(
  text,text,text,date,text,text,text,text,text,text,text,text,text
) to authenticated;
grant execute on function public.staff_register_walk_in_visitor(
  text,text,text,date,text,text,text,text,text,text,text,text,text,text
) to authenticated;

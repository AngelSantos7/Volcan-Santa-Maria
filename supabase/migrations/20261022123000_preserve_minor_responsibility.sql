-- Keep the established immutable responsible-adult model; no reassignment APIs.
drop function if exists public.staff_reassign_minor(uuid,uuid);
drop function if exists public.reassign_my_visit_minor(uuid,uuid);

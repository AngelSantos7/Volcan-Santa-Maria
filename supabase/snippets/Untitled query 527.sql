update public.user_roles
set role = 'admin'::public.app_role
where user_id = '6eec3f50-9f20-4736-889d-42a1c4e57ad2'::uuid;

select user_id, role
from public.user_roles
where user_id = '6eec3f50-9f20-4736-889d-42a1c4e57ad2'::uuid;
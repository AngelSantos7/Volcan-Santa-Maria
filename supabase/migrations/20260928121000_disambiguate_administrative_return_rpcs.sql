-- Keep the original RPC signatures available to existing clients and expose
-- the extended reason-detail contract under unambiguous names.
alter function public.staff_register_administrative_return(uuid, uuid, text, text, timestamptz, text)
  rename to staff_register_administrative_return_v2;
alter function public.staff_register_administrative_group_return(uuid, text, text, timestamptz, text)
  rename to staff_register_administrative_group_return_v2;

revoke all on function public.staff_register_administrative_return_v2(uuid, uuid, text, text, timestamptz, text)
from public, anon, authenticated;
revoke all on function public.staff_register_administrative_group_return_v2(uuid, text, text, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.staff_register_administrative_return_v2(uuid, uuid, text, text, timestamptz, text)
to authenticated;
grant execute on function public.staff_register_administrative_group_return_v2(uuid, text, text, timestamptz, text)
to authenticated;

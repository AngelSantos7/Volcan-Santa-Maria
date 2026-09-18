-- These parameterized helpers are internal building blocks. Keeping EXECUTE
-- away from client roles prevents probing another user's administrative role.
revoke execute on function public.is_admin(uuid) from authenticated;
revoke execute on function public.is_visitor_manager(uuid) from authenticated;

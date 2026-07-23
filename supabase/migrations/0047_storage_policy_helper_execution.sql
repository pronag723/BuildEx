-- Storage RLS executes helper functions as the requesting role.  The helper
-- introduced in 0046 is safe for authenticated callers (it returns only a
-- boolean) and must be executable by that role.
grant execute on function public.is_studio_order_moderator(uuid) to authenticated;

notify pgrst, 'reload schema';

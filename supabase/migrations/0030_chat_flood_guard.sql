-- =============================================================================
-- BuildEx — Chat flood guard (ABUSE FIX)
--
-- get_or_create_conversation (0007) lets any signed-in user open a thread with
-- anyone, and messages are then inserted directly under RLS with no throttle —
-- an open door for an automated spam/flood. This adds a lightweight per-sender
-- rate limit enforced in the database (the only trust boundary, since the app is
-- a static export with no server).
--
-- The cap is deliberately generous — 20 messages per rolling 10 seconds — so no
-- human conversation can hit it; it only trips an automated flood. Normal chat
-- (including fast back-and-forth) is completely unaffected, so existing behaviour
-- is preserved.
--
-- The trigger function is SECURITY DEFINER so its COUNT sees all of the sender's
-- recent messages regardless of the caller's row-level read scope.
-- Idempotent — safe to re-run.
-- =============================================================================

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
begin
  select count(*)
    into v_recent
    from public.messages
   where sender_id = new.sender_id
     and created_at > now() - interval '10 seconds';

  if v_recent >= 20 then
    raise exception 'You are sending messages too quickly. Please wait a moment.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_message_rate_limit() from public;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();

notify pgrst, 'reload schema';

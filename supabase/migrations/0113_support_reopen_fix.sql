-- =============================================================================
-- BuildEx — Support threads: only a real message reopens a closed request
--
-- 0112's support_thread_on_message() reopened a thread on ANY row from the
-- thread's owner. When a moderator closes their own support thread, the
-- "Request closed" system line is written under their id — the owner's id —
-- so the close reopened itself at once. Only text and photos count as the user
-- writing again now; system lines never touch the timestamps or the flag.
--
-- Idempotent — safe to re-run.
-- =============================================================================

create or replace function public.support_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.msg_type, 'text') not in ('text', 'image') then
    return new;
  end if;

  update public.support_threads st
     set last_user_message_at = case
           when new.sender_id = st.user_id then new.created_at
           else st.last_user_message_at end,
         last_staff_message_at = case
           when new.sender_id <> st.user_id then new.created_at
           else st.last_staff_message_at end,
         closed_at = case when new.sender_id = st.user_id then null else st.closed_at end,
         closed_by = case when new.sender_id = st.user_id then null else st.closed_by end
   where st.conversation_id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.support_thread_on_message() from public, anon, authenticated;

-- Threads a close already reopened by mistake: closed again where the last
-- row is a "Request closed" line.
with last_row as (
  select distinct on (m.conversation_id)
         m.conversation_id, m.created_at, m.sender_id, m.msg_type, m.meta
    from public.messages m
    join public.support_threads s on s.conversation_id = m.conversation_id
   order by m.conversation_id, m.created_at desc
)
update public.support_threads st
   set closed_at = lr.created_at,
       closed_by = lr.sender_id
  from last_row lr
 where lr.conversation_id = st.conversation_id
   and st.closed_at is null
   and lr.msg_type = 'system'
   and lr.meta->>'event' = 'support_closed';

select st.conversation_id, st.closed_at is not null as closed
  from public.support_threads st;

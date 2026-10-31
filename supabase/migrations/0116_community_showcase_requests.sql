-- =============================================================================
-- BuildEx — Community, part one: Showcase, Saved, "Looking for a builder"
-- (chat + community plan, stage 4a)
--
--   1. Showcase: list_showcase() — every public work with a photo, newest or
--      most liked, optionally by style (the builder's styles). Readable by
--      guests. Hidden builders and removed works never appear.
--   2. Saved works: public.work_saves + toggle_work_save() + list_saved_works().
--      Saved works can be attached to a brief as references (0114 already
--      accepts {"kind":"work"} refs).
--   3. "Looking for a builder": a brief can be published instead of sent to
--      one builder (briefs.visibility = 'public', open for 30 days, at most 3
--      open per person). Guests can read the board. A builder responds with a
--      message and up to three of their works: that opens (or reuses) the chat
--      with the client and puts the brief there as an order waiting for the
--      builder's terms — the ordinary 0114 flow from then on. When the client
--      starts one of the orders, the brief is marked "builder chosen" and the
--      other responders' orders close with a line saying so.
--   4. Reports on public content (briefs, works) and the moderator's tools:
--      hide a public brief, work the report queue.
--
-- Every new function revokes EXECUTE from public, anon AND authenticated, then
-- grants back exactly what the app calls. Nothing here deletes user data.
-- Idempotent — safe to re-run.
-- =============================================================================


-- ─── 0. TUNING ──────────────────────────────────────────────────────────────

create or replace function public.public_briefs_open_max()
returns int language sql immutable set search_path = public as $$ select 3; $$;

create or replace function public.public_brief_days()
returns int language sql immutable set search_path = public as $$ select 30; $$;

create or replace function public.brief_responses_per_day()
returns int language sql immutable set search_path = public as $$ select 20; $$;

create or replace function public.community_reports_per_day()
returns int language sql immutable set search_path = public as $$ select 10; $$;

revoke all on function public.public_briefs_open_max() from public, anon, authenticated;
revoke all on function public.public_brief_days() from public, anon, authenticated;
revoke all on function public.brief_responses_per_day() from public, anon, authenticated;
revoke all on function public.community_reports_per_day() from public, anon, authenticated;


-- ─── 1. SHOWCASE ────────────────────────────────────────────────────────────

create table if not exists public.work_saves (
  user_id uuid not null
    constraint work_saves_user_id_fkey references public.profiles(id) on delete cascade,
  work_id uuid not null
    constraint work_saves_work_id_fkey references public.works(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

create index if not exists work_saves_user_idx on public.work_saves (user_id, created_at desc);

alter table public.work_saves enable row level security;
revoke all on table public.work_saves from anon, authenticated;

-- One row per work for the grids: cover photo, builder, counters, and whether
-- the caller liked or saved it.
create or replace function public._showcase_rows(p_ids uuid[])
returns table (
  work_id uuid,
  title text,
  cover_url text,
  photos int,
  likes int,
  created_at timestamptz,
  builder_id uuid,
  username text,
  display_name text,
  avatar_url text,
  liked boolean,
  saved boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select w.id, w.title,
         (select pi.url from public.portfolio_images pi where pi.work_id = w.id order by pi.position, pi.created_at limit 1),
         (select count(*)::int from public.portfolio_images pi where pi.work_id = w.id),
         w.likes_count, w.created_at,
         w.builder_id, p.username, p.display_name, p.avatar_url,
         exists (select 1 from public.work_likes l where l.work_id = w.id and l.user_id = auth.uid()),
         exists (select 1 from public.work_saves s where s.work_id = w.id and s.user_id = auth.uid())
    from unnest(p_ids) with ordinality as ids(id, ord)
    join public.works w on w.id = ids.id
    join public.profiles p on p.id = w.builder_id
   order by ids.ord;
$$;

revoke all on function public._showcase_rows(uuid[]) from public, anon, authenticated;

-- p_sort: 'new' | 'popular'. p_style: a style key or null.
create or replace function public.list_showcase(
  p_sort text default 'new',
  p_style text default null,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  work_id uuid,
  title text,
  cover_url text,
  photos int,
  likes int,
  created_at timestamptz,
  builder_id uuid,
  username text,
  display_name text,
  avatar_url text,
  liked boolean,
  saved boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
begin
  select array_agg(x.id order by x.ord) into v_ids
    from (
      select w.id,
             row_number() over (
               order by case when p_sort = 'popular' then w.likes_count end desc nulls last,
                        w.created_at desc
             ) as ord
        from public.works w
        join public.builder_profiles bp on bp.id = w.builder_id
       where w.removed_at is null
         and not coalesce(bp.is_hidden, false)
         and exists (select 1 from public.portfolio_images pi where pi.work_id = w.id)
         and (p_style is null or p_style = any (coalesce(bp.specialties, '{}')))
       order by ord
       limit least(greatest(coalesce(p_limit, 24), 1), 60)
       offset greatest(coalesce(p_offset, 0), 0)
    ) x;
  return query select * from public._showcase_rows(coalesce(v_ids, '{}'));
end;
$$;

revoke all on function public.list_showcase(text, text, int, int) from public, anon, authenticated;
grant execute on function public.list_showcase(text, text, int, int) to anon, authenticated;

create or replace function public.toggle_work_save(p_work uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to save works.'; end if;
  if not public._work_is_public(p_work) then
    raise exception 'That work is not available.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.work_saves where user_id = auth.uid() and work_id = p_work) then
    delete from public.work_saves where user_id = auth.uid() and work_id = p_work;
    return false;
  end if;
  insert into public.work_saves (user_id, work_id) values (auth.uid(), p_work);
  return true;
end;
$$;

revoke all on function public.toggle_work_save(uuid) from public, anon, authenticated;
grant execute on function public.toggle_work_save(uuid) to authenticated;

create or replace function public.list_saved_works(p_limit int default 60, p_offset int default 0)
returns table (
  work_id uuid,
  title text,
  cover_url text,
  photos int,
  likes int,
  created_at timestamptz,
  builder_id uuid,
  username text,
  display_name text,
  avatar_url text,
  liked boolean,
  saved boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
begin
  if auth.uid() is null then return; end if;
  select array_agg(x.work_id order by x.created_at desc) into v_ids
    from (
      select s.work_id, s.created_at
        from public.work_saves s
       where s.user_id = auth.uid()
         and public._work_is_public(s.work_id)
       order by s.created_at desc
       limit least(greatest(coalesce(p_limit, 60), 1), 200)
       offset greatest(coalesce(p_offset, 0), 0)
    ) x;
  return query select * from public._showcase_rows(coalesce(v_ids, '{}'));
end;
$$;

revoke all on function public.list_saved_works(int, int) from public, anon, authenticated;
grant execute on function public.list_saved_works(int, int) to authenticated;


-- ─── 2. PUBLIC BRIEFS ───────────────────────────────────────────────────────

alter table public.briefs
  add column if not exists public_status text,
  add column if not exists expires_at timestamptz,
  add column if not exists closed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'briefs_public_status'
                 and conrelid = 'public.briefs'::regclass) then
    alter table public.briefs
      add constraint briefs_public_status check (public_status is null or public_status in ('open', 'chosen', 'closed'));
  end if;
end;
$$;

create index if not exists briefs_public_idx
  on public.briefs (created_at desc)
  where visibility = 'public';

-- Signed-in users can read public briefs directly (a responder's order embeds
-- its brief). Guests read the board only through list_public_briefs().
drop policy if exists "public briefs are readable" on public.briefs;
create policy "public briefs are readable"
  on public.briefs for select
  to authenticated
  using (visibility = 'public' and hidden_at is null);

create table if not exists public.brief_responses (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null
    constraint brief_responses_brief_id_fkey references public.briefs(id) on delete cascade,
  builder_id uuid not null
    constraint brief_responses_builder_id_fkey references public.profiles(id) on delete cascade,
  order_id uuid
    constraint brief_responses_order_id_fkey references public.chat_orders(id) on delete set null,
  conversation_id uuid
    constraint brief_responses_conversation_id_fkey references public.conversations(id) on delete set null,
  message text not null,
  work_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint brief_responses_one_per_builder unique (brief_id, builder_id),
  constraint brief_responses_message_len check (char_length(btrim(message)) between 1 and 1000),
  constraint brief_responses_works check (cardinality(work_ids) <= 3)
);

create index if not exists brief_responses_builder_idx on public.brief_responses (builder_id, created_at desc);

alter table public.brief_responses enable row level security;
revoke all on table public.brief_responses from anon, authenticated;

-- 'open' that ran past its 30 days reads as closed.
create or replace function public._public_status(p_status text, p_expires timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select case when p_status = 'open' and p_expires is not null and p_expires < now() then 'closed'
              else p_status end;
$$;

revoke all on function public._public_status(text, timestamptz) from public, anon, authenticated;

-- Publish a brief to the board.
create or replace function public.publish_brief(p_brief jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if (select count(*) from public.briefs b
       where b.author_id = me and b.visibility = 'public' and b.hidden_at is null
         and public._public_status(b.public_status, b.expires_at) = 'open') >= public.public_briefs_open_max() then
    raise exception 'You already have three open requests. Close one first.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.briefs b
       where b.author_id = me and b.created_at > now() - interval '1 day') >= public.briefs_per_day() then
    raise exception 'You have sent too many briefs today. Please try again tomorrow.' using errcode = 'check_violation';
  end if;

  v_id := public._write_brief(null, p_brief, me);
  update public.briefs
     set visibility = 'public',
         public_status = 'open',
         expires_at = now() + make_interval(days => public.public_brief_days())
   where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.publish_brief(jsonb) from public, anon, authenticated;
grant execute on function public.publish_brief(jsonb) to authenticated;

create or replace function public.close_public_brief(p_brief uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.briefs
     set public_status = 'closed', closed_at = now(), updated_at = now()
   where id = p_brief and author_id = auth.uid() and visibility = 'public'
     and public_status = 'open';
  if not found then
    raise exception 'That request is not open.' using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.close_public_brief(uuid) from public, anon, authenticated;
grant execute on function public.close_public_brief(uuid) to authenticated;

-- The board. p_status: 'open' (default) | 'all'. p_mine: only the caller's.
-- responses is shown only to the author; my_conversation_id says the caller
-- (a builder) already responded and where.
create or replace function public.list_public_briefs(
  p_status text default 'open',
  p_type text default null,
  p_mine boolean default false,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  id uuid,
  title text,
  build_type text,
  styles text[],
  size_w int,
  size_l int,
  size_h int,
  edition text,
  mc_version text,
  deadline date,
  budget_min_rub int,
  budget_max_rub int,
  budget_open boolean,
  delivery text,
  refs jsonb,
  description text,
  extra text,
  created_at timestamptz,
  expires_at timestamptz,
  status text,
  hidden boolean,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  is_mine boolean,
  responses int,
  my_conversation_id uuid
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_admin boolean := public._is_admin(auth.uid());
begin
  return query
  select b.id, b.title, b.build_type, b.styles, b.size_w, b.size_l, b.size_h, b.edition, b.mc_version,
         b.deadline, b.budget_min_rub, b.budget_max_rub, b.budget_open, b.delivery, b.refs,
         b.description, b.extra, b.created_at, b.expires_at,
         public._public_status(b.public_status, b.expires_at),
         b.hidden_at is not null,
         b.author_id, p.username, p.display_name, p.avatar_url,
         b.author_id = auth.uid(),
         case when b.author_id = auth.uid() or v_admin
              then (select count(*)::int from public.brief_responses r where r.brief_id = b.id) end,
         (select r.conversation_id from public.brief_responses r
           where r.brief_id = b.id and r.builder_id = auth.uid())
    from public.briefs b
    join public.profiles p on p.id = b.author_id
   where b.visibility = 'public'
     and (b.hidden_at is null or v_admin or b.author_id = auth.uid())
     and (p_type is null or b.build_type = p_type)
     and (not coalesce(p_mine, false) or b.author_id = auth.uid())
     and (coalesce(p_status, 'open') = 'all'
          or public._public_status(b.public_status, b.expires_at) = 'open'
          or (coalesce(p_mine, false) and b.author_id = auth.uid()))
   order by (public._public_status(b.public_status, b.expires_at) = 'open') desc, b.created_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
   offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_public_briefs(text, text, boolean, int, int) from public, anon, authenticated;
grant execute on function public.list_public_briefs(text, text, boolean, int, int) to anon, authenticated;

-- A builder responds: opens (or reuses) the chat with the client and puts the
-- brief there as an order waiting for the builder's terms, followed by the
-- builder's message. Returns the conversation id.
create or replace function public.respond_to_brief(p_brief uuid, p_message text, p_work_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  b public.briefs;
  v_msg text := btrim(coalesce(p_message, ''));
  v_works uuid[] := coalesce(p_work_ids, '{}');
  v_conv uuid;
  v_order uuid;
  w uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public._is_builder(me) or public.is_builder_hidden(me) then
    raise exception 'Only builders with a visible profile can respond.' using errcode = 'check_violation';
  end if;

  select * into b from public.briefs where id = p_brief for update;
  if not found or b.visibility <> 'public' or b.hidden_at is not null then
    raise exception 'That request is not available.' using errcode = 'check_violation';
  end if;
  if public._public_status(b.public_status, b.expires_at) <> 'open' then
    raise exception 'That request is no longer open.' using errcode = 'check_violation';
  end if;
  if b.author_id = me then
    raise exception 'You cannot respond to your own request.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.brief_responses r where r.brief_id = b.id and r.builder_id = me) then
    raise exception 'You have already responded to this request.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.brief_responses r
       where r.builder_id = me and r.created_at > now() - interval '1 day') >= public.brief_responses_per_day() then
    raise exception 'You have responded to too many requests today. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;
  if char_length(v_msg) < 1 or char_length(v_msg) > 1000 then
    raise exception 'Write a message of up to 1000 characters.' using errcode = 'check_violation';
  end if;
  if cardinality(v_works) > 3 then
    raise exception 'Attach up to three works.' using errcode = 'check_violation';
  end if;
  foreach w in array v_works loop
    if not exists (select 1 from public.works x where x.id = w and x.builder_id = me and x.removed_at is null) then
      raise exception 'You can only attach your own works.' using errcode = 'check_violation';
    end if;
  end loop;

  v_conv := public.get_or_create_conversation(b.author_id);

  insert into public.chat_orders (brief_id, conversation_id, client_id, builder_id)
  values (b.id, v_conv, b.author_id, me)
  returning id into v_order;

  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (v_conv, me, 'Response · ' || b.title, 'brief',
          jsonb_build_object('brief_id', b.id, 'order_id', v_order, 'response', true,
                             'works', to_jsonb(v_works)));
  insert into public.messages (conversation_id, sender_id, body)
  values (v_conv, me, v_msg);

  insert into public.brief_responses (brief_id, builder_id, order_id, conversation_id, message, work_ids)
  values (b.id, me, v_order, v_conv, v_msg, v_works);

  return v_conv;
end;
$$;

revoke all on function public.respond_to_brief(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.respond_to_brief(uuid, text, uuid[]) to authenticated;

-- When a public brief's order starts, the client has chosen: mark the brief
-- and close the other responders' orders with a line saying so.
create or replace function public.public_brief_on_order_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.chat_orders;
begin
  if new.status <> 'in_progress' or old.status = 'in_progress' then
    return new;
  end if;
  if not exists (select 1 from public.briefs b where b.id = new.brief_id and b.visibility = 'public') then
    return new;
  end if;

  update public.briefs
     set public_status = 'chosen', closed_at = now(), updated_at = now()
   where id = new.brief_id and public_status = 'open';

  for o in
    select * from public.chat_orders x
     where x.brief_id = new.brief_id and x.id <> new.id and x.status in ('pending', 'offered')
  loop
    update public.chat_orders
       set status = 'cancelled', close_note = null, closed_at = now(), closed_by = o.client_id, updated_at = now()
     where id = o.id;
    insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
    values (o.conversation_id, o.client_id, 'Chose another builder', 'system',
            jsonb_build_object('event', 'chosen_other', 'order_id', o.id, 'unread', true, 'notify', true));
  end loop;
  return new;
end;
$$;

revoke all on function public.public_brief_on_order_start() from public, anon, authenticated;

drop trigger if exists chat_orders_public_brief_start on public.chat_orders;
create trigger chat_orders_public_brief_start
  after update of status on public.chat_orders
  for each row execute function public.public_brief_on_order_start();

-- The Russian email text for the new line (0115's mapping, plus two).
create or replace function public._ru_message_text(p_body text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_body like 'Brief · %' then 'ТЗ · ' || substr(p_body, 9)
    when p_body like 'Response · %' then 'Отклик на ТЗ · ' || substr(p_body, 12)
    when p_body = '3D preview' then '3D-превью'
    when p_body like '3D preview · %' then '3D-превью · ' || substr(p_body, 14)
    when p_body = 'Edited the brief' then 'Изменил(а) ТЗ'
    when p_body = 'Proposed terms' then 'Предложил(а) свои условия'
    when p_body = 'Took the order' then 'Взял(а) заказ'
    when p_body = 'Accepted the terms' then 'Согласился(ась) с условиями'
    when p_body = 'Turned down the terms' then 'Не согласился(ась) с условиями'
    when p_body = 'Declined the order' then 'Отказался(ась) от заказа'
    when p_body = 'Delivered the work' then 'Сдал(а) работу'
    when p_body = 'Confirmed the order is complete' then 'Подтвердил(а), что заказ выполнен'
    when p_body = 'Cancelled the order' then 'Отменил(а) заказ'
    when p_body = 'Asked to confirm the order' then 'Просит подтвердить заказ'
    when p_body = 'Chose another builder' then 'Заказчик выбрал другого билдера'
    else p_body
  end;
$$;

revoke all on function public._ru_message_text(text) from public, anon, authenticated;


-- ─── 3. REPORTS AND MODERATION ──────────────────────────────────────────────

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  reporter_id uuid not null
    constraint community_reports_reporter_id_fkey references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
    constraint community_reports_resolved_by_fkey references public.profiles(id) on delete set null,
  constraint community_reports_type check (target_type in ('brief', 'work')),
  constraint community_reports_status check (status in ('open', 'reviewed', 'dismissed')),
  constraint community_reports_reason_len check (char_length(btrim(reason)) between 1 and 1000)
);

create index if not exists community_reports_open_idx on public.community_reports (created_at desc) where status = 'open';

alter table public.community_reports enable row level security;
revoke all on table public.community_reports from anon, authenticated;

create or replace function public.report_content(p_type text, p_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_type not in ('brief', 'work') then raise exception 'Unknown report target'; end if;
  if char_length(v_reason) < 1 or char_length(v_reason) > 1000 then
    raise exception 'Please describe what is wrong.' using errcode = 'check_violation';
  end if;
  if p_type = 'brief' and not exists (select 1 from public.briefs b where b.id = p_id and b.visibility = 'public') then
    raise exception 'That request is not available.' using errcode = 'check_violation';
  end if;
  if p_type = 'work' and not public._work_is_public(p_id) then
    raise exception 'That work is not available.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.community_reports r
              where r.target_type = p_type and r.target_id = p_id and r.reporter_id = auth.uid() and r.status = 'open') then
    raise exception 'You have already reported this. Our team is reviewing it.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.community_reports r
       where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 day') >= public.community_reports_per_day() then
    raise exception 'You have submitted too many reports today. Please try again tomorrow.' using errcode = 'check_violation';
  end if;
  insert into public.community_reports (target_type, target_id, reporter_id, reason)
  values (p_type, p_id, auth.uid(), v_reason)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.report_content(text, uuid, text) from public, anon, authenticated;
grant execute on function public.report_content(text, uuid, text) to authenticated;

create or replace function public.admin_list_community_reports(p_status text default 'open')
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  target_title text,
  target_owner text,
  target_hidden boolean,
  reason text,
  status text,
  created_at timestamptz,
  reporter_username text
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select r.id, r.target_type, r.target_id,
         case r.target_type
           when 'brief' then (select b.title from public.briefs b where b.id = r.target_id)
           else (select coalesce(w.title, '') from public.works w where w.id = r.target_id) end,
         case r.target_type
           when 'brief' then (select p.username from public.briefs b join public.profiles p on p.id = b.author_id where b.id = r.target_id)
           else (select p.username from public.works w join public.profiles p on p.id = w.builder_id where w.id = r.target_id) end,
         case r.target_type
           when 'brief' then (select b.hidden_at is not null from public.briefs b where b.id = r.target_id)
           else (select w.removed_at is not null from public.works w where w.id = r.target_id) end,
         r.reason, r.status, r.created_at, rp.username
    from public.community_reports r
    join public.profiles rp on rp.id = r.reporter_id
   where p_status is null or p_status = 'all' or r.status = p_status
   order by r.created_at desc
   limit 200;
end;
$$;

revoke all on function public.admin_list_community_reports(text) from public, anon, authenticated;
grant execute on function public.admin_list_community_reports(text) to authenticated;

create or replace function public.admin_resolve_community_report(p_report uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_status not in ('reviewed', 'dismissed') then
    raise exception 'A report is closed as either reviewed or dismissed';
  end if;
  update public.community_reports
     set status = p_status, resolved_at = now(), resolved_by = auth.uid()
   where id = p_report;
  if not found then raise exception 'That report does not exist'; end if;
end;
$$;

revoke all on function public.admin_resolve_community_report(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_community_report(uuid, text) to authenticated;

create or replace function public.admin_set_brief_hidden(p_brief uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update public.briefs
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
   where id = p_brief and visibility = 'public';
  if not found then raise exception 'That request is not available.'; end if;
end;
$$;

revoke all on function public.admin_set_brief_hidden(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_brief_hidden(uuid, boolean) to authenticated;


notify pgrst, 'reload schema';

select
  to_regclass('public.work_saves') is not null as saves,
  to_regclass('public.brief_responses') is not null as responses,
  to_regclass('public.community_reports') is not null as reports,
  has_function_privilege('anon', 'public.list_showcase(text, text, int, int)', 'execute') as anon_showcase,
  has_function_privilege('anon', 'public.respond_to_brief(uuid, text, uuid[])', 'execute') as anon_respond;

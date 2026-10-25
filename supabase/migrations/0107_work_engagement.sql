-- =============================================================================
-- BuildEx — Work likes, work views, builder stats (profile redesign, stage 2)
--
-- Why this exists
-- ---------------
-- The redesigned profile shows social proof: likes and views per work, totals
-- in the header, and "usually replies in ~N" in the sidebar. Numbers like these
-- are only worth showing if nobody can set them, so every counter here moves
-- only inside SECURITY DEFINER code, with a ledger and a cap behind it:
--
--   1. Tunable limits (functions, same pattern as 0100).
--   2. public.work_likes + toggle_work_like() — signed-in users only, never on
--      your own work, at most work_likes_per_hour() new likes per account.
--      works.likes_count follows the ledger through a trigger.
--   3. public.work_views + record_work_view() — one view per viewer per work
--      per UTC day. A signed-in viewer is keyed by account; an anonymous one by
--      a SHA-256 of their IP, the day and a secret salt from Vault, so the key
--      cannot be reversed or linked across days, and the IP itself is never
--      stored. The builder's own views never count. Ledger rows are pruned
--      after two days; only the counter is kept.
--   4. public.builder_response_stats — median first-reply time per builder over
--      the last 90 days of chat, refreshed hourly by pg_cron.
--   5. get_builder_public_stats() — the header/sidebar totals in one call.
--   6. messages.created_at is now always the server's clock. Clients inserted it
--      themselves, so a backdated reply could fake a fast response time — and
--      the same gap let messages slip past the 0030 flood guard.
--   7. EXECUTE revoked from anon/authenticated by name on internal functions,
--      including two from 0106 — Supabase grants new functions to both roles
--      directly, so revoking from PUBLIC is not enough.
--
-- Nothing here deletes user data. Idempotent — safe to re-run.
-- =============================================================================


-- ─── 1. TUNING ──────────────────────────────────────────────────────────────
create or replace function public.work_likes_per_hour()
returns int language sql immutable set search_path = public as $$ select 60; $$;

-- Far above what a person browsing portfolios opens in a day; caps how far one
-- viewer key (one account, or one IP for one day) can move the view counters.
create or replace function public.work_views_per_viewer_per_day()
returns int language sql immutable set search_path = public as $$ select 300; $$;

create or replace function public.response_stats_window_days()
returns int language sql immutable set search_path = public as $$ select 90; $$;

-- Below this many answered threads the median says more about luck than about
-- the builder, so the profile shows nothing.
create or replace function public.response_stats_min_samples()
returns int language sql immutable set search_path = public as $$ select 3; $$;


-- ─── Shared helper: may visitors see this work? ─────────────────────────────
-- Same rule as the works SELECT policy (0106) for everyone who is not the
-- builder or an admin: not taken down, builder not hidden.
create or replace function public._work_is_public(p_work uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.works w
     where w.id = p_work
       and w.removed_at is null
       and not public.is_builder_hidden(w.builder_id)
  );
$$;

revoke all on function public._work_is_public(uuid) from public, anon, authenticated;


-- ─── 2. Likes ───────────────────────────────────────────────────────────────
create table if not exists public.work_likes (
  work_id uuid not null references public.works(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (work_id, user_id)
);

create index if not exists work_likes_user_idx
  on public.work_likes (user_id, created_at desc);

alter table public.work_likes enable row level security;

-- Who liked what is not public. A user reads only their own likes (to draw the
-- filled heart); writes go through toggle_work_like() alone.
revoke all on public.work_likes from anon, authenticated;
grant select on public.work_likes to authenticated;

drop policy if exists "users read own work likes" on public.work_likes;
create policy "users read own work likes"
  on public.work_likes for select
  using (user_id = auth.uid());

-- The counter follows the ledger, including rows removed by cascades (a liker
-- deleting their account takes their likes with them).
create or replace function public.work_likes_bump_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.works set likes_count = likes_count + 1 where id = new.work_id;
    return new;
  end if;
  update public.works set likes_count = greatest(likes_count - 1, 0) where id = old.work_id;
  return old;
end;
$$;

drop trigger if exists work_likes_bump_count on public.work_likes;
create trigger work_likes_bump_count
  after insert or delete on public.work_likes
  for each row execute function public.work_likes_bump_count();

-- Likes or unlikes, and returns the new state. Unliking is always free; a new
-- like counts against work_likes_per_hour(). The ledger's created_at is the
-- server's clock (the client never writes this table), so the window is exact.
create or replace function public.toggle_work_like(p_work uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_builder uuid;
  v_liked boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to like works.' using errcode = 'insufficient_privilege';
  end if;

  select w.builder_id into v_builder from public.works w where w.id = p_work;
  if v_builder is null or not public._work_is_public(p_work) then
    raise exception 'That work is not available.' using errcode = 'no_data_found';
  end if;
  if v_builder = v_uid then
    raise exception 'You cannot like your own work.' using errcode = 'check_violation';
  end if;

  delete from public.work_likes where work_id = p_work and user_id = v_uid;
  if found then
    v_liked := false;
  else
    if (select count(*) from public.work_likes
         where user_id = v_uid and created_at > now() - interval '1 hour')
       >= public.work_likes_per_hour() then
      raise exception 'You are liking too quickly. Please try again later.'
        using errcode = 'check_violation';
    end if;
    insert into public.work_likes (work_id, user_id) values (p_work, v_uid)
      on conflict do nothing;
    v_liked := true;
  end if;

  return jsonb_build_object(
    'liked', v_liked,
    'likes_count', (select w.likes_count from public.works w where w.id = p_work)
  );
end;
$$;

revoke all on function public.toggle_work_like(uuid) from public, anon;
grant execute on function public.toggle_work_like(uuid) to authenticated;


-- ─── 3. Views ───────────────────────────────────────────────────────────────
-- viewer_key is 'u:<account uuid>' or 'a:<sha256 hex>'. The day is part of the
-- key AND of the anonymous hash, so a key means nothing outside its own day.
create table if not exists public.work_views (
  work_id uuid not null references public.works(id) on delete cascade,
  viewer_key text not null,
  day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  primary key (work_id, viewer_key, day)
);

create index if not exists work_views_viewer_idx
  on public.work_views (viewer_key, day);

-- No policies: nobody but the definer functions below reads or writes this.
alter table public.work_views enable row level security;
revoke all on public.work_views from anon, authenticated;

-- The anonymous-key salt. Random, created here, never typed or committed.
-- Rotating it (vault.update_secret) simply makes today's anonymous keys new.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'work_views_salt') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'work_views_salt',
      'Salt for hashing anonymous viewer IPs in record_work_view'
    );
  end if;
end;
$$;

-- The caller's IP as the API gateway reports it. PostgREST exposes the request
-- headers to SQL; Supabase sits behind Cloudflare, so cf-connecting-ip is the
-- real client, with the usual fallbacks. Null when none is present — the view
-- is then simply not counted.
create or replace function public._request_ip()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_headers json;
  v_ip text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if v_headers is null then
    return null;
  end if;
  v_ip := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(v_headers ->> 'x-real-ip'), ''),
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '')
  );
  return v_ip;
end;
$$;

revoke all on function public._request_ip() from public, anon, authenticated;

-- Returns true when this call counted as a new view.
create or replace function public.record_work_view(p_work uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_builder uuid;
  v_ip text;
  v_salt text;
  v_key text;
  v_rows int;
begin
  select w.builder_id into v_builder from public.works w where w.id = p_work;
  if v_builder is null or not public._work_is_public(p_work) then
    return false;
  end if;

  if v_uid is not null then
    if v_uid = v_builder then
      return false;
    end if;
    v_key := 'u:' || v_uid::text;
  else
    v_ip := public._request_ip();
    select ds.decrypted_secret into v_salt
      from vault.decrypted_secrets ds
     where ds.name = 'work_views_salt'
     limit 1;
    if v_ip is null or coalesce(v_salt, '') = '' then
      return false;
    end if;
    v_key := 'a:' || encode(sha256(convert_to(v_ip || '|' || v_day::text || '|' || v_salt, 'UTF8')), 'hex');
  end if;

  if (select count(*) from public.work_views where viewer_key = v_key and day = v_day)
     >= public.work_views_per_viewer_per_day() then
    return false;
  end if;

  insert into public.work_views (work_id, viewer_key, day)
  values (p_work, v_key, v_day)
  on conflict do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return false;
  end if;

  update public.works set views_count = views_count + 1 where id = p_work;
  return true;
end;
$$;

revoke all on function public.record_work_view(uuid) from public;
grant execute on function public.record_work_view(uuid) to anon, authenticated;

-- Dedup only needs today (UTC) and a little slack around midnight.
create or replace function public._prune_work_views()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.work_views
   where day < (now() at time zone 'utc')::date - 1;
$$;

revoke all on function public._prune_work_views() from public, anon, authenticated;


-- ─── 4. Response time ───────────────────────────────────────────────────────
create table if not exists public.builder_response_stats (
  builder_id uuid primary key references public.profiles(id) on delete cascade,
  median_minutes int not null,
  samples int not null,
  refreshed_at timestamptz not null default now()
);

alter table public.builder_response_stats enable row level security;
revoke all on public.builder_response_stats from anon, authenticated;
grant select on public.builder_response_stats to anon, authenticated;

drop policy if exists "response stats are viewable" on public.builder_response_stats;
create policy "response stats are viewable"
  on public.builder_response_stats for select
  using (
    builder_id = auth.uid()
    or not public.is_builder_hidden(builder_id)
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
    )
  );

-- One sample per (thread, builder): the other person's first message in the
-- window, and the builder's first message after it. Threads the builder never
-- answered are not counted — this measures how fast they reply, not whether
-- they reply to everyone. Only real messages count (text and images), not the
-- old order-event rows.
create or replace function public.refresh_builder_response_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => public.response_stats_window_days());
begin
  delete from public.builder_response_stats where true;

  insert into public.builder_response_stats (builder_id, median_minutes, samples, refreshed_at)
  select s.builder_id,
         round(percentile_cont(0.5) within group (order by s.minutes))::int,
         count(*)::int,
         now()
    from (
      select pr.builder_id,
             extract(epoch from (
               (select min(m.created_at) from public.messages m
                 where m.conversation_id = pr.conversation_id
                   and m.sender_id = pr.builder_id
                   and coalesce(m.msg_type, 'text') in ('text', 'image')
                   and m.created_at > pr.asked_at)
               - pr.asked_at
             )) / 60.0 as minutes
        from (
          select p.conversation_id, p.builder_id,
                 (select min(m.created_at) from public.messages m
                   where m.conversation_id = p.conversation_id
                     and m.sender_id = p.other_id
                     and coalesce(m.msg_type, 'text') in ('text', 'image')
                     and m.created_at >= v_since) as asked_at
            from (
              select c.id as conversation_id, c.user_a as builder_id, c.user_b as other_id
                from public.conversations c
              union all
              select c.id, c.user_b, c.user_a
                from public.conversations c
            ) p
           where exists (select 1 from public.builder_profiles bp where bp.id = p.builder_id)
        ) pr
       where pr.asked_at is not null
    ) s
   where s.minutes is not null
   group by s.builder_id;
end;
$$;

revoke all on function public.refresh_builder_response_stats() from public, anon, authenticated;


-- ─── 5. Public stats for the profile header and sidebar ─────────────────────
-- Null for a builder visitors may not see (hidden, or not a builder at all),
-- unless the caller is that builder or an admin — the same rule as 0101.
create or replace function public.get_builder_public_stats(p_builder uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_works int;
  v_likes bigint;
  v_views bigint;
  v_resp public.builder_response_stats%rowtype;
begin
  if not public._is_builder(p_builder) then
    return null;
  end if;
  if public.is_builder_hidden(p_builder)
     and v_uid is distinct from p_builder
     and not exists (select 1 from public.profiles p where p.id = v_uid and p.is_admin) then
    return null;
  end if;

  select count(*), coalesce(sum(w.likes_count), 0), coalesce(sum(w.views_count), 0)
    into v_works, v_likes, v_views
    from public.works w
   where w.builder_id = p_builder
     and w.removed_at is null
     and exists (select 1 from public.portfolio_images pi where pi.work_id = w.id);

  select * into v_resp from public.builder_response_stats where builder_id = p_builder;

  return jsonb_build_object(
    'works_count', v_works,
    'likes_total', v_likes,
    'views_total', v_views,
    'response_median_minutes',
      case when v_resp.samples >= public.response_stats_min_samples()
           then v_resp.median_minutes end,
    'response_samples', coalesce(v_resp.samples, 0)
  );
end;
$$;

revoke all on function public.get_builder_public_stats(uuid) from public;
grant execute on function public.get_builder_public_stats(uuid) to anon, authenticated;


-- ─── 6. messages.created_at is the server's clock ───────────────────────────
-- Clients insert messages directly and could send any created_at. That let a
-- reply be backdated (faking a fast response time above) and let messages
-- dodge the 0030 flood guard, which counts by created_at. Nothing legitimate
-- sets it: the app never sends the column.
create or replace function public.messages_server_time()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists messages_server_time on public.messages;
create trigger messages_server_time
  before insert on public.messages
  for each row execute function public.messages_server_time();


-- ─── 7. EXECUTE grants: Supabase's defaults, not just PUBLIC ────────────────
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon and authenticated BY NAME, so `revoke … from public` alone leaves a
-- function callable over /rpc. The revokes above name the roles; these two
-- from 0106 did not: _is_builder is internal (only definer triggers call it),
-- and remove_me_from_work needs a signed-in caller (it refused anon anyway).
revoke all on function public._is_builder(uuid) from public, anon, authenticated;
revoke all on function public.remove_me_from_work(uuid) from public, anon;
grant execute on function public.remove_me_from_work(uuid) to authenticated;


-- ─── Scheduling ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-work-views') then
    perform cron.unschedule('prune-work-views');
  end if;
  perform cron.schedule(
    'prune-work-views',
    '17 3 * * *',
    'select public._prune_work_views();'
  );

  if exists (select 1 from cron.job where jobname = 'refresh-builder-response-stats') then
    perform cron.unschedule('refresh-builder-response-stats');
  end if;
  perform cron.schedule(
    'refresh-builder-response-stats',
    '7 * * * *',
    'select public.refresh_builder_response_stats();'
  );
end;
$$;

-- Fill the stats now rather than waiting for the first hourly run.
select public.refresh_builder_response_stats();


notify pgrst, 'reload schema';


-- ─── Checks (run by hand after applying) ────────────────────────────────────
-- Both jobs listed and active:
--   select jobname, schedule, active from cron.job
--    where jobname in ('prune-work-views', 'refresh-builder-response-stats');
--
-- Ledgers are not client-writable (expect "permission denied"):
--   set role authenticated;
--   insert into public.work_likes (work_id, user_id) values (gen_random_uuid(), gen_random_uuid());
--   reset role;
--
-- An anonymous view counts once per day (call twice over the REST API with
-- the anon key; the second returns false), and the header totals add up:
--   select public.get_builder_public_stats('<builder uuid>');

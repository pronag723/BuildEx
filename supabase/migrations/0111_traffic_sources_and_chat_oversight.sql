-- =============================================================================
-- BuildEx — Traffic sources + moderator access to every conversation
--
-- Why this exists
-- ---------------
-- Two things the moderator console could not answer:
--
--   1. "Where do people come from?" Cloudflare Web Analytics (privacy 2.2)
--      counts page views, but it never sees an account, so it cannot say which
--      link, search engine or Telegram post produced a SIGN-UP — and an ad test
--      is judged on sign-ups. This migration records, first-party:
--
--        • site_visits — one row per visit (a browser tab's first page load
--          that did not come from BuildEx itself): the channel (direct /
--          search / social / referral / campaign), the source it resolved to,
--          utm_* / ?ref= labels, the referring host, the landing path, the
--          device class and the browser language. No IP, no user agent, no
--          account and no identifier of any kind is stored on the row.
--        • signup_sources — for a NEW account only, how its browser first
--          arrived (the "first touch" the site kept in localStorage until
--          sign-up). One row per account, deleted with it.
--
--      Visits are rate-limited by a daily salted hash of the IP, exactly the
--      scheme record_work_view uses (0107): the hash lives in its own ledger,
--      never on the visit row, and is pruned after a day. The same ledger says
--      whether a visit is the connection's first today, which is what the
--      console's "visitors" figure counts.
--
--   2. "What are people saying to each other?" The console could only read a
--      thread somebody reported. A directory with open sign-up and free chat
--      gets scams ("pay me on another site first") that nobody reports until
--      after the money is gone, so moderators can now browse and search every
--      conversation. Every time a moderator opens one, that is written to
--      admin_conversation_views — a log nobody can edit from the client.
--
--      The privacy policy (2.5) and community policy (2.2) say so; before this,
--      both promised a moderator would see a conversation only once reported.
--
-- Access model unchanged: profiles.is_admin, re-checked server-side by
-- _require_admin() (0026) in every admin_* function. The two recorders are the
-- only new client-callable writes, and both are SECURITY DEFINER functions
-- that clamp and whitelist every argument.
--
-- Grants: Supabase's default privileges give new functions EXECUTE to anon and
-- authenticated by name, so every function below revokes them by name (0107).
--
-- Nothing here deletes user data. Idempotent — safe to re-run.
-- =============================================================================


-- ─── 1. site_visits ─────────────────────────────────────────────────────────
create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  channel text not null
    check (channel in ('direct', 'search', 'social', 'referral', 'campaign')),
  source text,          -- 'google', 'telegram', a ?ref= label, a bare host…
  medium text,          -- utm_medium
  campaign text,        -- utm_campaign
  referrer_host text,   -- the referring host as the browser reported it
  landing_path text,    -- first page of the visit, query string dropped
  device text check (device in ('mobile', 'tablet', 'desktop')),
  lang text,            -- browser language, primary subtag ('ru', 'en', …)
  first_today boolean not null default false
);

create index if not exists site_visits_created_idx
  on public.site_visits (created_at desc);

-- No policies: only the definer functions below read or write this.
alter table public.site_visits enable row level security;
revoke all on public.site_visits from anon, authenticated;


-- ─── 2. The per-connection ledger (rate limit + "first today") ─────────────
-- visitor_key is sha256(ip | day | salt). The day is inside the hash, so a key
-- means nothing outside its own day, and _prune_site_visit_keys drops it after
-- one. Nothing joins this to site_visits.
create table if not exists public.site_visit_keys (
  visitor_key text not null,
  day date not null,
  visits int not null default 0,
  primary key (visitor_key, day)
);

alter table public.site_visit_keys enable row level security;
revoke all on public.site_visit_keys from anon, authenticated;

-- Its own salt, separate from work_views_salt, so neither ledger's keys can be
-- matched against the other's.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'site_visits_salt') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'site_visits_salt',
      'Salt for hashing visitor IPs in record_site_visit'
    );
  end if;
end;
$$;

-- More visits than this from one connection in one UTC day are not recorded.
-- Generous on purpose: a household or a school shares one IP.
create or replace function public.site_visits_per_visitor_per_day()
returns int
language sql
immutable
as $$ select 40 $$;

revoke all on function public.site_visits_per_visitor_per_day() from public, anon, authenticated;


-- ─── 3. signup_sources ──────────────────────────────────────────────────────
create table if not exists public.signup_sources (
  user_id uuid not null,
  channel text not null
    check (channel in ('direct', 'search', 'social', 'referral', 'campaign')),
  source text,
  medium text,
  campaign text,
  referrer_host text,
  landing_path text,
  first_seen_at timestamptz,   -- when that first visit happened
  recorded_at timestamptz not null default now(),
  constraint signup_sources_pkey primary key (user_id),
  -- Named, because the Users list embeds it from profiles (see the named-FK
  -- rule after 0101: profiles already has more than one relationship).
  constraint signup_sources_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade
);

alter table public.signup_sources enable row level security;
revoke all on public.signup_sources from anon, authenticated;
-- Admins read it directly, so the Users list can show each account's source
-- in the same request. Everyone else matches no row.
grant select on public.signup_sources to authenticated;

drop policy if exists "admins read signup sources" on public.signup_sources;
create policy "admins read signup sources"
  on public.signup_sources for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );


-- ─── 4. Shared argument cleaning ────────────────────────────────────────────
-- A short label: trimmed, lower-cased, at most p_max characters, null if empty.
create or replace function public._traffic_label(p_value text, p_max int)
returns text
language sql
immutable
as $$
  select nullif(left(lower(btrim(coalesce(p_value, ''))), p_max), '')
$$;

revoke all on function public._traffic_label(text, int) from public, anon, authenticated;

-- A site path: must start with "/", query and fragment dropped, 200 chars.
create or replace function public._traffic_path(p_value text)
returns text
language sql
immutable
as $$
  select case
    when left(btrim(coalesce(p_value, '')), 1) = '/'
      then left(split_part(split_part(btrim(p_value), '?', 1), '#', 1), 200)
  end
$$;

revoke all on function public._traffic_path(text) from public, anon, authenticated;

create or replace function public._traffic_channel(p_value text)
returns text
language sql
immutable
as $$
  select case
    when lower(btrim(coalesce(p_value, ''))) in ('direct', 'search', 'social', 'referral', 'campaign')
      then lower(btrim(p_value))
    else 'direct'
  end
$$;

revoke all on function public._traffic_channel(text) from public, anon, authenticated;


-- ─── 5. record_site_visit ───────────────────────────────────────────────────
-- Called once per visit by lib/traffic/TrafficRecorder.jsx. Returns true when
-- the visit was recorded. A request without a client IP (never the case
-- behind the API gateway) is not recorded, same as record_work_view.
create or replace function public.record_site_visit(
  p_channel text,
  p_source text default null,
  p_medium text default null,
  p_campaign text default null,
  p_referrer_host text default null,
  p_landing_path text default null,
  p_device text default null,
  p_lang text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_ip text := public._request_ip();
  v_salt text;
  v_key text;
  v_visits int;
  v_device text := public._traffic_label(p_device, 10);
begin
  select ds.decrypted_secret into v_salt
    from vault.decrypted_secrets ds
   where ds.name = 'site_visits_salt'
   limit 1;

  if v_ip is null or coalesce(v_salt, '') = '' then
    return false;
  end if;

  v_key := encode(sha256(convert_to(v_ip || '|' || v_day::text || '|' || v_salt, 'UTF8')), 'hex');

  insert into public.site_visit_keys as k (visitor_key, day, visits)
  values (v_key, v_day, 1)
  on conflict (visitor_key, day) do update set visits = k.visits + 1
  returning k.visits into v_visits;

  if v_visits > public.site_visits_per_visitor_per_day() then
    return false;
  end if;

  insert into public.site_visits (
    channel, source, medium, campaign, referrer_host, landing_path, device, lang, first_today
  ) values (
    public._traffic_channel(p_channel),
    public._traffic_label(p_source, 80),
    public._traffic_label(p_medium, 80),
    public._traffic_label(p_campaign, 120),
    public._traffic_label(p_referrer_host, 120),
    public._traffic_path(p_landing_path),
    case when v_device in ('mobile', 'tablet', 'desktop') then v_device end,
    public._traffic_label(split_part(coalesce(p_lang, ''), '-', 1), 8),
    v_visits = 1
  );

  return true;
end;
$$;

revoke all on function public.record_site_visit(text, text, text, text, text, text, text, text) from public;
grant execute on function public.record_site_visit(text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public._prune_site_visit_keys()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.site_visit_keys
   where day < (now() at time zone 'utc')::date - 1;
$$;

revoke all on function public._prune_site_visit_keys() from public, anon, authenticated;


-- ─── 6. record_signup_source ────────────────────────────────────────────────
-- Called once per account and browser after sign-in. Only an account created
-- in the last day gets a row, and only once: signing in to an old account on a
-- new device must not re-attribute it to whatever link that device came from.
create or replace function public.record_signup_source(
  p_channel text,
  p_source text default null,
  p_medium text default null,
  p_campaign text default null,
  p_referrer_host text default null,
  p_landing_path text default null,
  p_first_seen_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_created timestamptz;
  v_rows int;
begin
  if v_uid is null then
    return false;
  end if;

  select p.created_at into v_created from public.profiles p where p.id = v_uid;
  if v_created is null or v_created < now() - interval '1 day' then
    return false;
  end if;

  insert into public.signup_sources (
    user_id, channel, source, medium, campaign, referrer_host, landing_path, first_seen_at
  ) values (
    v_uid,
    public._traffic_channel(p_channel),
    public._traffic_label(p_source, 80),
    public._traffic_label(p_medium, 80),
    public._traffic_label(p_campaign, 120),
    public._traffic_label(p_referrer_host, 120),
    public._traffic_path(p_landing_path),
    -- A first visit cannot be in the future or before the site kept any.
    case
      when p_first_seen_at is null or p_first_seen_at > now()
        or p_first_seen_at < now() - interval '400 days' then null
      else p_first_seen_at
    end
  )
  on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;

  return v_rows > 0;
end;
$$;

revoke all on function public.record_signup_source(text, text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.record_signup_source(text, text, text, text, text, text, timestamptz) to authenticated;


-- ─── 7. admin_traffic_summary ───────────────────────────────────────────────
-- Everything the Traffic tab draws, in one round trip. p_days is the window in
-- days ending today (null or 0 = all time); p_tz is the moderator's time zone,
-- so "today" and the daily bars match their calendar, not UTC's.
--
-- Sign-ups come from profiles, not from signup_sources: an account created
-- before tracking began, or from a browser that blocked storage, still counts,
-- under the channel 'unknown'.
create or replace function public.admin_traffic_summary(
  p_days int default 30,
  p_tz text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := coalesce(nullif(btrim(coalesce(p_tz, '')), ''), 'UTC');
  v_days int := case when p_days is null or p_days <= 0 then null else least(p_days, 3650) end;
  v_today date;
  v_from date;
  v_since timestamptz;
  v_prev_since timestamptz;
  v_step int;
  v_result jsonb;
begin
  perform public._require_admin();

  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;

  v_today := (now() at time zone v_tz)::date;

  if v_days is null then
    v_from := (least(
      coalesce((select min(sv.created_at) from public.site_visits sv), now()),
      coalesce((select min(p.created_at) from public.profiles p), now())
    ) at time zone v_tz)::date;
  else
    v_from := v_today - (v_days - 1);
    v_prev_since := (v_from - v_days)::timestamp at time zone v_tz;
  end if;

  v_since := v_from::timestamp at time zone v_tz;
  -- Long ranges are drawn by week so the bars stay readable.
  v_step := case when v_today - v_from > 120 then 7 else 1 end;

  with v as (
    select sv.*,
           v_from + (((sv.created_at at time zone v_tz)::date - v_from) / v_step) * v_step as bucket
      from public.site_visits sv
     where sv.created_at >= v_since
  ),
  s as (
    select p.id, p.username, p.display_name, p.avatar_url, p.created_at,
           v_from + (((p.created_at at time zone v_tz)::date - v_from) / v_step) * v_step as bucket,
           coalesce(ss.channel, 'unknown') as channel,
           ss.source, ss.medium, ss.campaign, ss.referrer_host, ss.landing_path,
           (bp.id is not null) as is_builder
      from public.profiles p
      left join public.signup_sources ss on ss.user_id = p.id
      left join public.builder_profiles bp on bp.id = p.id
     where p.created_at >= v_since
  ),
  buckets as (
    select (v_from + n * v_step) as bucket
      from generate_series(0, (v_today - v_from) / v_step) as n
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_today,
    'step', v_step,
    'tracking_since', (select min(sv.created_at) from public.site_visits sv),

    'totals', jsonb_build_object(
      'visits', (select count(*) from v),
      'visitors', (select count(*) from v where v.first_today),
      'signups', (select count(*) from s),
      'builders', (select count(*) from public.builder_profiles bp where bp.created_at >= v_since)
    ),

    'previous', case when v_prev_since is null then null else jsonb_build_object(
      'visits', (select count(*) from public.site_visits sv
                  where sv.created_at >= v_prev_since and sv.created_at < v_since),
      'visitors', (select count(*) from public.site_visits sv
                    where sv.created_at >= v_prev_since and sv.created_at < v_since and sv.first_today),
      'signups', (select count(*) from public.profiles p
                   where p.created_at >= v_prev_since and p.created_at < v_since),
      'builders', (select count(*) from public.builder_profiles bp
                    where bp.created_at >= v_prev_since and bp.created_at < v_since)
    ) end,

    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', b.bucket,
               'visits', coalesce(vc.n, 0),
               'signups', coalesce(sc.n, 0)
             ) order by b.bucket), '[]'::jsonb)
        from buckets b
        left join (select v.bucket, count(*) as n from v group by v.bucket) vc on vc.bucket = b.bucket
        left join (select s.bucket, count(*) as n from s group by s.bucket) sc on sc.bucket = b.bucket
    ),

    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'channel', x.channel, 'visits', x.visits, 'signups', x.signups
             ) order by x.visits desc, x.signups desc), '[]'::jsonb)
        from (
          select u.channel, sum(u.visits)::int as visits, sum(u.signups)::int as signups
            from (
              select v.channel, count(*) as visits, 0 as signups from v group by v.channel
              union all
              select s.channel, 0, count(*) from s group by s.channel
            ) u
           group by u.channel
        ) x
    ),

    -- Where each non-direct visit or sign-up came from, by resolved source.
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'channel', x.channel, 'source', x.source, 'visits', x.visits, 'signups', x.signups
             ) order by x.visits + x.signups desc, x.signups desc), '[]'::jsonb)
        from (
          select u.channel, u.source, sum(u.visits)::int as visits, sum(u.signups)::int as signups
            from (
              select v.channel, coalesce(v.source, v.referrer_host) as source, count(*) as visits, 0 as signups
                from v where v.channel <> 'direct' group by 1, 2
              union all
              select s.channel, coalesce(s.source, s.referrer_host), 0, count(*)
                from s where s.channel not in ('direct', 'unknown') group by 1, 2
            ) u
           where u.source is not null
           group by u.channel, u.source
           order by sum(u.visits) + sum(u.signups) desc
           limit 30
        ) x
    ),

    -- Tagged links only: ?ref= and utm_* (and ad click ids).
    'campaigns', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'source', x.source, 'medium', x.medium, 'campaign', x.campaign,
               'visits', x.visits, 'signups', x.signups
             ) order by x.visits + x.signups desc), '[]'::jsonb)
        from (
          select u.source, u.medium, u.campaign,
                 sum(u.visits)::int as visits, sum(u.signups)::int as signups
            from (
              select v.source, v.medium, v.campaign, count(*) as visits, 0 as signups
                from v where v.channel = 'campaign' group by 1, 2, 3
              union all
              select s.source, s.medium, s.campaign, 0, count(*)
                from s where s.channel = 'campaign' group by 1, 2, 3
            ) u
           group by u.source, u.medium, u.campaign
           order by sum(u.visits) + sum(u.signups) desc
           limit 30
        ) x
    ),

    'landing', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'path', x.path, 'visits', x.visits, 'signups', x.signups
             ) order by x.visits + x.signups desc), '[]'::jsonb)
        from (
          select u.path, sum(u.visits)::int as visits, sum(u.signups)::int as signups
            from (
              select v.landing_path as path, count(*) as visits, 0 as signups
                from v group by 1
              union all
              select s.landing_path, 0, count(*) from s where s.landing_path is not null group by 1
            ) u
           where u.path is not null
           group by u.path
           order by sum(u.visits) + sum(u.signups) desc
           limit 15
        ) x
    ),

    'devices', (
      select coalesce(jsonb_agg(jsonb_build_object('key', x.k, 'visits', x.n) order by x.n desc), '[]'::jsonb)
        from (select coalesce(v.device, 'unknown') as k, count(*)::int as n from v group by 1) x
    ),

    'langs', (
      select coalesce(jsonb_agg(jsonb_build_object('key', x.k, 'visits', x.n) order by x.n desc), '[]'::jsonb)
        from (
          select coalesce(v.lang, 'unknown') as k, count(*)::int as n
            from v group by 1 order by 2 desc limit 8
        ) x
    ),

    'recent_signups', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', x.id, 'username', x.username, 'display_name', x.display_name,
               'avatar_url', x.avatar_url, 'created_at', x.created_at, 'is_builder', x.is_builder,
               'channel', x.channel, 'source', coalesce(x.source, x.referrer_host),
               'campaign', x.campaign, 'landing_path', x.landing_path
             ) order by x.created_at desc), '[]'::jsonb)
        from (select * from s order by s.created_at desc limit 25) x
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_traffic_summary(int, text) from public, anon;
grant execute on function public.admin_traffic_summary(int, text) to authenticated;


-- ─── 8. admin_conversation_views ────────────────────────────────────────────
-- Who opened which conversation, and when. Written only by
-- admin_get_conversation_messages; not readable or writable from the client.
create table if not exists public.admin_conversation_views (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists admin_conversation_views_conv_idx
  on public.admin_conversation_views (conversation_id, viewed_at desc);

alter table public.admin_conversation_views enable row level security;
revoke all on public.admin_conversation_views from anon, authenticated;


-- ─── 9. admin_get_conversation_messages (now logged) ────────────────────────
-- Same signature and result as 0101. Opening a thread writes one log row;
-- re-opening it within ten minutes does not write another.
create or replace function public.admin_get_conversation_messages(p_conversation uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_username text,
  sender_display_name text,
  sender_avatar_url text,
  body text,
  msg_type text,
  meta jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();

  if exists (select 1 from public.conversations c where c.id = p_conversation)
     and not exists (
       select 1 from public.admin_conversation_views acv
        where acv.admin_id = auth.uid()
          and acv.conversation_id = p_conversation
          and acv.viewed_at > now() - interval '10 minutes'
     ) then
    insert into public.admin_conversation_views (admin_id, conversation_id)
    values (auth.uid(), p_conversation);
  end if;

  return query
    select m.id, m.sender_id, s.username, s.display_name, s.avatar_url,
           m.body, m.msg_type, m.meta, m.created_at
      from public.messages m
      join public.profiles s on s.id = m.sender_id
     where m.conversation_id = p_conversation
     order by m.created_at asc;
end;
$$;

revoke all on function public.admin_get_conversation_messages(uuid) from public, anon;
grant execute on function public.admin_get_conversation_messages(uuid) to authenticated;


-- ─── 10. admin_list_conversations ───────────────────────────────────────────
-- Every conversation that has at least one message, newest activity first,
-- 40 at a time (p_before = the last row's last_message_at for the next page).
--
-- p_search: "@handle" matches either participant's handle only; anything else
-- matches a handle, a display name, or the text of any message in the thread —
-- and then match_snippet carries the newest matching message, so the list can
-- show why a thread matched. LIKE wildcards in the term are escaped, so
-- "user_1" and "50%" search for exactly that text.
create or replace function public.admin_list_conversations(
  p_search text default null,
  p_before timestamptz default null,
  p_limit int default 40
)
returns table (
  conversation_id uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  message_count int,
  open_reports int,
  match_snippet text,
  a_id uuid,
  a_username text,
  a_display_name text,
  a_avatar_url text,
  a_is_builder boolean,
  b_id uuid,
  b_username text,
  b_display_name text,
  b_avatar_url text,
  b_is_builder boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw text := nullif(btrim(coalesce(p_search, '')), '');
  v_handle text;
  v_term text;
  v_pattern text;
  v_limit int := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  perform public._require_admin();

  if v_raw is not null and left(v_raw, 1) = '@' then
    v_handle := nullif(btrim(substr(v_raw, 2)), '');
  end if;
  v_term := coalesce(v_handle, v_raw);
  if v_term is not null then
    v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    select
      c.id,
      c.created_at,
      c.last_message_at,
      c.last_message_preview,
      (select count(*)::int from public.messages m where m.conversation_id = c.id),
      (select count(*)::int from public.conversation_reports r
        where r.conversation_id = c.id and r.status = 'open'),
      case when v_pattern is not null and v_handle is null then (
        select m.body from public.messages m
         where m.conversation_id = c.id and m.body ilike v_pattern
         order by m.created_at desc
         limit 1
      ) end,
      pa.id, pa.username, pa.display_name, pa.avatar_url,
      exists (select 1 from public.builder_profiles bpa where bpa.id = pa.id),
      pb.id, pb.username, pb.display_name, pb.avatar_url,
      exists (select 1 from public.builder_profiles bpb where bpb.id = pb.id)
    from public.conversations c
    join public.profiles pa on pa.id = c.user_a
    join public.profiles pb on pb.id = c.user_b
   where exists (select 1 from public.messages m where m.conversation_id = c.id)
     and (p_before is null or c.last_message_at < p_before)
     and (
       v_pattern is null
       or pa.username ilike v_pattern
       or pb.username ilike v_pattern
       or (v_handle is null and (
            coalesce(pa.display_name, '') ilike v_pattern
            or coalesce(pb.display_name, '') ilike v_pattern
            or exists (
              select 1 from public.messages m
               where m.conversation_id = c.id and m.body ilike v_pattern
            )
       ))
     )
   order by c.last_message_at desc nulls last, c.id
   limit v_limit;
end;
$$;

revoke all on function public.admin_list_conversations(text, timestamptz, int) from public, anon;
grant execute on function public.admin_list_conversations(text, timestamptz, int) to authenticated;


-- ─── Scheduling ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-site-visit-keys') then
    perform cron.unschedule('prune-site-visit-keys');
  end if;
  perform cron.schedule(
    'prune-site-visit-keys',
    '23 3 * * *',
    'select public._prune_site_visit_keys();'
  );
end;
$$;


notify pgrst, 'reload schema';


-- ─── Checks (run by hand after applying) ────────────────────────────────────
-- The prune job is listed and active:
--   select jobname, schedule, active from cron.job where jobname = 'prune-site-visit-keys';
--
-- The tables are not client-readable or -writable (expect "permission denied"):
--   set role anon;
--   select * from public.site_visits limit 1;
--   insert into public.signup_sources (user_id, channel) values (gen_random_uuid(), 'direct');
--   reset role;
--
-- Admin functions refuse a non-admin (expect "Admin only"):
--   select public.admin_traffic_summary(30, 'UTC');
--   select * from public.admin_list_conversations(null, null, 5);

-- =============================================================================
-- BuildEx — Briefs and orders in chat (chat + community plan, stage 2)
--
-- What this adds
-- --------------
-- There is still no money on BuildEx. An "order" is a record two people keep
-- in their chat so they both know what was agreed and where it stands:
--
--   client sends a brief (ТЗ) ─► pending
--   builder "Take order" with a price and a deadline:
--       inside the client's budget and deadline ─► in_progress
--       otherwise ─► offered, and the client agrees (in_progress) or not
--                    (back to pending)
--   builder may mark it delivered ─► delivered (optional)
--   ONLY the client confirms ─► completed, and is offered a review
--   either side may cancel before completed; the builder may decline while
--   it is pending or offered.
--
--   1. public.briefs — what the client wants (type, styles, size, version,
--      deadline, budget in whole rubles or "let the builder price it", how to
--      deliver, up to 10 references, description). Written only by RPCs.
--   2. public.chat_orders — one order per brief and builder, with the agreed
--      price and deadline and a timestamp per step. (`orders` is the old
--      payments table: decommissioned, never dropped, so the name is taken.)
--      Clients can read their own orders and change nothing directly.
--   3. messages: msg_type `brief` (the card that opens an order) and `system`
--      lines for every step, all written by the RPCs under the actor's id —
--      so your own actions never light your own unread badge.
--   4. RPCs: send_brief, update_brief, take_order, answer_offer,
--      decline_order, deliver_order, complete_order, cancel_order,
--      remind_client, review_order.
--   5. Reviews: builder_reviews.order_id. A completed order makes its client
--      eligible to review the builder straight away (no chat-length rule).
--      Still one review per person per builder: a second order rewrites it.
--      Old reviews keep order_id null and work as before.
--   6. The bell, the email queue and the unread count learn the new types.
--      Briefs and the steps that need the other side's attention notify;
--      the rest only appear in the thread.
--
-- Every new function revokes EXECUTE from public, anon AND authenticated, then
-- grants back exactly what the app calls. Nothing here deletes user data.
-- Idempotent — safe to re-run.
-- =============================================================================


-- ─── 0. TUNING ──────────────────────────────────────────────────────────────

create or replace function public.briefs_per_day()
returns int language sql immutable set search_path = public as $$ select 10; $$;

create or replace function public.active_orders_per_pair_max()
returns int language sql immutable set search_path = public as $$ select 3; $$;

revoke all on function public.briefs_per_day() from public, anon, authenticated;
revoke all on function public.active_orders_per_pair_max() from public, anon, authenticated;


-- ─── 1. MESSAGES ────────────────────────────────────────────────────────────

alter table public.messages drop constraint if exists messages_msg_type_check;
alter table public.messages
  add constraint messages_msg_type_check
  check (msg_type in ('text', 'order_event', 'image', 'system', 'brief'));

-- A brief lights the badge; system lines say whether they do (meta.unread).
create or replace function public._counts_as_unread(p_type text, p_meta jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_type, 'text')
    when 'text' then true
    when 'image' then true
    when 'brief' then true
    when 'system' then coalesce(p_meta->>'unread', 'false') = 'true'
    else false
  end;
$$;

revoke all on function public._counts_as_unread(text, jsonb) from public, anon, authenticated;

-- What rings the bell and can be emailed: messages, photos, briefs, and the
-- system lines written with meta.notify = true.
create or replace function public._message_notifies(p_type text, p_meta jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case coalesce(p_type, 'text')
    when 'text' then true
    when 'image' then true
    when 'brief' then true
    when 'system' then coalesce(p_meta->>'notify', 'false') = 'true'
    else false
  end;
$$;

revoke all on function public._message_notifies(text, jsonb) from public, anon, authenticated;

-- The email is written in the recipient's language, but message bodies of
-- briefs and order steps are fixed English strings (the app translates them
-- itself). This maps them for Russian emails.
create or replace function public._ru_message_text(p_body text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_body like 'Brief · %' then 'ТЗ · ' || substr(p_body, 9)
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
    else p_body
  end;
$$;

revoke all on function public._ru_message_text(text) from public, anon, authenticated;


-- ─── 2. BRIEFS ──────────────────────────────────────────────────────────────

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null
    constraint briefs_author_id_fkey references public.profiles(id) on delete cascade,
  -- 'public' is for the "Looking for a builder" board (stage 4).
  visibility text not null default 'direct',
  title text not null,
  build_type text not null,
  styles text[] not null default '{}',
  size_w int,
  size_l int,
  size_h int,
  edition text,
  mc_version text,
  deadline date,
  budget_min_rub int,
  budget_max_rub int,
  budget_open boolean not null default false,
  delivery text,
  refs jsonb not null default '[]'::jsonb,
  description text not null default '',
  extra text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint briefs_visibility check (visibility in ('direct', 'public')),
  constraint briefs_title_len check (char_length(btrim(title)) between 1 and 80),
  constraint briefs_build_type check (build_type in (
    'spawn', 'lobby', 'hub', 'arena', 'map', 'terrain', 'kingdom', 'village', 'decoration', 'commission')),
  constraint briefs_styles check (
    cardinality(styles) <= 3
    and styles <@ array['medieval', 'fantasy', 'sci-fi', 'cyberpunk', 'modern', 'realistic',
                        'organic', 'terrain', 'pvp', 'other']::text[]),
  constraint briefs_size check (
    (size_w is null or size_w between 1 and 5000)
    and (size_l is null or size_l between 1 and 5000)
    and (size_h is null or size_h between 1 and 512)),
  constraint briefs_edition check (edition is null or edition in ('java', 'bedrock')),
  constraint briefs_version check (mc_version is null or mc_version ~ '^[0-9]{1,2}(\.[0-9]{1,2}){0,2}$'),
  constraint briefs_budget check (
    (budget_min_rub is null or budget_min_rub between 0 and 10000000)
    and (budget_max_rub is null or budget_max_rub between 0 and 10000000)
    and (budget_min_rub is null or budget_max_rub is null or budget_min_rub <= budget_max_rub)),
  constraint briefs_delivery check (delivery is null or delivery in ('schem', 'litematic', 'world', 'server')),
  constraint briefs_refs check (jsonb_typeof(refs) = 'array' and jsonb_array_length(refs) <= 10),
  constraint briefs_description_len check (char_length(description) <= 2000),
  constraint briefs_extra_len check (char_length(extra) <= 500)
);

create index if not exists briefs_author_idx on public.briefs (author_id, created_at desc);

alter table public.briefs enable row level security;
revoke all on table public.briefs from anon, authenticated;


-- ─── 3. ORDERS ──────────────────────────────────────────────────────────────

create table if not exists public.chat_orders (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null
    constraint chat_orders_brief_id_fkey references public.briefs(id) on delete cascade,
  conversation_id uuid not null
    constraint chat_orders_conversation_id_fkey references public.conversations(id) on delete cascade,
  client_id uuid not null
    constraint chat_orders_client_id_fkey references public.profiles(id) on delete cascade,
  builder_id uuid not null
    constraint chat_orders_builder_id_fkey references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  price_rub int,
  deadline date,
  offered_at timestamptz,
  taken_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  closed_by uuid
    constraint chat_orders_closed_by_fkey references public.profiles(id) on delete set null,
  close_reason text,
  close_note text,
  delivery_note text,
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_orders_status check (status in (
    'pending', 'offered', 'in_progress', 'delivered', 'completed', 'declined', 'cancelled')),
  constraint chat_orders_price check (price_rub is null or price_rub between 1 and 10000000),
  constraint chat_orders_reason check (close_reason is null or close_reason in ('busy', 'style', 'budget', 'other')),
  constraint chat_orders_note_len check (close_note is null or char_length(close_note) <= 300),
  constraint chat_orders_delivery_note_len check (delivery_note is null or char_length(delivery_note) <= 500),
  constraint chat_orders_one_per_builder unique (brief_id, builder_id),
  constraint chat_orders_not_self check (client_id <> builder_id)
);

create index if not exists chat_orders_conversation_idx on public.chat_orders (conversation_id, created_at);
create index if not exists chat_orders_client_idx on public.chat_orders (client_id, status);
create index if not exists chat_orders_builder_idx on public.chat_orders (builder_id, status);

alter table public.chat_orders enable row level security;
revoke all on table public.chat_orders from anon, authenticated;

drop policy if exists "participants read orders" on public.chat_orders;
create policy "participants read orders"
  on public.chat_orders for select
  to authenticated
  using (auth.uid() in (client_id, builder_id) or public._is_admin(auth.uid()));

grant select on public.chat_orders to authenticated;

drop policy if exists "authors and order participants read briefs" on public.briefs;
create policy "authors and order participants read briefs"
  on public.briefs for select
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.chat_orders o
       where o.brief_id = briefs.id and auth.uid() in (o.client_id, o.builder_id)
    )
    or public._is_admin(auth.uid())
  );

grant select on public.briefs to authenticated;


-- ─── 4. BRIEF VALIDATION ────────────────────────────────────────────────────
-- Turns the app's JSON into checked column values. Unknown keys are ignored;
-- references are rebuilt so nothing but the three known shapes is stored:
--   {"kind":"photo","path":"<author uid>/<file>"}   (chat-media bucket)
--   {"kind":"work","work_id":"<uuid>"}               (a public work)
--   {"kind":"link","url":"https://…"}
create or replace function public._normalize_brief_refs(p_refs jsonb, p_author uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  r jsonb;
  v_kind text;
begin
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' then
    return v_out;
  end if;
  if jsonb_array_length(p_refs) > 10 then
    raise exception 'A brief can have up to 10 references.' using errcode = 'check_violation';
  end if;
  for r in select * from jsonb_array_elements(p_refs) loop
    v_kind := r->>'kind';
    if v_kind = 'photo'
       and coalesce(r->>'path', '') ~ ('^' || p_author::text || '/[A-Za-z0-9._-]{1,200}$') then
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'photo', 'path', r->>'path'));
    elsif v_kind = 'work'
       and coalesce(r->>'work_id', '') ~ '^[0-9a-f-]{36}$'
       and public._work_is_public((r->>'work_id')::uuid) then
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'work', 'work_id', r->>'work_id'));
    elsif v_kind = 'link'
       and coalesce(r->>'url', '') ~ '^https://\S+$'
       and char_length(r->>'url') <= 500 then
      v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'link', 'url', r->>'url'));
    else
      raise exception 'One of the references is not valid.' using errcode = 'check_violation';
    end if;
  end loop;
  return v_out;
end;
$$;

revoke all on function public._normalize_brief_refs(jsonb, uuid) from public, anon, authenticated;

-- jsonb text → int, or null for "", null or absent; anything else is an error.
create or replace function public._brief_int(p jsonb, p_key text)
returns int
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := nullif(btrim(coalesce(p->>p_key, '')), '');
begin
  if v is null then return null; end if;
  if v !~ '^[0-9]{1,9}$' then
    raise exception 'Use whole numbers for sizes and budget.' using errcode = 'check_violation';
  end if;
  return v::int;
end;
$$;

revoke all on function public._brief_int(jsonb, text) from public, anon, authenticated;

-- Writes a brief from JSON: a new row when p_brief_id is null, otherwise the
-- given row. Every check the table's constraints make is also made here first,
-- with a message written for a person.
create or replace function public._write_brief(p_brief_id uuid, p jsonb, p_author uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_brief_id;
  v_title text := btrim(coalesce(p->>'title', ''));
  v_type text := nullif(btrim(coalesce(p->>'build_type', '')), '');
  v_styles text[];
  v_edition text := nullif(btrim(coalesce(p->>'edition', '')), '');
  v_version text := nullif(btrim(coalesce(p->>'mc_version', '')), '');
  v_deadline date;
  v_min int := public._brief_int(p, 'budget_min_rub');
  v_max int := public._brief_int(p, 'budget_max_rub');
  v_open boolean := coalesce((p->>'budget_open')::boolean, false);
  v_delivery text := nullif(btrim(coalesce(p->>'delivery', '')), '');
  v_desc text := btrim(coalesce(p->>'description', ''));
  v_extra text := btrim(coalesce(p->>'extra', ''));
  v_refs jsonb := public._normalize_brief_refs(p->'refs', p_author);
begin
  if v_type is null or v_type not in (
    'spawn', 'lobby', 'hub', 'arena', 'map', 'terrain', 'kingdom', 'village', 'decoration', 'commission') then
    raise exception 'Choose what to build.' using errcode = 'check_violation';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'Give the brief a title of up to 80 characters.' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(distinct s), '{}') into v_styles
    from jsonb_array_elements_text(case when jsonb_typeof(p->'styles') = 'array' then p->'styles' else '[]'::jsonb end) s;
  if cardinality(v_styles) > 3 then
    raise exception 'Pick up to three styles.' using errcode = 'check_violation';
  end if;
  if not v_styles <@ array['medieval', 'fantasy', 'sci-fi', 'cyberpunk', 'modern', 'realistic',
                           'organic', 'terrain', 'pvp', 'other']::text[] then
    raise exception 'One of the styles is not on the list.' using errcode = 'check_violation';
  end if;
  if v_edition is not null and v_edition not in ('java', 'bedrock') then
    raise exception 'Choose Java or Bedrock.' using errcode = 'check_violation';
  end if;
  if v_version is not null and v_version !~ '^[0-9]{1,2}(\.[0-9]{1,2}){0,2}$' then
    raise exception 'Write the version like 1.21 or 1.20.4.' using errcode = 'check_violation';
  end if;
  if v_delivery is not null and v_delivery not in ('schem', 'litematic', 'world', 'server') then
    raise exception 'Choose how the build is delivered.' using errcode = 'check_violation';
  end if;

  if nullif(btrim(coalesce(p->>'deadline', '')), '') is not null then
    begin
      v_deadline := (p->>'deadline')::date;
    exception when others then
      raise exception 'The deadline is not a valid date.' using errcode = 'check_violation';
    end;
    if v_deadline < current_date or v_deadline > current_date + 730 then
      raise exception 'Pick a deadline between today and two years from now.' using errcode = 'check_violation';
    end if;
  end if;

  if v_min is not null and v_max is not null and v_min > v_max then
    raise exception 'The budget "from" is higher than "to".' using errcode = 'check_violation';
  end if;
  if v_open then
    v_min := null;
    v_max := null;
  end if;
  if char_length(v_desc) > 2000 then
    raise exception 'The description can be up to 2000 characters.' using errcode = 'check_violation';
  end if;
  if char_length(v_extra) > 500 then
    raise exception 'The extra notes can be up to 500 characters.' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into public.briefs (
      author_id, title, build_type, styles, size_w, size_l, size_h, edition, mc_version,
      deadline, budget_min_rub, budget_max_rub, budget_open, delivery, refs, description, extra
    )
    values (
      p_author, v_title, v_type, v_styles,
      public._brief_int(p, 'size_w'), public._brief_int(p, 'size_l'), public._brief_int(p, 'size_h'),
      v_edition, v_version, v_deadline, v_min, v_max, v_open, v_delivery, v_refs, v_desc, v_extra
    )
    returning id into v_id;
  else
    update public.briefs
       set title = v_title,
           build_type = v_type,
           styles = v_styles,
           size_w = public._brief_int(p, 'size_w'),
           size_l = public._brief_int(p, 'size_l'),
           size_h = public._brief_int(p, 'size_h'),
           edition = v_edition,
           mc_version = v_version,
           deadline = v_deadline,
           budget_min_rub = v_min,
           budget_max_rub = v_max,
           budget_open = v_open,
           delivery = v_delivery,
           refs = v_refs,
           description = v_desc,
           extra = v_extra,
           updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public._write_brief(uuid, jsonb, uuid) from public, anon, authenticated;


-- ─── 5. THE LIFECYCLE ───────────────────────────────────────────────────────

-- One line in the thread for one step, written under the actor's id.
create or replace function public._post_order_line(
  p_order public.chat_orders,
  p_body text,
  p_event text,
  p_notify boolean,
  p_extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (
    p_order.conversation_id, auth.uid(), p_body, 'system',
    jsonb_build_object('event', p_event, 'order_id', p_order.id, 'unread', true, 'notify', p_notify)
      || coalesce(p_extra, '{}'::jsonb)
  );
end;
$$;

revoke all on function public._post_order_line(public.chat_orders, text, text, boolean, jsonb)
  from public, anon, authenticated;

-- The caller's order, locked, with the role they must have. Raises a
-- readable error when it is not theirs or not in one of the allowed states.
create or replace function public._my_order(p_order uuid, p_role text, p_states text[])
returns public.chat_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v from public.chat_orders where id = p_order for update;
  if not found
     or (p_role = 'client' and v.client_id <> auth.uid())
     or (p_role = 'builder' and v.builder_id <> auth.uid())
     or (p_role = 'either' and auth.uid() not in (v.client_id, v.builder_id)) then
    raise exception 'Order not found';
  end if;
  if not (v.status = any (p_states)) then
    raise exception 'This order has already moved on. Refresh the chat.' using errcode = 'check_violation';
  end if;
  return v;
end;
$$;

revoke all on function public._my_order(uuid, text, text[]) from public, anon, authenticated;

-- 5a. The client sends a brief to a builder. Opens the chat if needed (with
-- 0100's limits on new conversations), then posts the brief card.
create or replace function public.send_brief(p_builder uuid, p_brief jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_conv uuid;
  v_brief uuid;
  v_order uuid;
  v_title text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_builder is null or p_builder = me then
    raise exception 'Invalid recipient';
  end if;
  if not public._is_builder(p_builder) or public.is_builder_hidden(p_builder) then
    raise exception 'That builder is not on BuildEx.' using errcode = 'check_violation';
  end if;

  if (select count(*) from public.briefs b
       where b.author_id = me and b.created_at > now() - interval '1 day') >= public.briefs_per_day() then
    raise exception 'You have sent too many briefs today. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  if (select count(*) from public.chat_orders o
       where o.client_id = me and o.builder_id = p_builder
         and o.status in ('pending', 'offered', 'in_progress', 'delivered')) >= public.active_orders_per_pair_max() then
    raise exception 'You already have three open orders with this builder.' using errcode = 'check_violation';
  end if;

  v_conv := public.get_or_create_conversation(p_builder);
  v_brief := public._write_brief(null, p_brief, me);

  insert into public.chat_orders (brief_id, conversation_id, client_id, builder_id)
  values (v_brief, v_conv, me, p_builder)
  returning id into v_order;

  select title into v_title from public.briefs where id = v_brief;
  insert into public.messages (conversation_id, sender_id, body, msg_type, meta)
  values (v_conv, me, 'Brief · ' || v_title, 'brief',
          jsonb_build_object('brief_id', v_brief, 'order_id', v_order));

  return jsonb_build_object('conversation_id', v_conv, 'brief_id', v_brief, 'order_id', v_order);
end;
$$;

revoke all on function public.send_brief(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.send_brief(uuid, jsonb) to authenticated;

-- 5b. The client edits the brief while the builder has not answered yet.
create or replace function public.update_brief(p_order uuid, p_brief jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders := public._my_order(p_order, 'client', array['pending']);
begin
  perform public._write_brief(v.brief_id, p_brief, auth.uid());
  update public.chat_orders set updated_at = now() where id = v.id;
  perform public._post_order_line(v, 'Edited the brief', 'brief_edited', false);
end;
$$;

revoke all on function public.update_brief(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_brief(uuid, jsonb) to authenticated;

-- 5c. The builder takes the order at a price and a deadline. Inside the
-- client's budget and deadline it starts at once; otherwise it becomes an
-- offer the client answers. "Let the builder price it" or no budget at all is
-- always an offer: the client has not agreed to any number yet.
create or replace function public.take_order(p_order uuid, p_price_rub int, p_deadline date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders := public._my_order(p_order, 'builder', array['pending']);
  b public.briefs;
  v_ceiling int;
  v_inside boolean;
begin
  if p_price_rub is null or p_price_rub < 1 or p_price_rub > 10000000 then
    raise exception 'Enter a price in rubles.' using errcode = 'check_violation';
  end if;
  if p_deadline is null or p_deadline < current_date or p_deadline > current_date + 730 then
    raise exception 'Pick a deadline between today and two years from now.' using errcode = 'check_violation';
  end if;

  select * into b from public.briefs where id = v.brief_id;
  v_ceiling := coalesce(b.budget_max_rub, b.budget_min_rub);
  v_inside := not b.budget_open
              and v_ceiling is not null
              and p_price_rub <= v_ceiling
              and (b.deadline is null or p_deadline <= b.deadline);

  if v_inside then
    update public.chat_orders
       set status = 'in_progress', price_rub = p_price_rub, deadline = p_deadline,
           taken_at = now(), updated_at = now()
     where id = v.id
     returning * into v;
    perform public._post_order_line(v, 'Took the order', 'taken', true,
      jsonb_build_object('price_rub', p_price_rub, 'deadline', p_deadline));
    return 'in_progress';
  end if;

  update public.chat_orders
     set status = 'offered', price_rub = p_price_rub, deadline = p_deadline,
         offered_at = now(), updated_at = now()
   where id = v.id
   returning * into v;
  perform public._post_order_line(v, 'Proposed terms', 'offered', true,
    jsonb_build_object('price_rub', p_price_rub, 'deadline', p_deadline));
  return 'offered';
end;
$$;

revoke all on function public.take_order(uuid, int, date) from public, anon, authenticated;
grant execute on function public.take_order(uuid, int, date) to authenticated;

-- 5d. The client answers the builder's terms.
create or replace function public.answer_offer(p_order uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders := public._my_order(p_order, 'client', array['offered']);
begin
  if coalesce(p_accept, false) then
    update public.chat_orders
       set status = 'in_progress', taken_at = now(), updated_at = now()
     where id = v.id
     returning * into v;
    perform public._post_order_line(v, 'Accepted the terms', 'offer_accepted', true,
      jsonb_build_object('price_rub', v.price_rub, 'deadline', v.deadline));
    return 'in_progress';
  end if;

  update public.chat_orders
     set status = 'pending', price_rub = null, deadline = null, offered_at = null, updated_at = now()
   where id = v.id
   returning * into v;
  perform public._post_order_line(v, 'Turned down the terms', 'offer_rejected', true);
  return 'pending';
end;
$$;

revoke all on function public.answer_offer(uuid, boolean) from public, anon, authenticated;
grant execute on function public.answer_offer(uuid, boolean) to authenticated;

-- 5e. The builder declines, with a one-tap reason the client sees.
create or replace function public.decline_order(p_order uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders := public._my_order(p_order, 'builder', array['pending', 'offered']);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_reason is null or p_reason not in ('busy', 'style', 'budget', 'other') then
    raise exception 'Pick a reason.' using errcode = 'check_violation';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'The note can be up to 300 characters.' using errcode = 'check_violation';
  end if;
  update public.chat_orders
     set status = 'declined', close_reason = p_reason, close_note = v_note,
         closed_at = now(), closed_by = auth.uid(), updated_at = now()
   where id = v.id
   returning * into v;
  perform public._post_order_line(v, 'Declined the order', 'declined', true,
    jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.decline_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.decline_order(uuid, text, text) to authenticated;

-- 5f. The builder marks the work delivered (optional).
create or replace function public.deliver_order(p_order uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders := public._my_order(p_order, 'builder', array['in_progress']);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'The note can be up to 500 characters.' using errcode = 'check_violation';
  end if;
  update public.chat_orders
     set status = 'delivered', delivered_at = now(), delivery_note = v_note, updated_at = now()
   where id = v.id
   returning * into v;
  perform public._post_order_line(v, 'Delivered the work', 'delivered', true);
end;
$$;

revoke all on function public.deliver_order(uuid, text) from public, anon, authenticated;
grant execute on function public.deliver_order(uuid, text) to authenticated;

-- 5g. Only the client can say the order is done.
create or replace function public.complete_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders := public._my_order(p_order, 'client', array['in_progress', 'delivered']);
begin
  update public.chat_orders
     set status = 'completed', completed_at = now(), updated_at = now()
   where id = v.id
   returning * into v;
  perform public._post_order_line(v, 'Confirmed the order is complete', 'completed', true);
end;
$$;

revoke all on function public.complete_order(uuid) from public, anon, authenticated;
grant execute on function public.complete_order(uuid) to authenticated;

-- 5h. Either side cancels before it is completed.
create or replace function public.cancel_order(p_order uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders := public._my_order(p_order, 'either',
    array['pending', 'offered', 'in_progress', 'delivered']);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'The note can be up to 300 characters.' using errcode = 'check_violation';
  end if;
  update public.chat_orders
     set status = 'cancelled', close_note = v_note,
         closed_at = now(), closed_by = auth.uid(), updated_at = now()
   where id = v.id
   returning * into v;
  perform public._post_order_line(v, 'Cancelled the order', 'cancelled', true);
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- 5i. A delivered order the client has not confirmed: the builder can nudge
-- once a day. There is no automatic completion — only the client confirms.
create or replace function public.remind_client(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders := public._my_order(p_order, 'builder', array['delivered']);
begin
  if v.last_reminded_at is not null and v.last_reminded_at > now() - interval '1 day' then
    raise exception 'You can remind once a day.' using errcode = 'check_violation';
  end if;
  update public.chat_orders
     set last_reminded_at = now(), updated_at = now()
   where id = v.id
   returning * into v;
  perform public._post_order_line(v, 'Asked to confirm the order', 'reminded', true);
end;
$$;

revoke all on function public.remind_client(uuid) from public, anon, authenticated;
grant execute on function public.remind_client(uuid) to authenticated;


-- ─── 6. REVIEWS ─────────────────────────────────────────────────────────────

alter table public.builder_reviews
  add column if not exists order_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'builder_reviews_order_id_fkey'
       and conrelid = 'public.builder_reviews'::regclass
  ) then
    alter table public.builder_reviews
      add constraint builder_reviews_order_id_fkey
      foreign key (order_id) references public.chat_orders(id) on delete set null;
  end if;
end;
$$;

-- 0108's rule, plus: a completed order between them makes the client eligible
-- at once — it is a stronger signal than chat length.
create or replace function public._review_eligibility(p_reviewer uuid, p_builder uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_conversation uuid;
  v_mine int;
  v_theirs int;
  v_first timestamptz;
begin
  if p_reviewer is null then
    return 'not_signed_in';
  end if;
  if p_reviewer = p_builder then
    return 'self';
  end if;
  if not public._is_builder(p_builder) or public.is_builder_hidden(p_builder) then
    return 'not_builder';
  end if;

  if exists (
    select 1 from public.chat_orders o
     where o.client_id = p_reviewer and o.builder_id = p_builder and o.status = 'completed'
  ) then
    return 'ok';
  end if;

  select c.id into v_conversation
    from public.conversations c
   where c.user_a = least(p_reviewer, p_builder)
     and c.user_b = greatest(p_reviewer, p_builder);
  if v_conversation is null then
    return 'no_conversation';
  end if;

  select count(*) filter (where m.sender_id = p_reviewer),
         count(*) filter (where m.sender_id = p_builder),
         min(m.created_at)
    into v_mine, v_theirs, v_first
    from public.messages m
   where m.conversation_id = v_conversation
     and coalesce(m.msg_type, 'text') in ('text', 'image');

  if v_mine < public.review_min_messages_each_side()
     or v_theirs < public.review_min_messages_each_side() then
    return 'no_conversation';
  end if;
  if v_first > now() - make_interval(hours => public.review_min_thread_age_hours()) then
    return 'too_soon';
  end if;
  return 'ok';
end;
$$;

revoke all on function public._review_eligibility(uuid, uuid) from public, anon, authenticated;

-- 0108's reader, now also saying which order the review is tied to.
create or replace function public.can_review_builder(p_builder uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_review public.builder_reviews%rowtype;
begin
  select * into v_review
    from public.builder_reviews
   where builder_id = p_builder and reviewer_id = v_uid;

  return jsonb_build_object(
    'status', public._review_eligibility(v_uid, p_builder),
    'review', case when v_review.id is null then null else jsonb_build_object(
      'id', v_review.id,
      'rating', v_review.rating,
      'body', v_review.body,
      'price_tier_id', v_review.price_tier_id,
      'order_id', v_review.order_id,
      'created_at', v_review.created_at,
      'updated_at', v_review.updated_at,
      'hidden', v_review.hidden_at is not null
    ) end
  );
end;
$$;

revoke all on function public.can_review_builder(uuid) from public, anon;
grant execute on function public.can_review_builder(uuid) to authenticated;

-- The review after a completed order. Writes (or rewrites) the client's one
-- review of this builder and ties it to the order.
create or replace function public.review_order(p_order uuid, p_rating int, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.chat_orders;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to leave a review.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.chat_orders where id = p_order;
  if not found or v.client_id <> auth.uid() then
    raise exception 'Order not found';
  end if;
  if v.status <> 'completed' then
    raise exception 'You can review an order once it is complete.' using errcode = 'check_violation';
  end if;
  if public.is_builder_hidden(v.builder_id) or not public._is_builder(v.builder_id) then
    raise exception 'That builder is not on BuildEx.' using errcode = 'check_violation';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating from 1 to 5.' using errcode = 'check_violation';
  end if;
  if char_length(v_body) < 20 then
    raise exception 'Write at least 20 characters.' using errcode = 'check_violation';
  end if;
  if char_length(v_body) > 1500 then
    raise exception 'A review can be up to 1500 characters.' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.builder_reviews where builder_id = v.builder_id and reviewer_id = auth.uid()
  ) and (
    select count(*) from public.builder_reviews
     where reviewer_id = auth.uid() and created_at > now() - interval '1 day'
  ) >= public.reviews_per_day() then
    raise exception 'You have written too many reviews today. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  insert into public.builder_reviews (builder_id, reviewer_id, rating, body, order_id)
  values (v.builder_id, auth.uid(), p_rating, v_body, v.id)
  on conflict on constraint builder_reviews_one_per_reviewer do update
     set rating     = excluded.rating,
         body       = excluded.body,
         order_id   = excluded.order_id,
         updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.review_order(uuid, int, text) from public, anon, authenticated;
grant execute on function public.review_order(uuid, int, text) to authenticated;


-- ─── 7. THE BELL AND THE EMAIL QUEUE ────────────────────────────────────────

-- 0112's trigger with one change: what notifies is _message_notifies(), so
-- briefs and the order steps that need the other side ring the bell too.
create or replace function public.notify_conversation_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv      public.conversations%rowtype;
  v_recipient uuid;
  v_sender    text;
  v_preview   text;
  v_admin     uuid;
begin
  if not public._message_notifies(new.msg_type, new.meta) then
    return new;
  end if;

  select * into v_conv from public.conversations c where c.id = new.conversation_id;
  if not found then
    return new;
  end if;

  v_preview := case
    when new.msg_type = 'image' and coalesce(btrim(new.body), '') = '' then 'Sent a photo'
    when new.msg_type = 'image' then 'Photo · ' || left(new.body, 100)
    else left(coalesce(new.body, ''), 120)
  end;

  select coalesce(nullif(btrim(p.display_name), ''), '@' || p.username, 'Someone')
    into v_sender
    from public.profiles p
   where p.id = new.sender_id;

  if v_conv.conversation_type = 'direct' then
    if new.sender_id not in (v_conv.user_a, v_conv.user_b) then
      return new;
    end if;
    v_recipient := case when v_conv.user_a = new.sender_id then v_conv.user_b else v_conv.user_a end;
    if v_recipient is null or v_recipient = new.sender_id
       or public._is_conversation_muted(new.conversation_id, v_recipient) then
      return new;
    end if;
    perform public._upsert_thread_notification(
      v_recipient, 'message', coalesce(v_sender, 'New message'), v_preview,
      '/chats?c=' || new.conversation_id::text, new.created_at);

  elsif v_conv.conversation_type = 'support' then
    if coalesce(new.msg_type, 'text') not in ('text', 'image') then
      return new;
    end if;
    if new.sender_id = v_conv.client_id then
      for v_admin in
        select p.id from public.profiles p
         where p.is_admin and p.id <> new.sender_id
      loop
        perform public._upsert_thread_notification(
          v_admin, 'support', 'Support · ' || coalesce(v_sender, 'Someone'), v_preview,
          '/admin?section=support&c=' || new.conversation_id::text, new.created_at);
      end loop;
    elsif not public._is_conversation_muted(new.conversation_id, v_conv.client_id) then
      perform public._upsert_thread_notification(
        v_conv.client_id, 'message', 'BuildEx Support', v_preview,
        '/chats?c=' || new.conversation_id::text, new.created_at);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_conversation_message() from public, anon, authenticated;

-- 0112's email trigger, counting what _message_notifies() counts.
create or replace function public.queue_message_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_now       timestamptz := now();
  v_wants     boolean;
  v_read      timestamptz;
  v_latest    public.message_emails%rowtype;
begin
  if not public._message_notifies(new.msg_type, new.meta) then
    return new;
  end if;

  begin
    select case
             when c.conversation_type = 'direct' and new.sender_id in (c.user_a, c.user_b)
               then case when c.user_a = new.sender_id then c.user_b else c.user_a end
             when c.conversation_type = 'support' and new.sender_id <> c.client_id
               then c.client_id
           end
      into v_recipient
      from public.conversations c
     where c.id = new.conversation_id;

    if v_recipient is null or v_recipient = new.sender_id then
      return new;
    end if;

    if public._is_conversation_muted(new.conversation_id, v_recipient) then
      return new;
    end if;

    select p.email_on_message into v_wants
      from public.profiles p
     where p.id = v_recipient;

    if not coalesce(v_wants, false) then
      return new;
    end if;

    select cr.last_read_at into v_read
      from public.conversation_reads cr
     where cr.conversation_id = new.conversation_id
       and cr.user_id = v_recipient;

    select * into v_latest
      from public.message_emails e
     where e.recipient_id = v_recipient
       and e.conversation_id = new.conversation_id
     order by e.first_unread_at desc
     limit 1
     for update;

    if found and coalesce(v_read, '-infinity'::timestamptz) < v_latest.first_unread_at then
      return new;
    end if;

    if found and v_latest.status = 'pending' then
      update public.message_emails
         set status = 'read',
             updated_at = v_now
       where id = v_latest.id;
    end if;

    insert into public.message_emails (
      recipient_id, conversation_id, sender_id, first_unread_at, due_at
    )
    values (
      v_recipient, new.conversation_id, new.sender_id, v_now,
      v_now + public.message_email_delay()
    )
    on conflict (recipient_id, conversation_id) where status = 'pending' do nothing;
  exception when others then
    raise warning 'queue_message_email failed for message %: % (%)', new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

revoke all on function public.queue_message_email() from public, anon, authenticated;

-- 0112's claim with two changes: what is unread and what is previewed follows
-- _message_notifies(), and fixed English bodies are translated for Russian
-- recipients (_ru_message_text). Everything else is 0112 verbatim.
create or replace function public.claim_message_emails(p_limit int default 20)
returns table (
  email_id uuid,
  attempt int,
  recipient_id uuid,
  recipient_email text,
  locale text,
  conversation_id uuid,
  sender_name text,
  preview_kind text,
  preview_text text,
  unread_count int
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r         public.message_emails%rowtype;
  v_limit   int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_reason  text;
  v_wants   boolean;
  v_locale  text;
  v_email   text;
  v_read    timestamptz;
  v_count   int;
  v_kind    text;
  v_body    text;
  v_name    text;
  v_support boolean;
begin
  perform pg_advisory_xact_lock(hashtext('public.claim_message_emails'));

  for r in
    select e.*
      from public.message_emails e
     where (e.status = 'pending' and e.due_at <= now())
        or (e.status = 'sending' and e.claimed_at < now() - interval '15 minutes')
     order by e.due_at
     limit v_limit
     for update skip locked
  loop
    v_reason  := null;
    v_wants   := null;
    v_locale  := null;
    v_email   := null;
    v_read    := null;
    v_count   := 0;
    v_kind    := null;
    v_body    := null;
    v_name    := null;
    v_support := false;

    if r.attempts >= public.message_email_max_attempts() then
      update public.message_emails e
         set status = 'failed',
             last_error = coalesce(e.last_error, 'A send run stopped before recording the result'),
             updated_at = now()
       where e.id = r.id;
      continue;
    end if;

    select p.email_on_message, coalesce(p.locale, 'en')
      into v_wants, v_locale
      from public.profiles p
     where p.id = r.recipient_id;

    if not found then
      v_reason := 'no_account';
    end if;

    if v_reason is null then
      select cr.last_read_at into v_read
        from public.conversation_reads cr
       where cr.conversation_id = r.conversation_id
         and cr.user_id = r.recipient_id;

      if v_read is not null and v_read >= r.first_unread_at then
        update public.message_emails e
           set status = 'read', updated_at = now()
         where e.id = r.id;
        continue;
      end if;
    end if;

    if v_reason is null and r.first_unread_at < now() - public.message_email_max_age() then
      v_reason := 'stale';
    end if;

    if v_reason is null and not coalesce(v_wants, false) then
      v_reason := 'opted_out';
    end if;

    if v_reason is null and public._is_conversation_muted(r.conversation_id, r.recipient_id) then
      v_reason := 'muted';
    end if;

    if v_reason is null then
      select nullif(btrim(u.email), '') into v_email
        from auth.users u
       where u.id = r.recipient_id
         and u.deleted_at is null
         and (u.banned_until is null or u.banned_until <= now());

      if v_email is null then
        v_reason := 'no_email';
      end if;
    end if;

    if v_reason is null and exists (
      select 1 from public.conversation_reports cr
       where cr.conversation_id = r.conversation_id
         and cr.reporter_id = r.recipient_id
    ) then
      v_reason := 'reported';
    end if;

    select (c.conversation_type = 'support') into v_support
      from public.conversations c
     where c.id = r.conversation_id;
    v_support := coalesce(v_support, false);

    if v_reason is null and not v_support and exists (
      select 1 from public.builder_profiles bp
       where bp.id = r.sender_id
         and bp.is_hidden
    ) then
      v_reason := 'sender_hidden';
    end if;

    if v_reason is null then
      select count(*)::int into v_count
        from public.messages m
       where m.conversation_id = r.conversation_id
         and m.sender_id <> r.recipient_id
         and public._message_notifies(m.msg_type, m.meta)
         and m.created_at > coalesce(v_read, '-infinity'::timestamptz);

      if v_count = 0 then
        v_reason := 'nothing_unread';
      end if;
    end if;

    if v_reason is null and (
      select count(*) from public.message_emails e
       where e.id <> r.id
         and e.recipient_id = r.recipient_id
         and e.status in ('sending', 'sent')
         and e.claimed_at > now() - interval '1 hour'
    ) >= public.message_emails_per_hour() then
      v_reason := 'recipient_hourly_cap';
    end if;

    if v_reason is null and (
      select count(*) from public.message_emails e
       where e.id <> r.id
         and e.recipient_id = r.recipient_id
         and e.status in ('sending', 'sent')
         and e.claimed_at > now() - interval '1 day'
    ) >= public.message_emails_per_day() then
      v_reason := 'recipient_daily_cap';
    end if;

    if v_reason is null and (
      select count(*) from public.message_emails e
       where e.id <> r.id
         and e.status in ('sending', 'sent')
         and e.claimed_at > now() - interval '1 day'
    ) >= public.message_emails_global_per_day() then
      v_reason := 'global_daily_cap';
    end if;

    if v_reason is not null then
      update public.message_emails e
         set status = 'skipped',
             skip_reason = v_reason,
             updated_at = now()
       where e.id = r.id;
      continue;
    end if;

    if r.sender_name is null then
      if v_support then
        v_name := 'BuildEx Support';
      else
        select coalesce(nullif(btrim(p.display_name), ''), '@' || nullif(btrim(p.username), ''))
          into v_name
          from public.profiles p
         where p.id = r.sender_id;
      end if;

      select coalesce(m.msg_type, 'text'), regexp_replace(btrim(coalesce(m.body, '')), '\s+', ' ', 'g')
        into v_kind, v_body
        from public.messages m
       where m.conversation_id = r.conversation_id
         and m.sender_id <> r.recipient_id
         and public._message_notifies(m.msg_type, m.meta)
         and m.created_at > coalesce(v_read, '-infinity'::timestamptz)
       order by m.created_at desc
       limit 1;

      if v_kind in ('brief', 'system') and v_locale = 'ru' then
        v_body := public._ru_message_text(v_body);
      end if;

      r.sender_name  := coalesce(v_name, '');
      r.preview_kind := case
                          when v_kind = 'image' and v_body = '' then 'photo'
                          when v_kind = 'image' then 'photo_caption'
                          else 'text'
                        end;
      r.preview_text := left(v_body, 300);
      r.unread_count := v_count;
      r.locale       := v_locale;
    end if;

    update public.message_emails e
       set status = 'sending',
           attempts = e.attempts + 1,
           claimed_at = now(),
           sender_name = r.sender_name,
           preview_kind = r.preview_kind,
           preview_text = r.preview_text,
           unread_count = r.unread_count,
           locale = r.locale,
           updated_at = now()
     where e.id = r.id;

    email_id        := r.id;
    attempt         := r.attempts + 1;
    recipient_id    := r.recipient_id;
    recipient_email := v_email;
    locale          := r.locale;
    conversation_id := r.conversation_id;
    sender_name     := r.sender_name;
    preview_kind    := r.preview_kind;
    preview_text    := r.preview_text;
    unread_count    := r.unread_count;
    return next;
  end loop;
end;
$$;

revoke all on function public.claim_message_emails(int) from public, anon, authenticated;
grant execute on function public.claim_message_emails(int) to service_role;


notify pgrst, 'reload schema';

select
  to_regclass('public.briefs') is not null as briefs,
  to_regclass('public.chat_orders') is not null as chat_orders,
  (select count(*) from information_schema.columns
    where table_name = 'builder_reviews' and column_name = 'order_id') as review_order_col,
  has_function_privilege('anon', 'public.send_brief(uuid, jsonb)', 'execute') as anon_can_send;

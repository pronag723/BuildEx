-- A signed-in account can review any visible builder other than themselves.
-- can_review_builder and upsert_builder_review use the signed-in account ID.
create or replace function public._review_eligibility(p_reviewer uuid, p_builder uuid)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
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
  return 'ok';
end;
$$;

revoke all on function public._review_eligibility(uuid, uuid) from public, anon, authenticated;

create or replace function public.upsert_builder_review(
  p_builder uuid,
  p_rating int,
  p_body text,
  p_tier uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := public._review_eligibility(v_uid, p_builder);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_status = 'not_signed_in' then
    raise exception 'Sign in to leave a review.' using errcode = 'insufficient_privilege';
  elsif v_status = 'self' then
    raise exception 'You cannot review yourself.' using errcode = 'check_violation';
  elsif v_status <> 'ok' then
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
  if p_tier is not null and not exists (
    select 1 from public.builder_price_tiers t where t.id = p_tier and t.builder_id = p_builder
  ) then
    raise exception 'That price tier belongs to another builder.' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.builder_reviews where builder_id = p_builder and reviewer_id = v_uid
  ) and (
    select count(*) from public.builder_reviews
     where reviewer_id = v_uid and created_at > now() - interval '1 day'
  ) >= public.reviews_per_day() then
    raise exception 'You have written too many reviews today. Please try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  -- The chat RPC uses the same conflict key. Profile edits keep the order link
  -- and both routes leave the moderator's hide fields intact.
  insert into public.builder_reviews (builder_id, reviewer_id, price_tier_id, rating, body)
  values (p_builder, v_uid, p_tier, p_rating, v_body)
  on conflict on constraint builder_reviews_one_per_reviewer do update
     set price_tier_id = excluded.price_tier_id,
         rating        = excluded.rating,
         body          = excluded.body,
         updated_at    = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_builder_review(uuid, int, text, uuid) from public, anon;
grant execute on function public.upsert_builder_review(uuid, int, text, uuid) to authenticated;

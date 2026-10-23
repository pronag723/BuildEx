-- =============================================================================
-- 0105 — Email-code sign-in: no passwords, and room in Resend for the codes
--
-- BuildEx now signs people in with Google, Discord, or a 6-digit code emailed
-- to them (signInWithOtp + verifyOtp, lib/auth/AuthContext.jsx). There are no
-- passwords anywhere in the app.
--
-- 1. No passwords in auth.users
-- -----------------------------
-- Turning the Email provider on for codes also turns on password sign-up:
-- anyone holding the publishable key (it ships in the site's JS bundle) can
-- call auth.signUp({ email, password }). That lets an attacker pre-create an
-- account for someone else's address with a password the attacker knows.
-- Nothing happens until the real owner signs in with a code, which confirms
-- the address on that same account — and from then on the attacker's password
-- opens the owner's account.
--
-- Supabase has no switch that keeps email codes but turns passwords off, so the
-- password is simply never stored: a BEFORE trigger blanks encrypted_password
-- on every insert, and on every update that sets it. An empty hash matches no
-- password, so password sign-in always fails with "Invalid login credentials";
-- signUp still answers as usual, so it reveals nothing about the address. The
-- same trigger neutralises updateUser({ password }).
--
-- The one-off UPDATE clears any password stored before this ran.
--
-- The function is invoker-rights and touches nothing but NEW, so it needs no
-- privileges. Postgres checks EXECUTE on a trigger function only when the
-- trigger is created, never when it fires; the explicit grant to
-- supabase_auth_admin (the role GoTrue writes auth.users as) is belt and braces.
--
-- 2. Chat emails give way to sign-in codes
-- ----------------------------------------
-- Sign-in codes go out through Resend (custom SMTP in Authentication → Emails:
-- smtp.resend.com, sender login@buildex.builders) on the same free plan as the
-- 0104 chat emails, which allows 100 emails a day. Chat emails drop from 90 to
-- 60 a day so a busy day of messages can never lock people out of signing in.
-- The codes themselves are bounded by Supabase's own email rate limit
-- (Authentication → Rate limits, about 30 an hour).
--
-- Idempotent.
-- =============================================================================


-- ─── 1. No passwords ─────────────────────────────────────────────────────────

create or replace function public.strip_auth_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.encrypted_password := '';
  return new;
end;
$$;

comment on function public.strip_auth_password() is
  'BEFORE trigger on auth.users: BuildEx has no passwords, so none is ever stored (0105).';

revoke all on function public.strip_auth_password() from public, anon, authenticated;
grant execute on function public.strip_auth_password() to supabase_auth_admin;

drop trigger if exists users_no_password on auth.users;
create trigger users_no_password
  before insert or update of encrypted_password on auth.users
  for each row
  execute function public.strip_auth_password();

update auth.users
   set encrypted_password = ''
 where encrypted_password <> '';


-- ─── 2. Chat emails: 60 a day, not 90 ────────────────────────────────────────
-- Same signature and attributes as 0104; CREATE OR REPLACE keeps its grants,
-- and the revoke below is repeated only so this file stands on its own.

create or replace function public.message_emails_global_per_day()
returns int
language sql
immutable
set search_path = public
as $$ select 60; $$;

revoke all on function public.message_emails_global_per_day() from public, anon, authenticated;

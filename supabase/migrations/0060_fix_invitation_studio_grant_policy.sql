-- BuildEx — keep invitation RLS from directly reading private studio columns.
--
-- Browser roles intentionally have only column-level grants on studios. The
-- moderator invitation policy was added after that lockdown and still queried
-- studios directly, causing "permission denied for table studios" while the
-- builder invitation relation was being read.

drop policy if exists "studio moderator reads invitations" on public.studio_builder_invitations;
create policy "studio moderator reads invitations"
  on public.studio_builder_invitations for select to authenticated
  using (public.is_studio_moderator(studio_id));

notify pgrst, 'reload schema';

-- Allow admins to update any profile (e.g. rename team_name)
create policy profiles_admin_update on profiles for update
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- Allow admins to delete any profile (cascades to predictions)
create policy profiles_admin_delete on profiles for delete
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- Enable RLS on all tables
alter table profiles         enable row level security;
alter table matches          enable row level security;
alter table match_events     enable row level security;
alter table predictions      enable row level security;
alter table result_audit     enable row level security;

-- ===== 11.1 Profiles =====

-- Everyone authenticated can read profiles (needed for leaderboard names).
create policy profiles_read on profiles for select
    using (auth.role() = 'authenticated');
-- You can create only your own profile row.
create policy profiles_insert_own on profiles for insert
    with check (auth.uid() = id);
-- You can update only your own profile (UI does not expose team-name edits per FR-4).
create policy profiles_update_own on profiles for update
    using (auth.uid() = id);

-- ===== 11.2 Matches & events (admin writes only) =====

-- Everyone reads fixtures and results.
create policy matches_read on matches for select
    using (auth.role() = 'authenticated');
create policy events_read on match_events for select
    using (auth.role() = 'authenticated');

-- Only admins write fixtures/results/events.
create policy matches_admin_write on matches for all
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
    with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
create policy events_admin_write on match_events for all
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
    with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- ===== 11.3 Predictions — the lock and the tamper-proofing =====

-- READ: always your own.
create policy predictions_read_own on predictions for select
    using (auth.uid() = user_id);
-- READ: others' picks only AFTER that match has kicked off (transparency, no pre-lock copying).
create policy predictions_read_after_kickoff on predictions for select
    using (exists (select 1 from matches m
                   where m.id = match_id and m.kickoff_utc <= now()));

-- INSERT: only your own row, and only BEFORE kickoff.
create policy predictions_insert_locked on predictions for insert
    with check (
        auth.uid() = user_id
        and exists (select 1 from matches m where m.id = match_id and now() < m.kickoff_utc)
    );

-- UPDATE: only your own row, and only BEFORE kickoff.
create policy predictions_update_locked on predictions for update
    using (auth.uid() = user_id)
    with check (
        auth.uid() = user_id
        and exists (select 1 from matches m where m.id = match_id and now() < m.kickoff_utc)
    );

-- NOTE: There is deliberately NO admin write policy on predictions and NO delete policy.
-- => Nobody, including the admin, can create, edit, or delete another user's prediction.
-- => After kickoff, even the owner cannot edit their own. This is what prevents disputes.

-- ===== 11.4 Audit log =====

create policy audit_read_admin on result_audit for select
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
create policy audit_insert_admin on result_audit for insert
    with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

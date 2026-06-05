-- ---------- players: world cup squad rosters ----------
create table players (
    id          bigint generated always as identity primary key,
    team        text not null,
    name        text not null,
    created_at  timestamptz not null default now(),
    unique (team, name)
);
create index players_team_idx on players (team);

alter table players enable row level security;

-- Everyone authenticated can read the player list.
create policy players_read on players for select
    using (auth.role() = 'authenticated');

-- Only admins can write (insert/update/delete).
create policy players_admin_write on players for all
    using  (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
    with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

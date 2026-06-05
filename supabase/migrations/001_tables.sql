-- ---------- profiles: one row per user, holds the team name ----------
create table profiles (
    id             uuid primary key references auth.users(id) on delete cascade,
    team_name      text not null,                                -- display name in the league; unique (see index)
    is_admin       boolean not null default false,              -- true only for the owner
    created_at     timestamptz not null default now()
);
-- Case-insensitive uniqueness for team names:
create unique index profiles_team_name_unique on profiles (lower(team_name));

-- ---------- matches: fixtures; result columns filled by admin ----------
create table matches (
    id                   bigint generated always as identity primary key,
    ext_id               text unique,                            -- stable id from the fixtures source, for syncing
    stage                text not null,                          -- group | r32 | r16 | qf | sf | 3rd | final
    group_label          text,                                   -- 'A'..'L' for group stage, else null
    home_team            text not null,
    away_team            text not null,
    kickoff_utc          timestamptz not null,                   -- THE lock boundary
    status               text not null default 'scheduled'
                             check (status in ('scheduled', 'finished')),
    home_score           int,                                    -- 90-minute score (null until finished)
    away_score           int,
    first_scorer_team    text                                    -- 'home' | 'away' | 'none' (null until finished)
                             check (first_scorer_team in ('home', 'away', 'none')),
    created_at           timestamptz not null default now()
);
create index matches_kickoff_idx on matches (kickoff_utc);

-- ---------- match_events: actual goalscorers and assist-makers ----------
-- One row per goal-credit and per assist-credit, entered by the admin.
create table match_events (
    id            bigint generated always as identity primary key,
    match_id      bigint not null references matches(id) on delete cascade,
    player_name   text not null,
    event_type    text not null check (event_type in ('goal', 'assist'))
);
create index match_events_match_idx on match_events (match_id);

-- ---------- predictions: one per user per match ----------
create table predictions (
    id                    bigint generated always as identity primary key,
    user_id               uuid not null references profiles(id) on delete cascade,
    match_id              bigint not null references matches(id) on delete cascade,
    pred_home_score       int  not null,
    pred_away_score       int  not null,
    pred_first_team       text not null check (pred_first_team in ('home', 'away', 'none')),
    pred_player_name      text not null,                        -- mandatory (A3/D1)
    base_points           numeric not null default 0,           -- pre-multiplier total (max 9), kept for transparency
    points                numeric not null default 0,           -- base_points * stage multiplier; the awarded score
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    unique (user_id, match_id)                                  -- at most one prediction per user per match
);
create index predictions_match_idx on predictions (match_id);

-- ---------- result_audit: traceability for every result save (FR-15) ----------
create table result_audit (
    id           bigint generated always as identity primary key,
    match_id     bigint not null references matches(id) on delete cascade,
    changed_by   uuid   not null references profiles(id),
    snapshot     jsonb  not null,                               -- full result + events at time of save
    created_at   timestamptz not null default now()
);

-- ---------- leaderboard view (read by everyone) ----------
create view leaderboard as
select
    pr.id                                                            as user_id,
    pr.team_name,
    coalesce(sum(p.points), 0)                                       as total_points,
    count(p.id) filter (where p.points > 0)                         as scoring_matches
from profiles pr
left join predictions p on p.user_id = pr.id
group by pr.id, pr.team_name
order by total_points desc, pr.team_name asc;

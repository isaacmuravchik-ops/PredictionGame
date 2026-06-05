-- Run this in the Supabase SQL editor to insert a handful of test matches.
-- Safe to re-run (upserts on ext_id). Delete when you sync real fixtures via Phase 4.

insert into matches (ext_id, stage, group_label, home_team, away_team, kickoff_utc)
values
  ('test-g-1', 'group', 'A', 'USA',       'Mexico',   '2026-06-12 19:00:00+00'),
  ('test-g-2', 'group', 'A', 'Canada',    'Brazil',   '2026-06-12 22:00:00+00'),
  ('test-g-3', 'group', 'B', 'England',   'France',   '2026-06-13 19:00:00+00'),
  ('test-g-4', 'group', 'B', 'Germany',   'Spain',    '2026-06-13 22:00:00+00'),
  ('test-g-5', 'group', 'C', 'Argentina', 'Portugal', '2026-06-14 19:00:00+00')
on conflict (ext_id) do update
  set home_team    = excluded.home_team,
      away_team    = excluded.away_team,
      kickoff_utc  = excluded.kickoff_utc;

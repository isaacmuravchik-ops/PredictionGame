-- Add bot flag and points offset to profiles
alter table profiles add column is_bot boolean not null default false;
alter table profiles add column points_offset integer not null default 0;

-- Add optional rationale column to predictions (only populated for bot predictions)
alter table predictions add column rationale text;

-- Rebuild leaderboard view: expose is_bot and fold in points_offset
drop view leaderboard;
create view leaderboard as
select
    pr.id                                                              as user_id,
    pr.team_name,
    pr.real_name,
    pr.is_bot,
    coalesce(sum(p.points), 0) + pr.points_offset                    as total_points,
    count(p.id) filter (
        where exists (
            select 1 from matches m
            where m.id = p.match_id and m.status = 'finished'
        )
    )                                                                  as played_matches
from profiles pr
left join predictions p on p.user_id = pr.id
group by pr.id, pr.team_name, pr.real_name, pr.is_bot, pr.points_offset
order by total_points desc, pr.team_name asc;

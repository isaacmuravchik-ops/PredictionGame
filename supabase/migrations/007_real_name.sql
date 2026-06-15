-- Add optional real name field to profiles (admin-set, shown on leaderboard)
alter table profiles add column real_name text;

-- Rebuild leaderboard view to expose real_name
drop view leaderboard;
create view leaderboard as
select
    pr.id                                                            as user_id,
    pr.team_name,
    pr.real_name,
    coalesce(sum(p.points), 0)                                       as total_points,
    count(p.id) filter (
        where exists (
            select 1 from matches m
            where m.id = p.match_id and m.status = 'finished'
        )
    )                                                                as played_matches
from profiles pr
left join predictions p on p.user_id = pr.id
group by pr.id, pr.team_name, pr.real_name
order by total_points desc, pr.team_name asc;

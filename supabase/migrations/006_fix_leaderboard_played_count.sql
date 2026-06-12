-- Fix leaderboard: count all predictions for finished matches, not just ones with points > 0.
-- Also renames scoring_matches → played_matches to reflect the corrected meaning.
create or replace view leaderboard as
select
    pr.id                                                            as user_id,
    pr.team_name,
    coalesce(sum(p.points), 0)                                       as total_points,
    count(p.id) filter (
        where exists (
            select 1 from matches m
            where m.id = p.match_id and m.status = 'finished'
        )
    )                                                                as played_matches
from profiles pr
left join predictions p on p.user_id = pr.id
group by pr.id, pr.team_name
order by total_points desc, pr.team_name asc;

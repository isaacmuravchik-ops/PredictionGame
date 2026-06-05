-- Grading function (SECURITY DEFINER so it can write points despite predictions RLS).
-- Triggered automatically when a result is saved.
create or replace function grade_match(p_match_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    m         matches%rowtype;
    result_outcome text;
    v_mult    numeric;
begin
    select * into m from matches where id = p_match_id;
    if m.id is null or m.status <> 'finished'
          or m.home_score is null or m.away_score is null then
        return;
    end if;

    result_outcome := case
        when m.home_score > m.away_score then 'home'
        when m.home_score < m.away_score then 'away'
        else 'draw' end;

    -- Stage multiplier (§7.4). Change these numbers to re-balance the game.
    v_mult := case m.stage
        when 'group' then 1.0
        when 'r32'   then 1.5
        when 'r16'   then 2.0
        when 'qf'    then 2.5
        when 'sf'    then 3.0
        when '3rd'   then 2.0   -- D2 default; adjust if desired
        when 'final' then 4.0
        else 1.0 end;

    -- Compute base score per prediction in a subquery, then write base + multiplied total.
    update predictions p set
        base_points = g.base,
        points      = g.base * v_mult,
        updated_at  = now()
    from (
        select pr.id,
            (
                -- (1) Scoreline component: best single tier
                (case
                    when pr.pred_home_score = m.home_score
                      and pr.pred_away_score = m.away_score then 5
                    when (case when pr.pred_home_score > pr.pred_away_score then 'home'
                               when pr.pred_home_score < pr.pred_away_score then 'away'
                               else 'draw' end) = result_outcome
                      and (pr.pred_home_score - pr.pred_away_score) = (m.home_score - m.away_score) then 3
                    when (case when pr.pred_home_score > pr.pred_away_score then 'home'
                               when pr.pred_home_score < pr.pred_away_score then 'away'
                               else 'draw' end) = result_outcome then 2
                    else 0
                end)
                -- (2) First team to score
                + (case when pr.pred_first_team = m.first_scorer_team then 1 else 0 end)
                -- (3a) Picked player scored (max 1 goal counts)
                + (case when exists (
                              select 1 from match_events e
                              where e.match_id = m.id and e.event_type = 'goal'
                                  and lower(e.player_name) = lower(pr.pred_player_name)
                          ) then 2 else 0 end)
                -- (3b) Picked player assisted (max 1 assist counts)
                + (case when exists (
                              select 1 from match_events e
                              where e.match_id = m.id and e.event_type = 'assist'
                                  and lower(e.player_name) = lower(pr.pred_player_name)
                          ) then 1 else 0 end)
            ) as base
        from predictions pr
        where pr.match_id = p_match_id
    ) g
    where p.id = g.id;
end; $$;

-- Re-grade automatically whenever a result is saved/changed.
create or replace function trg_grade_match()
returns trigger language plpgsql as $$
begin
    if new.status = 'finished' then
        perform grade_match(new.id);
    end if;
    return new;
end; $$;

create trigger grade_on_result
after update of status, home_score, away_score, first_scorer_team on matches
for each row execute function trg_grade_match();

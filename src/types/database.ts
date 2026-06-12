export interface Profile {
  id: string
  team_name: string
  is_admin: boolean
  created_at: string
}

export interface Match {
  id: number
  ext_id: string | null
  stage: 'group' | 'r32' | 'r16' | 'qf' | 'sf' | '3rd' | 'final'
  group_label: string | null
  home_team: string
  away_team: string
  kickoff_utc: string
  status: 'scheduled' | 'finished'
  home_score: number | null
  away_score: number | null
  first_scorer_team: 'home' | 'away' | 'none' | null
  created_at: string
}

export interface Prediction {
  id: number
  user_id: string
  match_id: number
  pred_home_score: number
  pred_away_score: number
  pred_first_team: 'home' | 'away' | 'none'
  pred_player_name: string
  base_points: number
  points: number
  created_at: string
  updated_at: string
}

export interface MatchEvent {
  id: number
  match_id: number
  player_name: string
  event_type: 'goal' | 'assist'
}

export interface LeaderboardRow {
  user_id: string
  team_name: string
  total_points: number
  played_matches: number
}

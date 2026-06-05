import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { AdminLayout } from './AdminLayout'
import type { Profile, Prediction, Match } from '../../types/database'
import { stageLabel, firstTeamLabel, formatKickoffTime, formatDateHeading } from '../../lib/utils'

type Tab = 'users' | 'predictions' | 'results' | 'audit'

type PredictionRow = Prediction & {
  profiles: { team_name: string }
  matches: { home_team: string; away_team: string; kickoff_utc: string; stage: string; group_label: string | null }
}

type AuditRow = {
  id: number
  match_id: number
  created_at: string
  changed_by: string
  snapshot: Record<string, unknown>
  profiles: { team_name: string }
  matches: { home_team: string; away_team: string }
}

type UserRow = Profile & { total_points: number; prediction_count: number }

export function AdminData() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'users') as Tab

  const [users, setUsers] = useState<UserRow[]>([])
  const [predictions, setPredictions] = useState<PredictionRow[]>([])
  const [results, setResults] = useState<Match[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loaded, setLoaded] = useState<Set<Tab>>(new Set())

  useEffect(() => {
    if (loaded.has(tab)) return
    setLoaded(prev => new Set([...prev, tab]))

    if (tab === 'users') {
      // Join leaderboard view with profiles for full picture
      Promise.all([
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('leaderboard').select('user_id, total_points, scoring_matches'),
      ]).then(([{ data: pData }, { data: lData }]) => {
        const lMap = new Map((lData ?? []).map((r: { user_id: string; total_points: number }) => [r.user_id, r]))
        const rows = ((pData ?? []) as Profile[]).map(p => ({
          ...p,
          total_points: Number((lMap.get(p.id) as { total_points: number } | undefined)?.total_points ?? 0),
          prediction_count: Number((lMap.get(p.id) as { scoring_matches: number } | undefined)?.scoring_matches ?? 0),
        }))
        setUsers(rows)
      })
    }

    if (tab === 'predictions') {
      supabase
        .from('predictions')
        .select('*, profiles(team_name), matches(home_team, away_team, kickoff_utc, stage, group_label)')
        .order('updated_at', { ascending: false })
        .then(({ data }) => setPredictions((data ?? []) as PredictionRow[]))
    }

    if (tab === 'results') {
      supabase
        .from('matches')
        .select('*')
        .eq('status', 'finished')
        .order('kickoff_utc')
        .then(({ data }) => setResults((data ?? []) as Match[]))
    }

    if (tab === 'audit') {
      supabase
        .from('result_audit')
        .select('*, profiles(team_name), matches(home_team, away_team)')
        .order('created_at', { ascending: false })
        .then(({ data }) => setAudit((data ?? []) as AuditRow[]))
    }
  }, [tab, loaded])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: 'Users' },
    { key: 'predictions', label: 'Predictions' },
    { key: 'results', label: 'Results' },
    { key: 'audit', label: 'Audit log' },
  ]

  return (
    <AdminLayout>
      <h1 className="text-lg font-bold text-gray-800 mb-4">Data View</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSearchParams({ tab: t.key })}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-green-700 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        {tab === 'users' && <UsersTable rows={users} />}
        {tab === 'predictions' && <PredictionsTable rows={predictions} />}
        {tab === 'results' && <ResultsTable rows={results} />}
        {tab === 'audit' && <AuditTable rows={audit} />}
      </div>
    </AdminLayout>
  )
}

// ── Table components ───────────────────────────────────────────────────────────

function UsersTable({ rows }: { rows: UserRow[] }) {
  return (
    <table className="w-full text-sm bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
      <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
        <tr>
          <th className="text-left py-3 px-4">Team name</th>
          <th className="text-left py-3 px-4">Admin</th>
          <th className="text-right py-3 px-4">Points</th>
          <th className="text-right py-3 px-4">Joined</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map(u => (
          <tr key={u.id} className="hover:bg-gray-50">
            <td className="py-2.5 px-4 font-medium text-gray-800">{u.team_name}</td>
            <td className="py-2.5 px-4 text-gray-500">{u.is_admin ? '✓' : '—'}</td>
            <td className="py-2.5 px-4 text-right font-semibold text-gray-700">{u.total_points}</td>
            <td className="py-2.5 px-4 text-right text-gray-400 text-xs">
              {new Date(u.created_at).toLocaleDateString()}
            </td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-400">No users yet.</td></tr>}
      </tbody>
    </table>
  )
}

function PredictionsTable({ rows }: { rows: PredictionRow[] }) {
  return (
    <table className="w-full text-sm bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
      <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
        <tr>
          <th className="text-left py-3 px-4">Team</th>
          <th className="text-left py-3 px-4">Match</th>
          <th className="text-center py-3 px-4">Score</th>
          <th className="text-center py-3 px-4">1st</th>
          <th className="text-left py-3 px-4">Player</th>
          <th className="text-right py-3 px-4">Base</th>
          <th className="text-right py-3 px-4">Points</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map(p => (
          <tr key={p.id} className="hover:bg-gray-50">
            <td className="py-2 px-4 font-medium text-gray-800">{p.profiles.team_name}</td>
            <td className="py-2 px-4 text-gray-600 text-xs">
              <div>{p.matches.home_team} vs {p.matches.away_team}</div>
              <div className="text-gray-400">{stageLabel(p.matches.stage, p.matches.group_label)} · {formatDateHeading(p.matches.kickoff_utc)}</div>
            </td>
            <td className="py-2 px-4 text-center font-mono">{p.pred_home_score}–{p.pred_away_score}</td>
            <td className="py-2 px-4 text-center text-gray-600 text-xs">{firstTeamLabel(p.pred_first_team)}</td>
            <td className="py-2 px-4 text-gray-600">{p.pred_player_name}</td>
            <td className="py-2 px-4 text-right text-gray-500">{p.base_points}</td>
            <td className="py-2 px-4 text-right font-semibold text-green-700">{p.points}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-400">No predictions yet.</td></tr>}
      </tbody>
    </table>
  )
}

function ResultsTable({ rows }: { rows: Match[] }) {
  return (
    <table className="w-full text-sm bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
      <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
        <tr>
          <th className="text-left py-3 px-4">Match</th>
          <th className="text-left py-3 px-4">Stage</th>
          <th className="text-center py-3 px-4">Score</th>
          <th className="text-center py-3 px-4">1st scorer</th>
          <th className="text-right py-3 px-4">Kickoff</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map(m => (
          <tr key={m.id} className="hover:bg-gray-50">
            <td className="py-2.5 px-4 font-medium text-gray-800">{m.home_team} vs {m.away_team}</td>
            <td className="py-2.5 px-4 text-gray-500 text-xs">{stageLabel(m.stage, m.group_label)}</td>
            <td className="py-2.5 px-4 text-center font-bold">{m.home_score}–{m.away_score}</td>
            <td className="py-2.5 px-4 text-center text-gray-600 text-xs capitalize">{m.first_scorer_team}</td>
            <td className="py-2.5 px-4 text-right text-gray-400 text-xs">
              {formatDateHeading(m.kickoff_utc)} {formatKickoffTime(m.kickoff_utc)}
            </td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-gray-400">No finished matches yet.</td></tr>}
      </tbody>
    </table>
  )
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <table className="w-full text-sm bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
      <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
        <tr>
          <th className="text-left py-3 px-4">When</th>
          <th className="text-left py-3 px-4">Match</th>
          <th className="text-left py-3 px-4">By</th>
          <th className="text-left py-3 px-4">Snapshot</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {rows.map(a => (
          <tr key={a.id} className="hover:bg-gray-50 align-top">
            <td className="py-2.5 px-4 text-gray-400 text-xs whitespace-nowrap">
              {new Date(a.created_at).toLocaleString()}
            </td>
            <td className="py-2.5 px-4 text-gray-700 text-xs">
              {a.matches.home_team} vs {a.matches.away_team}
            </td>
            <td className="py-2.5 px-4 text-gray-600">{a.profiles.team_name}</td>
            <td className="py-2.5 px-4 text-xs text-gray-400 font-mono max-w-xs truncate">
              {JSON.stringify(a.snapshot)}
            </td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-400">No audit entries yet.</td></tr>}
      </tbody>
    </table>
  )
}

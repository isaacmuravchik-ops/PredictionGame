import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Header } from '../components/Header'
import { STAGE_MULTIPLIERS } from '../lib/utils'
import type { LeaderboardRow } from '../types/database'

type Tab = 'standings' | 'form'

interface RecentScore {
  pts: number
  maxPts: number
}

interface FormEntry {
  user_id: string
  team_name: string
  is_bot: boolean
  recentPts: number
  recentScores: RecentScore[]
  rankMovement: number
}

const FORM_WINDOW = 5

function fmtPts(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

export function Leaderboard() {
  const { session } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [formRows, setFormRows] = useState<FormEntry[]>([])
  const [hasFormData, setHasFormData] = useState(false)
  const [tab, setTab] = useState<Tab>('standings')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: lbData }, { data: matchData }] = await Promise.all([
        supabase.from('leaderboard').select('*'),
        supabase
          .from('matches')
          .select('id, kickoff_utc, stage, predictions(user_id, points)')
          .eq('status', 'finished')
          .order('kickoff_utc', { ascending: false }),
      ])

      const lb = (lbData ?? []) as LeaderboardRow[]
      const matches = (matchData ?? []) as Array<{
        id: number
        kickoff_utc: string
        stage: string
        predictions: { user_id: string; points: number }[]
      }>

      setRows(lb)

      const recentMatches = matches.slice(0, FORM_WINDOW)

      // Per-user recent points and ordered scores (chronological = oldest first)
      const recentPtsMap: Record<string, number> = {}
      const recentScoresMap: Record<string, RecentScore[]> = {}

      for (const match of [...recentMatches].reverse()) {
        const maxPts = 9 * (STAGE_MULTIPLIERS[match.stage] ?? 1)
        for (const pred of match.predictions) {
          const pts = Number(pred.points)
          recentPtsMap[pred.user_id] = (recentPtsMap[pred.user_id] ?? 0) + pts
          if (!recentScoresMap[pred.user_id]) recentScoresMap[pred.user_id] = []
          recentScoresMap[pred.user_id].push({ pts, maxPts })
        }
      }

      // Current rank from leaderboard (already sorted desc by total_points)
      const currentRankMap: Record<string, number> = {}
      lb.forEach((r, i) => { currentRankMap[r.user_id] = i + 1 })

      // "Old rank": rank by total_points minus recent points
      const oldRankInput = lb
        .map(r => ({
          user_id: r.user_id,
          oldTotal: Number(r.total_points) - (recentPtsMap[r.user_id] ?? 0),
        }))
        .sort((a, b) => b.oldTotal - a.oldTotal)

      const oldRankMap: Record<string, number> = {}
      oldRankInput.forEach((r, i) => { oldRankMap[r.user_id] = i + 1 })

      const form: FormEntry[] = lb
        .map(r => ({
          user_id: r.user_id,
          team_name: r.team_name,
          is_bot: r.is_bot,
          recentPts: recentPtsMap[r.user_id] ?? 0,
          recentScores: recentScoresMap[r.user_id] ?? [],
          rankMovement: (oldRankMap[r.user_id] ?? currentRankMap[r.user_id]) - currentRankMap[r.user_id],
        }))
        .sort((a, b) => b.recentPts - a.recentPts)

      setFormRows(form)
      setHasFormData(recentMatches.length > 0)
      setLoading(false)
    }

    load()
  }, [])

  const onFire = formRows[0] ?? null
  const topClimber = [...formRows].sort((a, b) => b.rankMovement - a.rankMovement)[0] ?? null
  const topDropper = [...formRows].sort((a, b) => a.rankMovement - b.rankMovement)[0] ?? null

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4">
        <h1 className="text-lg font-bold text-gray-800 mb-4">Leaderboard</h1>

        <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
          {(['standings', 'form'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'standings' ? 'Standings' : 'Recent Form'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : tab === 'standings' ? (
          <StandingsTab rows={rows} myId={session!.user.id} />
        ) : (
          <FormTab
            formRows={formRows}
            hasFormData={hasFormData}
            myId={session!.user.id}
            onFire={onFire}
            topClimber={topClimber}
            topDropper={topDropper}
          />
        )}
      </main>
    </>
  )
}

function StandingsTab({ rows, myId }: { rows: LeaderboardRow[]; myId: string }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">🏆</p>
        <p>No scores yet — check back after the first match.</p>
      </div>
    )
  }

  const leaderPts = Math.max(1, ...rows.map(r => Number(r.total_points)))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr className="text-xs text-gray-400 uppercase tracking-wide">
            <th className="text-center py-3 px-4 font-medium w-10">#</th>
            <th className="text-left py-3 px-4 font-medium">Team</th>
            <th className="text-right py-3 px-4 font-medium">Points</th>
            <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">Avg</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row, i) => {
            const isMe = row.user_id === myId
            const barPct = Math.round((Number(row.total_points) / leaderPts) * 100)
            const played = Number(row.played_matches)
            const avg = played > 0
              ? (Number(row.total_points) / played).toLocaleString(undefined, { maximumFractionDigits: 1 })
              : '—'
            return (
              <tr key={row.user_id} className={isMe ? 'bg-green-50' : 'hover:bg-gray-50'}>
                <td className="py-3 px-4 text-center font-bold text-gray-400">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>
                <td className="py-3 px-4">
                  <span className="font-semibold text-gray-800">{row.team_name}</span>
                  {isMe && <span className="ml-2 text-xs font-normal text-green-600">(you)</span>}
                  {row.is_bot && <span className="ml-2 text-xs font-normal text-purple-500">🤖 AI</span>}
                  {row.real_name && !row.is_bot && <p className="text-xs text-gray-400 leading-tight">{row.real_name}</p>}
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={`text-xl font-black tabular-nums ${isMe ? 'text-green-700' : i === 0 ? 'text-green-800' : 'text-gray-800'}`}>
                    {Number(row.total_points).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">pts</span>
                  <div className="mt-1 h-0.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isMe ? 'bg-green-500' : i === 0 ? 'bg-green-600' : 'bg-gray-300'}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-gray-400 hidden sm:table-cell text-xs">
                  {avg} pts/m
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FormTab({
  formRows, hasFormData, myId, onFire, topClimber, topDropper,
}: {
  formRows: FormEntry[]
  hasFormData: boolean
  myId: string
  onFire: FormEntry | null
  topClimber: FormEntry | null
  topDropper: FormEntry | null
}) {
  if (!hasFormData) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📈</p>
        <p>No results yet — check back after the first match is graded.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <HighlightCard
          icon="🔥"
          label="On Fire"
          name={onFire?.team_name ?? '—'}
          stat={onFire ? `${fmtPts(onFire.recentPts)} pts` : '—'}
        />
        <HighlightCard
          icon="📈"
          label="Climbing"
          name={topClimber && topClimber.rankMovement > 0 ? topClimber.team_name : '—'}
          stat={topClimber && topClimber.rankMovement > 0 ? `+${topClimber.rankMovement} spots` : 'No change'}
          statColor={topClimber && topClimber.rankMovement > 0 ? 'text-green-600' : 'text-gray-400'}
        />
        <HighlightCard
          icon="📉"
          label="Dropping"
          name={topDropper && topDropper.rankMovement < 0 ? topDropper.team_name : '—'}
          stat={topDropper && topDropper.rankMovement < 0 ? `${topDropper.rankMovement} spots` : 'No change'}
          statColor={topDropper && topDropper.rankMovement < 0 ? 'text-red-500' : 'text-gray-400'}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-2 border-b border-gray-50">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Last {FORM_WINDOW} matches
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr className="text-xs text-gray-400 uppercase tracking-wide">
              <th className="text-left py-2 px-4 font-medium">Team</th>
              <th className="text-center py-2 px-4 font-medium">Form</th>
              <th className="text-right py-2 px-4 font-medium">L5 pts</th>
              <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">+/−</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {formRows.map(row => {
              const isMe = row.user_id === myId
              const mv = row.rankMovement
              return (
                <tr key={row.user_id} className={isMe ? 'bg-green-50' : 'hover:bg-gray-50'}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold leading-none shrink-0 ${mv > 0 ? 'text-green-500' : mv < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                        {mv > 0 ? '▲' : mv < 0 ? '▼' : '–'}
                      </span>
                      <div>
                        <span className="font-semibold text-gray-800">
                          {row.team_name}
                          {isMe && <span className="ml-1.5 text-xs font-normal text-green-600">(you)</span>}
                          {row.is_bot && <span className="ml-1.5 text-xs font-normal text-purple-500">🤖</span>}
                        </span>
                        {row.real_name && !row.is_bot && <p className="text-xs text-gray-400 leading-tight">{row.real_name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-center">
                      {row.recentScores.length === 0 ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        row.recentScores.map((s, idx) => {
                          const ratio = s.pts / s.maxPts
                          const cls = s.pts === 0
                            ? 'bg-gray-100 text-gray-400'
                            : ratio < 0.34
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : ratio < 0.67
                            ? 'bg-blue-50 text-blue-600 border border-blue-200'
                            : 'bg-green-50 text-green-700 border border-green-200'
                          return (
                            <span key={idx} className={`text-xs font-bold rounded-md px-1.5 py-0.5 tabular-nums ${cls}`}>
                              {fmtPts(s.pts)}
                            </span>
                          )
                        })
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`text-base font-black tabular-nums ${isMe ? 'text-green-700' : 'text-gray-800'}`}>
                      {fmtPts(row.recentPts)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right hidden sm:table-cell">
                    {mv === 0 ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <span className={`text-xs font-bold ${mv > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {mv > 0 ? '+' : ''}{mv}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HighlightCard({
  icon, label, name, stat, statColor = 'text-gray-700',
}: {
  icon: string
  label: string
  name: string
  stat: string
  statColor?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 flex flex-col gap-0.5">
      <span className="text-xl leading-none mb-1">{icon}</span>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 leading-tight">{label}</p>
      <p className="text-sm font-bold text-gray-800 truncate leading-snug">{name}</p>
      <p className={`text-xs font-semibold leading-tight ${statColor}`}>{stat}</p>
    </div>
  )
}

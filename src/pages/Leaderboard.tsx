import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Header } from '../components/Header'
import { STAGE_MULTIPLIERS, isEligibleForPrize, PRIZE_AMOUNTS } from '../lib/utils'
import type { LeaderboardRow } from '../types/database'

type Tab = 'standings' | 'form'

interface RecentScore {
  pts: number
  maxPts: number
}

interface FormEntry {
  user_id: string
  team_name: string
  real_name: string | null
  is_bot: boolean
  recentPts: number
  recentScores: RecentScore[]
  rankMovement: number
}

const FORM_WINDOW = 5

const PODIUM_ORDER = [1, 0, 2] // display: 2nd | 1st | 3rd

const PODIUM_STYLES = [
  { icon: '🥇', amountCls: 'text-yellow-700', borderCls: 'border-yellow-300', bgCls: 'bg-yellow-50', prominent: true },
  { icon: '🥈', amountCls: 'text-gray-500',   borderCls: 'border-gray-300',   bgCls: 'bg-gray-50',   prominent: false },
  { icon: '🥉', amountCls: 'text-orange-700', borderCls: 'border-orange-200', bgCls: 'bg-orange-50', prominent: false },
]

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
  const [pointsAtStake, setPointsAtStake] = useState(0)
  const [scheduledCount, setScheduledCount] = useState(0)

  useEffect(() => {
    async function load() {
      const [{ data: lbData }, { data: matchData }, { data: scheduledData }] = await Promise.all([
        supabase.from('leaderboard').select('*'),
        supabase
          .from('matches')
          .select('id, kickoff_utc, stage, predictions(user_id, points)')
          .eq('status', 'finished')
          .order('kickoff_utc', { ascending: false }),
        supabase.from('matches').select('stage').eq('status', 'scheduled'),
      ])

      const lb = (lbData ?? []) as LeaderboardRow[]
      const matches = (matchData ?? []) as Array<{
        id: number
        kickoff_utc: string
        stage: string
        predictions: { user_id: string; points: number }[]
      }>
      const scheduled = (scheduledData ?? []) as { stage: string }[]

      setRows(lb)
      setScheduledCount(scheduled.length)
      setPointsAtStake(
        scheduled.reduce((sum, m) => sum + 9 * (STAGE_MULTIPLIERS[m.stage] ?? 1), 0)
      )

      const recentMatches = matches.slice(0, FORM_WINDOW)

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

      const currentRankMap: Record<string, number> = {}
      lb.forEach((r, i) => { currentRankMap[r.user_id] = i + 1 })

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
          real_name: r.real_name,
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
          <StandingsTab
            rows={rows}
            myId={session!.user.id}
            pointsAtStake={pointsAtStake}
            scheduledCount={scheduledCount}
          />
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

function StandingsTab({
  rows, myId, pointsAtStake, scheduledCount,
}: {
  rows: LeaderboardRow[]
  myId: string
  pointsAtStake: number
  scheduledCount: number
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">🏆</p>
        <p>No scores yet — check back after the first match.</p>
      </div>
    )
  }

  const leaderPts = Math.max(1, ...rows.map(r => Number(r.total_points)))
  const eligible = rows.filter(isEligibleForPrize)
  const prizeWinners = eligible.slice(0, 3)

  // Map user_id → prize rank (1/2/3) for badge display in table
  const prizeRankMap: Record<string, number> = {}
  prizeWinners.forEach((r, i) => { prizeRankMap[r.user_id] = i + 1 })

  return (
    <div className="space-y-4">
      {prizeWinners.length > 0 && (
        <PrizePodium eligible={eligible} pointsAtStake={pointsAtStake} />
      )}

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
              const prizeRank = prizeRankMap[row.user_id]
              return (
                <tr key={row.user_id} className={isMe ? 'bg-green-50' : 'hover:bg-gray-50'}>
                  <td className="py-3 px-4 text-center font-bold text-gray-400">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="font-semibold text-gray-800">{row.team_name}</span>
                      {isMe && <span className="text-xs font-normal text-green-600">(you)</span>}
                      {row.is_bot && <span className="text-xs font-normal text-purple-500">🤖 AI</span>}
                      {prizeRank && (
                        <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
                          prizeRank === 1 ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                          prizeRank === 2 ? 'bg-gray-100 text-gray-600 border border-gray-200' :
                          'bg-orange-50 text-orange-700 border border-orange-200'
                        }`}>
                          ${PRIZE_AMOUNTS[prizeRank - 1].toLocaleString()}
                        </span>
                      )}
                    </div>
                    {row.real_name && !row.is_bot && <p className="text-xs text-gray-400 leading-tight mt-0.5">{row.real_name}</p>}
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

      {prizeWinners.length > 0 && (
        <PrizeRaceCard eligible={eligible} pointsAtStake={pointsAtStake} scheduledCount={scheduledCount} />
      )}
    </div>
  )
}

function PrizePodium({ eligible, pointsAtStake }: { eligible: LeaderboardRow[]; pointsAtStake: number }) {
  const winners = eligible.slice(0, 3)

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Prizes</p>
      <div className="flex gap-2 items-end">
        {PODIUM_ORDER.map(prizeIdx => {
          const winner = winners[prizeIdx]
          if (!winner) return null
          const style = PODIUM_STYLES[prizeIdx]

          // locked in if no one outside prize positions can overtake
          const nextChallenger = eligible[prizeIdx + 1]
          const gap = nextChallenger
            ? Number(winner.total_points) - Number(nextChallenger.total_points)
            : Infinity
          const locked = pointsAtStake === 0 || gap > pointsAtStake

          return (
            <div
              key={winner.user_id}
              className={`flex-1 rounded-2xl border-2 ${style.borderCls} ${style.bgCls} px-2 py-3 flex flex-col items-center text-center gap-0.5 ${style.prominent ? 'shadow-md mb-0' : 'mb-2'}`}
            >
              <span className={`leading-none mb-1 ${style.prominent ? 'text-3xl' : 'text-2xl'}`}>{style.icon}</span>
              <span className={`font-black ${style.prominent ? 'text-base' : 'text-sm'} ${style.amountCls}`}>
                ${PRIZE_AMOUNTS[prizeIdx].toLocaleString()}
              </span>
              <span className="text-xs font-bold text-gray-800 truncate w-full leading-snug mt-0.5">
                {winner.team_name}
              </span>
              {winner.real_name && !winner.is_bot && (
                <span className="text-[10px] text-gray-400 truncate w-full">{winner.real_name}</span>
              )}
              <span className="text-[11px] text-gray-400 tabular-nums mt-0.5">
                {Number(winner.total_points).toLocaleString(undefined, { maximumFractionDigits: 1 })} pts
              </span>
              {locked && (
                <span className="text-[10px] font-semibold text-green-600 mt-1">🔒 Locked</span>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-1 text-right">Excludes AI &amp; (No Prize) entries</p>
    </div>
  )
}

function PrizeRaceCard({
  eligible, pointsAtStake, scheduledCount,
}: {
  eligible: LeaderboardRow[]
  pointsAtStake: number
  scheduledCount: number
}) {
  const winners = eligible.slice(0, 3)
  if (winners.length === 0) return null

  const bubblePlayer = eligible[3]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Prize Race</p>
        {pointsAtStake > 0 ? (
          <p className="text-xs text-gray-400">
            {scheduledCount} match{scheduledCount !== 1 ? 'es' : ''} left · {fmtPts(pointsAtStake)} pts at stake
          </p>
        ) : (
          <p className="text-xs text-green-600 font-medium">🎉 Tournament concluded</p>
        )}
      </div>

      {winners.map((winner, i) => {
        const nextChallenger = eligible[i + 1]
        const gap = nextChallenger
          ? Number(winner.total_points) - Number(nextChallenger.total_points)
          : Infinity
        const locked = pointsAtStake === 0 || gap > pointsAtStake

        return (
          <div key={winner.user_id} className="flex items-center justify-between text-sm">
            <span className="text-gray-700">
              {PODIUM_STYLES[i].icon}{' '}
              <span className={`font-semibold ${PODIUM_STYLES[i].amountCls}`}>
                ${PRIZE_AMOUNTS[i].toLocaleString()}
              </span>
              {' '}— {winner.team_name}
            </span>
            {locked ? (
              <span className="text-xs font-semibold text-green-600">🔒 Locked in</span>
            ) : nextChallenger ? (
              <span className="text-xs text-gray-400">
                leads by {fmtPts(gap)} pts
              </span>
            ) : (
              <span className="text-xs text-gray-400">Uncontested</span>
            )}
          </div>
        )
      })}

      {bubblePlayer && winners[2] && (
        <div className="pt-2 border-t border-gray-50">
          <p className="text-xs text-gray-500">
            ⬆ <span className="font-medium">{bubblePlayer.team_name}</span> is{' '}
            <span className="font-semibold text-amber-600">
              {fmtPts(Number(winners[2].total_points) - Number(bubblePlayer.total_points))} pts
            </span>{' '}
            from the $60 prize
          </p>
        </div>
      )}
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

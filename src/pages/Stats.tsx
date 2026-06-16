import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Header } from '../components/Header'
import { flagEmoji, STAGE_MULTIPLIERS, isEligibleForPrize, PRIZE_AMOUNTS } from '../lib/utils'
import type { Match, Prediction, LeaderboardRow } from '../types/database'

type PredictionWithMatch = Prediction & { match: Match }

const STAGE_ORDER = ['group', 'r32', 'r16', 'qf', 'sf', '3rd', 'final'] as const
const STAGE_NAMES: Record<string, string> = {
  group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16',
  qf: 'Quarter-final', sf: 'Semi-final', '3rd': '3rd Place', final: 'Final',
}

function fmtPts(pts: number) {
  return pts.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

export function Stats() {
  const { session } = useAuth()
  const [predictions, setPredictions] = useState<PredictionWithMatch[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [pointsAtStake, setPointsAtStake] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: pData }, { data: lbData }, { data: scheduledData }] = await Promise.all([
        supabase
          .from('predictions')
          .select('*, match:matches(*)')
          .eq('user_id', session!.user.id),
        supabase
          .from('leaderboard')
          .select('*')
          .order('total_points', { ascending: false }),
        supabase.from('matches').select('stage').eq('status', 'scheduled'),
      ])

      const allPreds = (pData ?? []) as PredictionWithMatch[]
      setPredictions(allPreds.filter(p => p.match?.status === 'finished'))
      setLeaderboard((lbData ?? []) as LeaderboardRow[])
      setPointsAtStake(
        ((scheduledData ?? []) as { stage: string }[]).reduce(
          (sum, m) => sum + 9 * (STAGE_MULTIPLIERS[m.stage] ?? 1),
          0
        )
      )
      setLoading(false)
    }
    load()
  }, [session])

  if (loading) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
      </>
    )
  }

  const graded = predictions.length

  if (graded === 0) {
    return (
      <>
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-800 mb-1">My Stats</h1>
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📊</p>
            <p>No graded matches yet — check back after the first result.</p>
          </div>
        </main>
      </>
    )
  }

  // ── Compute stats ──────────────────────────────────────────────
  let exact = 0, partialCorrect = 0, wrongResult = 0
  let firstCorrect = 0
  let playerScored = 0, playerAssisted = 0
  const stageMap: Record<string, { pts: number; count: number }> = {}
  let bestPred: PredictionWithMatch | null = null
  let worstPred: PredictionWithMatch | null = null

  for (const p of predictions) {
    const m = p.match
    const predOutcome = p.pred_home_score > p.pred_away_score ? 'home'
      : p.pred_home_score < p.pred_away_score ? 'away' : 'draw'
    const actualOutcome = m.home_score! > m.away_score! ? 'home'
      : m.home_score! < m.away_score! ? 'away' : 'draw'

    let scorelinePts: number
    if (p.pred_home_score === m.home_score && p.pred_away_score === m.away_score) {
      scorelinePts = 5; exact++
    } else if (
      predOutcome === actualOutcome &&
      ((p.pred_home_score - p.pred_away_score) === (m.home_score! - m.away_score!) ||
        p.pred_home_score === m.home_score! ||
        p.pred_away_score === m.away_score!)
    ) {
      scorelinePts = 3; partialCorrect++
    } else if (predOutcome === actualOutcome) {
      scorelinePts = 2; partialCorrect++
    } else {
      scorelinePts = 0; wrongResult++
    }

    const firstPts = p.pred_first_team === m.first_scorer_team ? 1 : 0
    if (firstPts) firstCorrect++

    // Infer player points from base_points since match_events aren't fetched here
    const playerPts = Math.max(0, p.base_points - scorelinePts - firstPts)
    if (playerPts >= 2) playerScored++
    if (playerPts === 1 || playerPts === 3) playerAssisted++

    if (!stageMap[m.stage]) stageMap[m.stage] = { pts: 0, count: 0 }
    stageMap[m.stage].pts += Number(p.points)
    stageMap[m.stage].count++

    if (!bestPred || Number(p.points) > Number(bestPred.points)) bestPred = p
    if (!worstPred || Number(p.points) < Number(worstPred.points)) worstPred = p
  }

  const totalPts = predictions.reduce((sum, p) => sum + Number(p.points), 0)

  const myIdx = leaderboard.findIndex(r => r.user_id === session!.user.id)
  const myRow = myIdx >= 0 ? leaderboard[myIdx] : null
  const aboveRow = myIdx > 0 ? leaderboard[myIdx - 1] : null
  const belowRow = myIdx >= 0 && myIdx < leaderboard.length - 1 ? leaderboard[myIdx + 1] : null

  const eligibleRows = leaderboard.filter(isEligibleForPrize)
  const isMyRowEligible = myRow ? isEligibleForPrize(myRow) : false
  const myPrizeRank = isMyRowEligible ? eligibleRows.findIndex(r => r.user_id === session!.user.id) : -1
  const myPrize = myPrizeRank >= 0 && myPrizeRank < 3 ? PRIZE_AMOUNTS[myPrizeRank] : null
  const PRIZE_ICONS = ['🥇', '🥈', '🥉']

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-gray-800">My Stats</h1>
          <p className="text-sm text-gray-400">
            {graded} graded match{graded !== 1 ? 'es' : ''} · {fmtPts(totalPts)} pts total · {fmtPts(totalPts / graded)} avg
          </p>
        </div>

        {/* Scoreline accuracy */}
        <StatCard title="Scoreline accuracy">
          <AccuracyRow label="Exact score" count={exact} total={graded} barColor="bg-green-500" textColor="text-green-700" />
          <AccuracyRow label="Correct result" count={partialCorrect} total={graded} barColor="bg-blue-400" textColor="text-blue-600" />
          <AccuracyRow label="Wrong result" count={wrongResult} total={graded} barColor="bg-gray-200" textColor="text-gray-400" />
        </StatCard>

        {/* Prediction accuracy */}
        <StatCard title="Prediction accuracy">
          <AccuracyRow label="First team to score" count={firstCorrect} total={graded} barColor="bg-green-500" textColor="text-green-700" />
          <AccuracyRow label="Player scored" count={playerScored} total={graded} barColor="bg-green-500" textColor="text-green-700" />
          <AccuracyRow label="Player assisted" count={playerAssisted} total={graded} barColor="bg-green-500" textColor="text-green-700" />
        </StatCard>

        {/* Points by stage */}
        <StatCard title="Points by stage">
          {STAGE_ORDER.filter(s => stageMap[s]).map(s => (
            <div key={s} className="flex items-center justify-between text-sm py-0.5">
              <span className="text-gray-600">{STAGE_NAMES[s]}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  {stageMap[s].count} match{stageMap[s].count !== 1 ? 'es' : ''}
                </span>
                <span className="font-bold text-gray-800 tabular-nums w-16 text-right">
                  {fmtPts(stageMap[s].pts)} pts
                </span>
              </div>
            </div>
          ))}
        </StatCard>

        {/* Recent form */}
        <StatCard title="Recent form">
          <div className="flex gap-2 flex-wrap">
            {[...predictions]
              .sort((a, b) => new Date(b.match.kickoff_utc).getTime() - new Date(a.match.kickoff_utc).getTime())
              .slice(0, 5)
              .map(p => {
                const pts = Number(p.points)
                const ratio = pts / (9 * (STAGE_MULTIPLIERS[p.match.stage] ?? 1.0))
                const cls = pts === 0
                  ? 'bg-gray-100 text-gray-400'
                  : ratio < 0.34
                  ? 'bg-amber-50 text-amber-600 border border-amber-100'
                  : 'bg-green-50 text-green-700 border border-green-100'
                return (
                  <div key={p.id} className={`flex flex-col items-center rounded-xl px-3 py-2 min-w-[56px] ${cls}`}>
                    <span className="text-lg font-black tabular-nums leading-none">{fmtPts(pts)}</span>
                    <span className="text-[11px] mt-1 opacity-60 tracking-tight">
                      {flagEmoji(p.match.home_team)}{flagEmoji(p.match.away_team)}
                    </span>
                  </div>
                )
              })}
          </div>
        </StatCard>

        {/* Highlights */}
        {bestPred && (
          <StatCard title="Highlights">
            <HighlightRow
              label="Best match"
              match={bestPred.match}
              pts={Number(bestPred.points)}
              ptsColor="text-green-700"
            />
            {worstPred && worstPred.id !== bestPred.id && (
              <HighlightRow
                label="Worst match"
                match={worstPred.match}
                pts={Number(worstPred.points)}
                ptsColor="text-gray-400"
              />
            )}
          </StatCard>
        )}

        {/* Leaderboard position & gaps */}
        {myRow && (
          <StatCard title="Leaderboard position">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Your rank</span>
              <span className="text-2xl font-black text-green-700">
                {myIdx === 0 ? '🥇' : myIdx === 1 ? '🥈' : myIdx === 2 ? '🥉' : `#${myIdx + 1}`}
              </span>
            </div>
            {aboveRow ? (
              <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-50">
                <span className="text-gray-500">
                  Behind <span className="font-medium text-gray-700">{aboveRow.team_name}</span>
                </span>
                <span className="font-semibold text-red-500">
                  −{fmtPts(Number(aboveRow.total_points) - Number(myRow.total_points))} pts
                </span>
              </div>
            ) : (
              <p className="text-sm text-green-600 font-medium pt-2 border-t border-gray-50">
                You're in the lead!
              </p>
            )}
            {belowRow && (
              <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-50">
                <span className="text-gray-500">
                  Ahead of <span className="font-medium text-gray-700">{belowRow.team_name}</span>
                </span>
                <span className="font-semibold text-green-600">
                  +{fmtPts(Number(myRow.total_points) - Number(belowRow.total_points))} pts
                </span>
              </div>
            )}
          </StatCard>
        )}

        {/* Prize status — only shown for eligible players */}
        {isMyRowEligible && myRow && (
          <StatCard title="Prize status">
            {myPrize !== null ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Currently earning</span>
                  <span className="text-2xl font-black text-yellow-700">
                    {PRIZE_ICONS[myPrizeRank]} ${myPrize.toLocaleString()}
                  </span>
                </div>
                {eligibleRows[myPrizeRank + 1] && (
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-50">
                    <span className="text-gray-500">
                      Lead over <span className="font-medium text-gray-700">{eligibleRows[myPrizeRank + 1].team_name}</span>
                    </span>
                    <div className="text-right">
                      <span className="font-semibold text-green-600">
                        +{fmtPts(Number(myRow.total_points) - Number(eligibleRows[myPrizeRank + 1].total_points))} pts
                      </span>
                      {pointsAtStake > 0 && (
                        <p className="text-[10px] text-gray-400">{fmtPts(pointsAtStake)} pts at stake</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-1">Points needed to reach prize positions:</p>
                {PRIZE_AMOUNTS.map((amount, i) => {
                  const prizeHolder = eligibleRows[i]
                  if (!prizeHolder) return null
                  const gap = Number(prizeHolder.total_points) - Number(myRow.total_points)
                  if (gap <= 0) return null
                  const reachable = pointsAtStake === 0 ? false : gap <= pointsAtStake
                  return (
                    <div key={i} className="flex items-center justify-between text-sm pt-1.5 border-t border-gray-50">
                      <span className="text-gray-600">
                        {PRIZE_ICONS[i]} ${amount.toLocaleString()}
                      </span>
                      <div className="text-right">
                        <span className={`font-semibold ${reachable ? 'text-amber-600' : 'text-gray-400'}`}>
                          {fmtPts(gap)} pts behind
                        </span>
                        {!reachable && pointsAtStake > 0 && (
                          <p className="text-[10px] text-red-400">Out of reach</p>
                        )}
                      </div>
                    </div>
                  )
                })}
                {pointsAtStake > 0 && (
                  <p className="text-xs text-gray-400 pt-2 border-t border-gray-50">
                    {fmtPts(pointsAtStake)} pts available in remaining matches
                  </p>
                )}
              </>
            )}
          </StatCard>
        )}
      </main>
    </>
  )
}

function StatCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</p>
      {children}
    </div>
  )
}

function AccuracyRow({ label, count, total, barColor, textColor }: {
  label: string; count: number; total: number; barColor: string; textColor: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className={`font-semibold tabular-nums ${textColor}`}>{count}/{total} · {pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function HighlightRow({ label, match, pts, ptsColor }: {
  label: string; match: Match; pts: number; ptsColor: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-700 truncate">
          {flagEmoji(match.home_team)} {match.home_team} vs {flagEmoji(match.away_team)} {match.away_team}
        </p>
      </div>
      <span className={`text-2xl font-black tabular-nums shrink-0 ${ptsColor}`}>
        {fmtPts(pts)}<span className="text-xs font-normal text-gray-400 ml-0.5">pts</span>
      </span>
    </div>
  )
}

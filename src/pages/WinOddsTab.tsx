import { useMemo } from 'react'
import { STAGE_MULTIPLIERS, isEligibleForPrize, PRIZE_AMOUNTS } from '../lib/utils'
import type { LeaderboardRow } from '../types/database'

interface MatchWithPreds {
  id: number
  stage: string
  predictions: { user_id: string; points: number }[]
}

interface WinOddsTabProps {
  lbData: LeaderboardRow[]
  matchData: MatchWithPreds[]
  scheduledData: { stage: string }[]
}

interface OddsRow {
  user_id: string
  team_name: string
  real_name: string | null
  p1: number
  p2: number
  p3: number
  ev: number
}

const NUM_SIMULATIONS = 2000
const STDDEV_FRACTION = 0.25

function sampleNormal(mean: number, stddev: number): number {
  const u1 = Math.max(Math.random(), Number.EPSILON)
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + stddev * z
}

function computeEfficiencies(
  lbData: LeaderboardRow[],
  matchData: MatchWithPreds[],
): Map<string, number> {
  // Use ALL finished matches as the denominator so that missed predictions
  // count as 0 pts — this ensures current standings are properly reflected
  // and inactive players don't get inflated projections.
  const totalMaxPts = matchData.reduce(
    (sum, m) => sum + 9 * (STAGE_MULTIPLIERS[m.stage] ?? 1), 0
  )

  const efficiencies = new Map<string, number>()
  for (const row of lbData) {
    const eff = totalMaxPts > 0 ? Number(row.total_points) / totalMaxPts : 0.40
    efficiencies.set(row.user_id, eff)
  }

  return efficiencies
}

function runMonteCarlo(
  lbData: LeaderboardRow[],
  efficiencies: Map<string, number>,
  remainingMaxPts: number[],
): OddsRow[] {
  const wins1: Record<string, number> = {}
  const wins2: Record<string, number> = {}
  const wins3: Record<string, number> = {}
  for (const row of lbData) {
    wins1[row.user_id] = 0
    wins2[row.user_id] = 0
    wins3[row.user_id] = 0
  }

  const currentPts = lbData.map(row => ({
    user_id: row.user_id,
    pts: Number(row.total_points),
    eff: efficiencies.get(row.user_id) ?? 0.40,
    eligible: isEligibleForPrize(row),
  }))

  for (let sim = 0; sim < NUM_SIMULATIONS; sim++) {
    // Project each player's final total
    const projected = currentPts.map(p => {
      let total = p.pts
      for (const maxPts of remainingMaxPts) {
        const mean = p.eff * maxPts
        const stddev = STDDEV_FRACTION * maxPts
        const sample = Math.max(0, Math.min(maxPts, sampleNormal(mean, stddev)))
        total += sample
      }
      return { user_id: p.user_id, total, eligible: p.eligible }
    })

    // Sort all players descending by projected total
    projected.sort((a, b) => b.total - a.total || a.user_id.localeCompare(b.user_id))

    // Assign prize slots to top 3 eligible players
    let prizeSlot = 1
    for (const p of projected) {
      if (!p.eligible) continue
      if (prizeSlot === 1) wins1[p.user_id]++
      else if (prizeSlot === 2) wins2[p.user_id]++
      else if (prizeSlot === 3) wins3[p.user_id]++
      prizeSlot++
      if (prizeSlot > 3) break
    }
  }

  return lbData
    .filter(isEligibleForPrize)
    .map(row => ({
      user_id: row.user_id,
      team_name: row.team_name,
      real_name: row.real_name,
      p1: wins1[row.user_id] / NUM_SIMULATIONS,
      p2: wins2[row.user_id] / NUM_SIMULATIONS,
      p3: wins3[row.user_id] / NUM_SIMULATIONS,
      ev: (wins1[row.user_id] * PRIZE_AMOUNTS[0] + wins2[row.user_id] * PRIZE_AMOUNTS[1] + wins3[row.user_id] * PRIZE_AMOUNTS[2]) / NUM_SIMULATIONS,
    }))
    .sort((a, b) => b.ev - a.ev)
}

function ProbBar({ pct }: { pct: number }) {
  const colorCls = pct >= 40 ? 'bg-green-500' : pct >= 10 ? 'bg-amber-400' : 'bg-gray-300'
  return (
    <div className="mt-0.5 h-1 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full ${colorCls}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function ProbCell({ p }: { p: number }) {
  const pct = Math.round(p * 100)
  const textCls = pct >= 40 ? 'text-green-700 font-bold' : pct >= 10 ? 'text-amber-600 font-semibold' : 'text-gray-300'
  return (
    <td className="py-3 px-2 text-right align-top w-20">
      <span className={`text-sm tabular-nums ${textCls}`}>{pct}%</span>
      <ProbBar pct={pct} />
    </td>
  )
}

export function WinOddsTab({ lbData, matchData, scheduledData }: WinOddsTabProps) {
  const oddsRows = useMemo<OddsRow[] | null>(() => {
    if (scheduledData.length === 0) return null
    const efficiencies = computeEfficiencies(lbData, matchData)
    const remainingMaxPts = scheduledData.map(m => 9 * (STAGE_MULTIPLIERS[m.stage] ?? 1))
    return runMonteCarlo(lbData, efficiencies, remainingMaxPts)
  }, [lbData, matchData, scheduledData])

  if (oddsRows === null) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 text-center space-y-2">
        <p className="text-4xl">🏆</p>
        <p className="text-sm font-semibold text-gray-700">Tournament Complete</p>
        <p className="text-xs text-gray-400">Final standings are locked — check the Standings tab for results.</p>
      </div>
    )
  }

  const matchesRemaining = scheduledData.length
  const totalRemainingPts = scheduledData.reduce(
    (s, m) => s + 9 * (STAGE_MULTIPLIERS[m.stage] ?? 1), 0
  )

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-700 space-y-0.5">
        <p className="font-semibold">Winning odds — based on {NUM_SIMULATIONS.toLocaleString()} simulations</p>
        <p className="text-blue-500">
          Using each player's historical scoring efficiency.{' '}
          {matchesRemaining} match{matchesRemaining !== 1 ? 'es' : ''} remaining,
          up to {totalRemainingPts.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts at stake.
        </p>
      </div>

      {oddsRows.length === 0 ? (
        <p className="text-center py-8 text-gray-400 text-sm">No eligible players.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-center py-3 px-3 font-medium w-8">#</th>
                <th className="text-left py-3 px-3 font-medium">Player</th>
                <th className="text-right py-3 px-2 font-medium w-20">
                  <span className="text-yellow-600">🥇</span> $350
                </th>
                <th className="text-right py-3 px-2 font-medium w-20">
                  <span className="text-gray-400">🥈</span> $150
                </th>
                <th className="text-right py-3 px-2 font-medium w-20">
                  <span className="text-orange-500">🥉</span> $60
                </th>
                <th className="text-right py-3 px-3 font-medium w-20 hidden sm:table-cell">EV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {oddsRows.map((row, i) => (
                <tr key={row.user_id} className="hover:bg-gray-50">
                  <td className="py-3 px-3 text-center text-gray-400 font-bold text-xs">{i + 1}</td>
                  <td className="py-3 px-3">
                    <span className="font-semibold text-gray-800">{row.team_name}</span>
                    {row.real_name && (
                      <p className="text-xs text-gray-400 leading-tight mt-0.5">{row.real_name}</p>
                    )}
                  </td>
                  <ProbCell p={row.p1} />
                  <ProbCell p={row.p2} />
                  <ProbCell p={row.p3} />
                  <td className="py-3 px-3 text-right hidden sm:table-cell">
                    <span className="text-sm font-bold text-gray-700">
                      ${row.ev.toFixed(0)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-right">
        Simulation uses historical scoring efficiency per player · Excludes AI &amp; (No Prize) entries
      </p>
    </div>
  )
}

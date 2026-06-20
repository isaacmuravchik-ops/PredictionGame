import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { LeaderboardRow } from '../types/database'
import type { PlacementSeries, MatchTick, ChartDataPoint } from '../types/placement'

interface MatchWithPreds {
  id: number
  kickoff_utc: string
  stage: string
  home_team: string
  away_team: string
  predictions: { user_id: string; points: number }[]
}

interface Props {
  matchData: MatchWithPreds[]
  leaderboardRows: LeaderboardRow[]
  myId: string
}

const TEAM_COLORS = [
  '#16a34a', '#2563eb', '#dc2626', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0284c7',
  '#9333ea', '#059669', '#b45309', '#be185d', '#1d4ed8', '#374151',
]

const STAGE_LABELS: Record<string, string> = {
  group: 'Group', r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', '3rd': '3rd', final: 'Final',
}

function assignColors(
  rows: LeaderboardRow[],
  myId: string,
): PlacementSeries[] {
  const stable = [...rows].sort((a, b) => a.user_id.localeCompare(b.user_id))
  const colorMap: Record<string, string> = {}
  let idx = 1
  stable.forEach(r => {
    colorMap[r.user_id] = r.user_id === myId
      ? TEAM_COLORS[0]
      : TEAM_COLORS[idx++ % TEAM_COLORS.length]
  })
  return rows.map(r => ({
    userId: r.user_id,
    teamName: r.team_name,
    isBot: r.is_bot,
    color: colorMap[r.user_id],
  }))
}

function computePlacementHistory(
  matchData: MatchWithPreds[],
  rows: LeaderboardRow[],
  myId: string,
): { series: PlacementSeries[]; ticks: MatchTick[]; chartData: ChartDataPoint[] } {
  const cumPts: Record<string, number> = {}
  rows.forEach(r => { cumPts[r.user_id] = 0 })

  const chronological = [...matchData].sort(
    (a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime()
  )

  const ticks: MatchTick[] = []
  const chartData: ChartDataPoint[] = []

  chronological.forEach((match, idx) => {
    match.predictions.forEach(pred => {
      cumPts[pred.user_id] = (cumPts[pred.user_id] ?? 0) + Number(pred.points)
    })

    const sorted = rows
      .map(r => ({ userId: r.user_id, pts: cumPts[r.user_id] ?? 0 }))
      .sort((a, b) => b.pts - a.pts || a.userId.localeCompare(b.userId))

    const point: ChartDataPoint = { matchNumber: idx + 1 }
    sorted.forEach((u, rank) => {
      const row = rows.find(r => r.user_id === u.userId)!
      point[row.team_name] = rank + 1
    })

    ticks.push({
      matchNumber: idx + 1,
      kickoffUtc: match.kickoff_utc,
      stage: match.stage,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
    })
    chartData.push(point)
  })

  return { series: assignColors(rows, myId), ticks, chartData }
}

function CustomTooltip({
  active, payload, label, series, ticks,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number }[]
  label?: number
  series: PlacementSeries[]
  ticks: MatchTick[]
}) {
  if (!active || !payload?.length || label == null) return null
  const tick = ticks[label - 1]
  const rankMap: Record<string, number> = {}
  payload.forEach(p => { rankMap[p.dataKey] = p.value })

  const sorted = series
    .map(s => ({ ...s, rank: rankMap[s.teamName] }))
    .filter(s => s.rank != null)
    .sort((a, b) => a.rank - b.rank)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs max-w-[200px]">
      <p className="font-semibold text-gray-700 mb-0.5">Match {label}</p>
      {tick && (
        <>
          <p className="text-gray-400 text-[10px] mb-1">
            {tick.homeTeam} vs {tick.awayTeam}
          </p>
          <p className="text-gray-400 text-[10px] mb-2">{STAGE_LABELS[tick.stage] ?? tick.stage}</p>
        </>
      )}
      <div className="space-y-0.5">
        {sorted.map(s => (
          <div key={s.userId} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-gray-600 truncate">{s.teamName}</span>
              {s.isBot && <span className="text-[9px] text-purple-400">AI</span>}
            </div>
            <span className="font-bold text-gray-800 flex-shrink-0">#{s.rank}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function InteractiveLegend({
  series, hidden, onToggle, myId,
}: {
  series: PlacementSeries[]
  hidden: Set<string>
  onToggle: (id: string) => void
  myId: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {series.map(s => {
        const isHidden = hidden.has(s.userId)
        const isMe = s.userId === myId
        return (
          <button
            key={s.userId}
            onClick={() => onToggle(s.userId)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs transition-opacity ${
              isHidden ? 'opacity-30' : 'opacity-100'
            } ${isMe ? 'font-bold' : 'font-normal'}`}
            style={{
              borderColor: s.color,
              color: isHidden ? '#9ca3af' : s.color,
              backgroundColor: isHidden ? 'transparent' : `${s.color}14`,
            }}
          >
            {s.isBot && <span className="text-[10px]">🤖</span>}
            <span
              className="max-w-[100px] truncate"
              style={s.isBot ? { textDecoration: 'underline dashed' } : undefined}
            >
              {s.teamName}
            </span>
            {isMe && <span className="text-[9px] opacity-60">(you)</span>}
          </button>
        )
      })}
    </div>
  )
}

export function PlacementHistoryTab({ matchData, leaderboardRows, myId }: Props) {
  const { series, ticks, chartData } = useMemo(
    () => computePlacementHistory(matchData, leaderboardRows, myId),
    [matchData, leaderboardRows, myId]
  )
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const numTeams = leaderboardRows.length

  if (chartData.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📈</p>
        <p>No matches graded yet — check back after the first result.</p>
      </div>
    )
  }

  const toggle = (id: string) =>
    setHidden(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        Placement after each match
      </p>
      <p className="text-xs text-gray-400">
        Rank 1 = leading. Tap the chart to see positions at any match.
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="matchNumber"
            tick={{ fontSize: 11 }}
            tickFormatter={v => `M${v}`}
          />
          <YAxis
            reversed
            domain={[1, numTeams]}
            tickCount={numTeams}
            tick={{ fontSize: 11 }}
            width={28}
            allowDecimals={false}
          />
          <Tooltip
            content={
              <CustomTooltip series={series} ticks={ticks} />
            }
          />
          {series.map(s => (
            <Line
              key={s.userId}
              type="monotone"
              dataKey={s.teamName}
              stroke={s.color}
              strokeWidth={s.userId === myId ? 2.5 : 1.5}
              strokeOpacity={hidden.has(s.userId) ? 0 : s.isBot ? 0.6 : 1}
              strokeDasharray={s.isBot ? '5 3' : undefined}
              dot={false}
              activeDot={hidden.has(s.userId) ? false : { r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <InteractiveLegend
        series={series}
        hidden={hidden}
        onToggle={toggle}
        myId={myId}
      />
    </div>
  )
}

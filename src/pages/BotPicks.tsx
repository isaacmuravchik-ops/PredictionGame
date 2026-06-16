import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Header } from '../components/Header'
import { stageLabel, formatKickoffTime, formatDateHeading, flagEmoji } from '../lib/utils'

interface BotPick {
  id: number
  match_id: number
  pred_home_score: number
  pred_away_score: number
  pred_first_team: 'home' | 'away' | 'none'
  pred_player_name: string
  rationale: string | null
  points: number
  matches: {
    home_team: string
    away_team: string
    stage: string
    group_label: string | null
    kickoff_utc: string
    status: string
    home_score: number | null
    away_score: number | null
  }
}

type FilterTab = 'all' | 'upcoming' | 'finished'

export function BotPicks() {
  const [picks, setPicks] = useState<BotPick[]>([])
  const [botName, setBotName] = useState('Claude AI')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<FilterTab>('all')

  useEffect(() => {
    async function load() {
      const { data: botData } = await supabase
        .from('profiles')
        .select('id, team_name')
        .eq('is_bot', true)
        .maybeSingle()

      if (!botData) {
        setLoading(false)
        return
      }
      setBotName(botData.team_name)

      const { data } = await supabase
        .from('predictions')
        .select('id, match_id, pred_home_score, pred_away_score, pred_first_team, pred_player_name, rationale, points, matches(home_team, away_team, stage, group_label, kickoff_utc, status, home_score, away_score)')
        .eq('user_id', botData.id)
        .order('match_id', { ascending: false })

      setPicks((data ?? []) as unknown as BotPick[])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = picks.filter(p => {
    if (tab === 'upcoming') return p.matches.status !== 'finished'
    if (tab === 'finished') return p.matches.status === 'finished'
    return true
  })

  const totalPts = picks
    .filter(p => p.matches.status === 'finished')
    .reduce((sum, p) => sum + Number(p.points), 0)
  const finishedCount = picks.filter(p => p.matches.status === 'finished').length

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🤖</span>
          <div>
            <h1 className="text-lg font-bold text-gray-800">{botName}</h1>
            <p className="text-xs text-gray-400">AI-powered predictions by Claude</p>
          </div>
        </div>

        {!loading && picks.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 text-center">
              <p className="text-2xl font-black text-gray-800">{picks.length}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Predictions</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 text-center">
              <p className="text-2xl font-black text-green-700">
                {totalPts.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Points</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 text-center">
              <p className="text-2xl font-black text-gray-800">
                {finishedCount > 0
                  ? (totalPts / finishedCount).toLocaleString(undefined, { maximumFractionDigits: 1 })
                  : '—'}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Avg / match</p>
            </div>
          </div>
        )}

        <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
          {(['all', 'upcoming', 'finished'] as FilterTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'all' ? 'All' : t === 'upcoming' ? 'Upcoming' : 'Finished'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : picks.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🤖</p>
            <p>No bot predictions yet — check back soon.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No {tab} predictions.
          </div>
        ) : (
          <PickList picks={filtered} />
        )}
      </main>
    </>
  )
}

function PickList({ picks }: { picks: BotPick[] }) {
  const grouped: [string, BotPick[]][] = []
  const seen = new Set<string>()
  for (const p of [...picks].sort((a, b) =>
    new Date(b.matches.kickoff_utc).getTime() - new Date(a.matches.kickoff_utc).getTime()
  )) {
    const heading = formatDateHeading(p.matches.kickoff_utc)
    if (!seen.has(heading)) {
      seen.add(heading)
      grouped.push([heading, []])
    }
    grouped[grouped.length - 1][1].push(p)
  }

  return (
    <div className="space-y-5">
      {grouped.map(([heading, groupPicks]) => (
        <div key={heading}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{heading}</p>
          <div className="space-y-2">
            {groupPicks.map(p => <PickCard key={p.id} pick={p} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function PickCard({ pick: p }: { pick: BotPick }) {
  const isFinished = p.matches.status === 'finished'
  const firstLabel = p.pred_first_team === 'home'
    ? p.matches.home_team.split(' ').slice(-1)[0]
    : p.pred_first_team === 'away'
    ? p.matches.away_team.split(' ').slice(-1)[0]
    : 'No goals'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-1">
            {stageLabel(p.matches.stage, p.matches.group_label)} · {formatKickoffTime(p.matches.kickoff_utc)}
          </p>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-gray-800 text-sm">
              {flagEmoji(p.matches.home_team)} {p.matches.home_team}
            </span>
            {isFinished ? (
              <span className="text-base font-black text-gray-700 mx-1">
                {p.matches.home_score}–{p.matches.away_score}
              </span>
            ) : (
              <span className="text-gray-400 text-xs mx-1">vs</span>
            )}
            <span className="font-semibold text-gray-800 text-sm">
              {p.matches.away_team} {flagEmoji(p.matches.away_team)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-gray-100 text-gray-600 rounded-md px-2 py-0.5 font-medium">
              Pred: {p.pred_home_score}–{p.pred_away_score}
            </span>
            <span className="bg-gray-100 text-gray-600 rounded-md px-2 py-0.5">
              {firstLabel} first
            </span>
            <span className="bg-gray-100 text-gray-600 rounded-md px-2 py-0.5">
              {p.pred_player_name}
            </span>
          </div>

          {p.rationale && (
            <p className="text-xs text-gray-400 italic mt-2">"{p.rationale}"</p>
          )}
        </div>

        <div className="shrink-0 text-right pt-1">
          {isFinished ? (
            <span className={`text-xl font-black tabular-nums ${Number(p.points) > 0 ? 'text-green-700' : 'text-gray-300'}`}>
              {Number(p.points).toLocaleString(undefined, { maximumFractionDigits: 1 })} pts
            </span>
          ) : (
            <span className="text-xs text-gray-300 bg-gray-50 rounded-lg px-2 py-1">Upcoming</span>
          )}
        </div>
      </div>
    </div>
  )
}

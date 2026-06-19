import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { AdminLayout } from './AdminLayout'
import { formatKickoffTime, stageLabel } from '../../lib/utils'

interface BotStatus {
  id: string
  team_name: string
  points_offset: number
  total_points: number
  played_matches: number
  rank: number
}

interface BotPrediction {
  id: number
  match_id: number
  pred_home_score: number
  pred_away_score: number
  pred_first_team: string
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
  }
}

interface UpcomingMatch {
  id: number
  home_team: string
  away_team: string
  stage: string
  group_label: string | null
  kickoff_utc: string
  predicted: boolean
}

async function callBotApi(endpoint: string, jwt: string, body?: object) {
  const res = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body ?? {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}

async function fetchBotStatus(jwt: string) {
  const res = await fetch('/api/bot-status', {
    headers: { Authorization: `Bearer ${jwt}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as { matches: UpcomingMatch[] }
}

export function AdminBot() {
  const { session } = useAuth()
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null)
  const [predictions, setPredictions] = useState<BotPrediction[]>([])
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [teamName, setTeamName] = useState('Claude AI')
  const [debugResults, setDebugResults] = useState<any[] | null>(null)

  async function load() {
    setLoading(true)
    const jwt = session!.access_token

    const [{ data: lbData }, { data: botData }] = await Promise.all([
      supabase.from('leaderboard').select('*').order('total_points', { ascending: false }),
      supabase.from('profiles').select('id, team_name, points_offset').eq('is_bot', true).maybeSingle(),
    ])

    if (!botData) {
      setLoading(false)
      return
    }

    const lb = (lbData ?? []) as Array<{ user_id: string; total_points: number; played_matches: number }>
    const rank = lb.findIndex(r => r.user_id === botData.id) + 1
    const lbRow = lb.find(r => r.user_id === botData.id)

    setBotStatus({
      id: botData.id,
      team_name: botData.team_name,
      points_offset: botData.points_offset,
      total_points: Number(lbRow?.total_points ?? 0),
      played_matches: Number(lbRow?.played_matches ?? 0),
      rank: rank > 0 ? rank : lb.length + 1,
    })

    // Finished predictions visible via normal RLS (post-kickoff)
    const { data: preds } = await supabase
      .from('predictions')
      .select('id, match_id, pred_home_score, pred_away_score, pred_first_team, pred_player_name, rationale, points, matches(home_team, away_team, stage, group_label, kickoff_utc, status)')
      .eq('user_id', botData.id)
      .order('match_id', { ascending: false })
    setPredictions((preds ?? []) as unknown as BotPrediction[])

    // Upcoming prediction coverage via service role (no prediction content)
    try {
      const { matches } = await fetchBotStatus(jwt)
      setUpcomingMatches(matches)
    } catch {
      setUpcomingMatches([])
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    setBusy(true)
    setActionError(null)
    setActionStatus(null)
    try {
      const jwt = session!.access_token
      const data = await callBotApi('bot-create', jwt, { teamName })
      setActionStatus(`Bot created: "${data.teamName}" (ID: ${data.botId})`)
      await load()
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSetOffset() {
    setBusy(true)
    setActionError(null)
    setActionStatus(null)
    try {
      const data = await callBotApi('bot-set-offset', session!.access_token)
      setActionStatus(`Starting points set to ${data.offset} pts (median of ${data.humanCount} players).`)
      await load()
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handlePredict(allUpcoming = false) {
    setBusy(true)
    setActionError(null)
    setActionStatus(null)
    setDebugResults(null)
    try {
      const data = await callBotApi('bot-predict', session!.access_token, { allUpcoming })
      setActionStatus(
        data.predicted === 0
          ? (data.message ?? 'No new predictions generated.')
          : `Generated ${data.predicted} of ${data.total} predictions.`
      )
      if (data.results?.length > 0) setDebugResults(data.results)
      await load()
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-lg font-bold text-gray-800 mb-1">Bot Player</h1>
      <p className="text-sm text-gray-500 mb-5">
        Manage the AI bot that participates as a player, powered by Claude.
      </p>

      {actionStatus && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          {actionStatus}
        </div>
      )}
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {debugResults && debugResults.length > 0 && (
        <DebugLog results={debugResults} onClose={() => setDebugResults(null)} />
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : !botStatus ? (
        <BotCreator
          teamName={teamName}
          onTeamNameChange={setTeamName}
          onCreate={handleCreate}
          busy={busy}
        />
      ) : (
        <>
          <BotStatusCard status={botStatus} />

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ActionCard
              title="Set Starting Points"
              description="Calculate median points across all human players and assign that as the bot's starting offset, accounting for missed matches."
              buttonLabel="Set to Current Median"
              onAction={handleSetOffset}
              busy={busy}
            />
            <ActionCard
              title="Generate Next 24 Hours"
              description="Ask Claude to predict matches kicking off in the next 24 hours. Run this each day for up-to-date predictions."
              buttonLabel="Next 24 Hours"
              onAction={() => handlePredict(false)}
              busy={busy}
            />
            <ActionCard
              title="Generate All Upcoming"
              description="Predict every future match at once. Use sparingly — predictions made weeks out won't reflect current form or squad news."
              buttonLabel="Generate All"
              onAction={() => handlePredict(true)}
              busy={busy}
            />
          </div>

          <BotPredictionTable predictions={predictions} upcomingMatches={upcomingMatches} />
        </>
      )}
    </AdminLayout>
  )
}

function BotCreator({
  teamName, onTeamNameChange, onCreate, busy,
}: {
  teamName: string
  onTeamNameChange: (v: string) => void
  onCreate: () => void
  busy: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-6 max-w-sm">
      <p className="text-4xl mb-3">🤖</p>
      <h2 className="font-bold text-gray-800 mb-1">No bot yet</h2>
      <p className="text-sm text-gray-500 mb-4">
        Create a bot player to participate in the league alongside humans.
      </p>
      <input
        value={teamName}
        onChange={e => onTeamNameChange(e.target.value)}
        placeholder="Bot team name"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      <button
        onClick={onCreate}
        disabled={busy || !teamName.trim()}
        className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors"
      >
        {busy ? 'Creating…' : 'Create Bot'}
      </button>
      <p className="text-xs text-gray-400 mt-3">
        Requires <code className="bg-gray-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> and{' '}
        <code className="bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code> in Vercel environment variables.
      </p>
    </div>
  )
}

function BotStatusCard({ status }: { status: BotStatus }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">🤖</span>
        <div>
          <p className="font-bold text-gray-800">{status.team_name}</p>
          <p className="text-xs text-gray-400">AI Bot · ID: {status.id.slice(0, 8)}…</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 text-center">
        <StatChip label="Rank" value={`#${status.rank}`} />
        <StatChip label="Total pts" value={String(Number(status.total_points).toFixed(1))} />
        <StatChip label="Starting pts" value={String(status.points_offset)} />
        <StatChip label="Matches played" value={String(status.played_matches)} />
      </div>
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl py-2 px-1">
      <p className="text-lg font-black text-gray-800">{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-tight">{label}</p>
    </div>
  )
}

function ActionCard({
  title, description, buttonLabel, onAction, busy,
}: {
  title: string
  description: string
  buttonLabel: string
  onAction: () => void
  busy: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-3">
      <div>
        <p className="font-semibold text-gray-800 text-sm">{title}</p>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>
      <button
        onClick={onAction}
        disabled={busy}
        className="mt-auto bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
      >
        {busy ? 'Working…' : buttonLabel}
      </button>
    </div>
  )
}

function DebugLog({ results, onClose }: { results: any[]; onClose: () => void }) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  function toggle(i: number) {
    setOpen(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  return (
    <div className="mt-4 mb-2 bg-gray-900 rounded-2xl overflow-hidden text-xs font-mono">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700">
        <span className="text-gray-300 font-semibold tracking-wide">Claude I/O Debug — {results.length} match{results.length !== 1 ? 'es' : ''}</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm px-2">✕</button>
      </div>
      <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
        {results.map((r, i) => (
          <div key={r.matchId ?? i}>
            <button
              onClick={() => toggle(i)}
              className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-gray-800 transition-colors"
            >
              <span className={r.success ? 'text-green-400' : 'text-red-400'}>
                {r.success ? '✓' : '✗'} Match {r.matchId}
                {r.prediction && ` — ${r.prediction.homeScore}–${r.prediction.awayScore} · ${r.prediction.playerName}`}
                {r.error && ` — ${r.error}`}
              </span>
              <span className="text-gray-600 shrink-0">{open.has(i) ? '▲' : '▼'}</span>
            </button>

            {open.has(i) && (
              <div className="px-4 pb-4 space-y-3 bg-gray-950">
                {r.prompt && (
                  <div>
                    <p className="text-gray-500 uppercase tracking-widest text-[10px] mt-3 mb-1">Prompt sent to Claude</p>
                    <pre className="whitespace-pre-wrap text-green-300 text-[11px] leading-relaxed bg-gray-900 rounded-lg p-3 overflow-x-auto">{r.prompt}</pre>
                  </div>
                )}
                {r.rawResponse && (
                  <div>
                    <p className="text-gray-500 uppercase tracking-widest text-[10px] mb-1">Claude's raw response</p>
                    <pre className="whitespace-pre-wrap text-yellow-200 text-[11px] leading-relaxed bg-gray-900 rounded-lg p-3 overflow-x-auto">{r.rawResponse}</pre>
                  </div>
                )}
                {r.prediction && (
                  <div>
                    <p className="text-gray-500 uppercase tracking-widest text-[10px] mb-1">Parsed &amp; stored</p>
                    <pre className="whitespace-pre-wrap text-blue-300 text-[11px] leading-relaxed bg-gray-900 rounded-lg p-3 overflow-x-auto">{JSON.stringify(r.prediction, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BotPredictionTable({
  predictions,
  upcomingMatches,
}: {
  predictions: BotPrediction[]
  upcomingMatches: UpcomingMatch[]
}) {
  const [filter, setFilter] = useState<'upcoming' | 'finished'>('upcoming')

  const finished = predictions.filter(p => p.matches.status === 'finished')
  const predictedCount = upcomingMatches.filter(m => m.predicted).length

  return (
    <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Bot Predictions
        </p>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setFilter('upcoming')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === 'upcoming' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Upcoming ({predictedCount}/{upcomingMatches.length})
          </button>
          <button
            onClick={() => setFilter('finished')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === 'finished' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Finished ({finished.length})
          </button>
        </div>
      </div>

      {filter === 'upcoming' ? (
        upcomingMatches.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No upcoming scheduled matches.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {upcomingMatches.map(m => (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {m.home_team} vs {m.away_team}
                  </p>
                  <p className="text-xs text-gray-400">
                    {stageLabel(m.stage, m.group_label)} · {formatKickoffTime(m.kickoff_utc)}
                  </p>
                </div>
                <div className="shrink-0">
                  {m.predicted ? (
                    <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-md px-2 py-0.5 font-medium">
                      ✓ Predicted
                    </span>
                  ) : (
                    <span className="text-xs bg-gray-50 text-gray-400 border border-gray-200 rounded-md px-2 py-0.5">
                      Not yet
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        finished.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No finished matches yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {finished.map(p => (
              <div key={p.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {p.matches.home_team} vs {p.matches.away_team}
                    </p>
                    <p className="text-xs text-gray-400">
                      {stageLabel(p.matches.stage, p.matches.group_label)} ·{' '}
                      {formatKickoffTime(p.matches.kickoff_utc)}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-medium">{p.pred_home_score}–{p.pred_away_score}</span>
                      {' · '}
                      {p.pred_first_team === 'home' ? p.matches.home_team.split(' ').slice(-1)[0]
                        : p.pred_first_team === 'away' ? p.matches.away_team.split(' ').slice(-1)[0]
                        : 'No goals'} first
                      {' · '}
                      {p.pred_player_name}
                    </p>
                    {p.rationale && (
                      <p className="text-xs text-gray-400 italic mt-1">"{p.rationale}"</p>
                    )}
                  </div>
                  <span className="text-base font-black text-green-700 shrink-0">{p.points} pts</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

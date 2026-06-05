import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Header } from '../components/Header'
import type { Match, Prediction, MatchEvent } from '../types/database'
import { getMatchState, formatKickoffTime, stageLabel, firstTeamLabel } from '../lib/utils'

type PredictionWithTeam = Prediction & { profiles: { team_name: string } }

export function MatchDetail() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [match, setMatch] = useState<Match | null>(null)
  const [myPrediction, setMyPrediction] = useState<Prediction | null>(null)
  const [allPredictions, setAllPredictions] = useState<PredictionWithTeam[]>([])
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([])
  const [players, setPlayers] = useState<{ team: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Form state
  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [firstTeam, setFirstTeam] = useState<'home' | 'away' | 'none'>('home')
  const [playerName, setPlayerName] = useState('')

  useEffect(() => {
    async function load() {
      const matchId = Number(id)
      const [{ data: mData }, { data: pData }, { data: allData }, { data: evData }] = await Promise.all([
        supabase.from('matches').select('*').eq('id', matchId).single(),
        supabase.from('predictions').select('*').eq('match_id', matchId).eq('user_id', session!.user.id).maybeSingle(),
        supabase.from('predictions').select('*, profiles(team_name)').eq('match_id', matchId),
        supabase.from('match_events').select('*').eq('match_id', matchId),
      ])

      const m = mData as Match | null
      const p = pData as Prediction | null

      setMatch(m)
      setMyPrediction(p)
      setAllPredictions((allData ?? []) as PredictionWithTeam[])
      setMatchEvents((evData ?? []) as MatchEvent[])

      // Fetch squad players for both teams once we know the match teams.
      if (m) {
        const { data: plData } = await supabase
          .from('players')
          .select('team, name')
          .in('team', [m.home_team, m.away_team])
          .order('name')
        setPlayers((plData ?? []) as { team: string; name: string }[])
      }

      if (p) {
        setHomeScore(p.pred_home_score)
        setAwayScore(p.pred_away_score)
        setFirstTeam(p.pred_first_team)
        setPlayerName(p.pred_player_name)
      }
      setLoading(false)
    }
    load()
  }, [id, session])

  async function handleSave() {
    if (!match || !playerName.trim()) return
    setSaving(true)
    setSaveError(null)

    const { data, error } = await supabase
      .from('predictions')
      .upsert({
        user_id: session!.user.id,
        match_id: match.id,
        pred_home_score: homeScore,
        pred_away_score: awayScore,
        pred_first_team: firstTeam,
        pred_player_name: playerName.trim(),
      }, { onConflict: 'user_id,match_id' })
      .select()
      .single()

    setSaving(false)
    if (error) {
      setSaveError(
        error.code === '42501'
          ? 'This match is locked — predictions closed at kickoff.'
          : error.message
      )
    } else {
      setMyPrediction(data as Prediction)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
      </>
    )
  }

  if (!match) {
    return (
      <>
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-8 text-center text-gray-400">
          Match not found.{' '}
          <button onClick={() => navigate('/')} className="text-green-700 underline">Go back</button>
        </div>
      </>
    )
  }

  const state = getMatchState(match.kickoff_utc, match.status)

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4">
        <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
          ← Back
        </button>

        {/* Match header */}
        <div className="bg-green-800 text-white rounded-2xl px-5 py-4 mb-4">
          <p className="text-xs uppercase tracking-widest text-green-300 mb-2">
            {stageLabel(match.stage, match.group_label)}
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-lg leading-tight flex-1">{match.home_team}</span>
            {state === 'finished' && match.home_score != null ? (
              <span className="text-3xl font-black text-white shrink-0 tabular-nums">
                {match.home_score} – {match.away_score}
              </span>
            ) : (
              <span className="text-green-400 text-sm font-medium shrink-0">vs</span>
            )}
            <span className="font-bold text-lg leading-tight text-right flex-1">{match.away_team}</span>
          </div>
          <p className="text-green-300 text-xs mt-2">
            {formatKickoffTime(match.kickoff_utc)} local ·{' '}
            {state === 'open' ? 'Open for predictions' : state === 'locked' ? 'In progress' : 'Full time'}
          </p>
        </div>

        {state === 'open' ? (
          <PredictionForm
            match={match}
            players={players}
            homeScore={homeScore} setHomeScore={setHomeScore}
            awayScore={awayScore} setAwayScore={setAwayScore}
            firstTeam={firstTeam} setFirstTeam={setFirstTeam}
            playerName={playerName} setPlayerName={setPlayerName}
            saving={saving} saved={saved} saveError={saveError}
            onSubmit={handleSave}
          />
        ) : (
          <LockedView
            match={match}
            myPrediction={myPrediction}
            allPredictions={allPredictions}
            matchEvents={matchEvents}
            userId={session!.user.id}
          />
        )}
      </main>
    </>
  )
}

// ─── Prediction form (open matches) ───────────────────────────────────────────

interface FormProps {
  match: Match
  players: { team: string; name: string }[]
  homeScore: number; setHomeScore: (v: number) => void
  awayScore: number; setAwayScore: (v: number) => void
  firstTeam: 'home' | 'away' | 'none'; setFirstTeam: (v: 'home' | 'away' | 'none') => void
  playerName: string; setPlayerName: (v: string) => void
  saving: boolean; saved: boolean; saveError: string | null
  onSubmit: () => void
}

function PredictionForm({ match, players, homeScore, setHomeScore, awayScore, setAwayScore, firstTeam, setFirstTeam, playerName, setPlayerName, saving, saved, saveError, onSubmit }: FormProps) {
  const hasRoster = players.length > 0
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit() }} className="space-y-5">
      {/* Score */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Final score (90 min)</p>
        <div className="flex items-center justify-around gap-4">
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium text-gray-600 text-center leading-tight">{match.home_team}</span>
            <Stepper value={homeScore} onChange={setHomeScore} />
          </div>
          <span className="text-2xl font-bold text-gray-300 mt-4">–</span>
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium text-gray-600 text-center leading-tight">{match.away_team}</span>
            <Stepper value={awayScore} onChange={setAwayScore} />
          </div>
        </div>
      </div>

      {/* First to score */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">First team to score</p>
        <div className="grid grid-cols-3 gap-2">
          {(['home', 'away', 'none'] as const).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setFirstTeam(opt)}
              className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                firstTeam === opt
                  ? 'bg-green-700 border-green-700 text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-green-400'
              }`}
            >
              {opt === 'home' ? match.home_team.split(' ').slice(-1)[0]
                : opt === 'away' ? match.away_team.split(' ').slice(-1)[0]
                : 'No goals'}
            </button>
          ))}
        </div>
      </div>

      {/* Player pick */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Player pick</p>
        <p className="text-xs text-gray-400 mb-3">+2 if they score · +1 if they assist · max 3 pts</p>
        {hasRoster ? (
          <select
            required
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">— Pick a player —</option>
            {[match.home_team, match.away_team].map(team => {
              const squad = players.filter(p => p.team === team)
              if (squad.length === 0) return null
              return (
                <optgroup key={team} label={team}>
                  {squad.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        ) : (
          <input
            type="text"
            required
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Last name only — e.g. Mbappé"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        )}
      </div>

      {saveError && <p className="text-red-600 text-sm px-1">{saveError}</p>}

      <button
        type="submit"
        disabled={saving || !playerName.trim()}
        className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition-colors"
      >
        {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save prediction'}
      </button>
    </form>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 text-lg font-bold hover:bg-gray-200 transition-colors"
      >
        −
      </button>
      <span className="text-3xl font-bold text-gray-800 w-8 text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 text-lg font-bold hover:bg-gray-200 transition-colors"
      >
        +
      </button>
    </div>
  )
}

// ─── Locked / finished view ────────────────────────────────────────────────────

function LockedView({ match, myPrediction, allPredictions, matchEvents, userId }: {
  match: Match
  myPrediction: Prediction | null
  allPredictions: PredictionWithTeam[]
  matchEvents: MatchEvent[]
  userId: string
}) {
  const state = getMatchState(match.kickoff_utc, match.status)
  const isFinished = state === 'finished'

  return (
    <div className="space-y-4">
      {/* My prediction */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">My prediction</p>
        {myPrediction ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Score</span>
              <span className="font-bold text-gray-800">
                {myPrediction.pred_home_score} – {myPrediction.pred_away_score}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">First to score</span>
              <span className="font-medium text-gray-700">{firstTeamLabel(myPrediction.pred_first_team)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Player pick</span>
              <span className="font-medium text-gray-700">{myPrediction.pred_player_name}</span>
            </div>
            {isFinished && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm text-gray-500">Points earned</span>
                <span className="text-2xl font-black text-green-700">
                  {myPrediction.points} pts
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm italic">You didn't submit a prediction for this match.</p>
        )}
      </div>

      {/* Score breakdown — only for finished matches with a prediction */}
      {isFinished && myPrediction && (
        <ScoreBreakdown match={match} prediction={myPrediction} events={matchEvents} />
      )}

      {/* All predictions (visible after kickoff) */}
      {allPredictions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            All predictions ({allPredictions.length})
          </p>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">Team</th>
                  <th className="text-center pb-2 font-medium">Score</th>
                  <th className="text-center pb-2 font-medium">1st scorer</th>
                  <th className="text-left pb-2 font-medium">Player</th>
                  {isFinished && <th className="text-right pb-2 font-medium">Pts</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allPredictions
                  .slice()
                  .sort((a, b) => Number(b.points) - Number(a.points))
                  .map(p => (
                    <tr key={p.id} className={p.user_id === userId ? 'bg-green-50' : ''}>
                      <td className="py-2 pr-2 font-medium text-gray-800 text-xs">
                        {p.profiles.team_name}
                        {p.user_id === userId && <span className="ml-1 text-green-600 text-xs">(you)</span>}
                      </td>
                      <td className="py-2 text-center font-mono text-gray-700">
                        {p.pred_home_score}–{p.pred_away_score}
                      </td>
                      <td className="py-2 text-center text-gray-600 text-xs">
                        {firstTeamLabel(p.pred_first_team)}
                      </td>
                      <td className="py-2 text-gray-600 text-xs">{p.pred_player_name}</td>
                      {isFinished && (
                        <td className="py-2 text-right font-bold text-green-700">{p.points}</td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Score breakdown card ──────────────────────────────────────────────────────

const STAGE_MULTIPLIERS: Record<string, number> = {
  group: 1.0, r32: 1.5, r16: 2.0, qf: 2.5, sf: 3.0, '3rd': 2.0, final: 4.0,
}

function ScoreBreakdown({ match, prediction, events }: {
  match: Match; prediction: Prediction; events: MatchEvent[]
}) {
  const mult = STAGE_MULTIPLIERS[match.stage] ?? 1.0

  // Scoreline component
  const predOutcome = prediction.pred_home_score > prediction.pred_away_score ? 'home'
    : prediction.pred_home_score < prediction.pred_away_score ? 'away' : 'draw'
  const actualOutcome = match.home_score! > match.away_score! ? 'home'
    : match.home_score! < match.away_score! ? 'away' : 'draw'

  let scorelinePts: number
  let scorelineReason: string
  if (prediction.pred_home_score === match.home_score && prediction.pred_away_score === match.away_score) {
    scorelinePts = 5; scorelineReason = 'Exact scoreline'
  } else if (
    predOutcome === actualOutcome &&
    (prediction.pred_home_score - prediction.pred_away_score) === (match.home_score! - match.away_score!)
  ) {
    scorelinePts = 3; scorelineReason = 'Right result & goal difference'
  } else if (predOutcome === actualOutcome) {
    scorelinePts = 2; scorelineReason = 'Right result'
  } else {
    scorelinePts = 0; scorelineReason = 'Wrong result'
  }

  // First scorer component
  const firstCorrect = prediction.pred_first_team === match.first_scorer_team
  const firstPts = firstCorrect ? 1 : 0

  // Player component
  const pl = prediction.pred_player_name.toLowerCase()
  const playerScored  = events.some(e => e.event_type === 'goal'   && e.player_name.toLowerCase() === pl)
  const playerAssisted = events.some(e => e.event_type === 'assist' && e.player_name.toLowerCase() === pl)
  const playerPts = (playerScored ? 2 : 0) + (playerAssisted ? 1 : 0)

  const basePts = scorelinePts + firstPts + playerPts

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Score breakdown</p>

      <div className="space-y-3">
        {/* Scoreline */}
        <BreakdownRow
          label="Scoreline"
          detail={`You: ${prediction.pred_home_score}–${prediction.pred_away_score}  ·  Actual: ${match.home_score}–${match.away_score}`}
          tag={scorelineReason}
          correct={scorelinePts > 0}
          pts={scorelinePts}
          maxPts={5}
        />

        {/* First scorer */}
        <BreakdownRow
          label="First team to score"
          detail={`You: ${firstTeamLabel(prediction.pred_first_team)}  ·  Actual: ${firstTeamLabel(match.first_scorer_team ?? 'none')}`}
          tag={firstCorrect ? 'Correct' : 'Wrong'}
          correct={firstCorrect}
          pts={firstPts}
          maxPts={1}
        />

        {/* Player */}
        <BreakdownRow
          label={`Player — ${prediction.pred_player_name}`}
          detail={[
            playerScored   ? '⚽ scored'   : null,
            playerAssisted ? '🎯 assisted' : null,
            !playerScored && !playerAssisted ? 'No goal or assist' : null,
          ].filter(Boolean).join('  ·  ')}
          tag={playerPts > 0 ? `+${playerPts} pts` : 'No pts'}
          correct={playerPts > 0}
          pts={playerPts}
          maxPts={3}
        />
      </div>

      {/* Totals */}
      <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5">
        <div className="flex justify-between text-sm text-gray-500">
          <span>Base score</span>
          <span className="font-semibold text-gray-700">{basePts} / 9 pts</span>
        </div>
        <div className="flex justify-between text-sm text-gray-500">
          <span>Stage multiplier ({stageLabel(match.stage, match.group_label)})</span>
          <span className="font-semibold text-gray-700">× {mult}</span>
        </div>
        <div className="flex justify-between items-baseline pt-1">
          <span className="text-base font-bold text-gray-800">Total</span>
          <span className="text-2xl font-black text-green-700">{prediction.points} pts</span>
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({ label, detail, tag, correct, pts, maxPts }: {
  label: string; detail: string; tag: string; correct: boolean; pts: number; maxPts: number
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{detail}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
          correct ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {tag}
        </span>
        <span className={`text-sm font-bold w-12 text-right tabular-nums ${
          pts > 0 ? 'text-green-700' : 'text-gray-300'
        }`}>
          {pts} / {maxPts}
        </span>
      </div>
    </div>
  )
}

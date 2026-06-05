import { useEffect, useState, FormEvent, KeyboardEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { AdminLayout } from './AdminLayout'
import type { Match, MatchEvent } from '../../types/database'
import { stageLabel } from '../../lib/utils'

export function AdminResultEditor() {
  const { id } = useParams<{ id: string }>()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [match, setMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Form state
  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [firstScorerTeam, setFirstScorerTeam] = useState<'home' | 'away' | 'none'>('home')
  const [goalscorers, setGoalscorers] = useState<string[]>([])
  const [assists, setAssists] = useState<string[]>([])
  const [newGoalscorer, setNewGoalscorer] = useState('')
  const [newAssist, setNewAssist] = useState('')

  useEffect(() => {
    async function load() {
      const matchId = Number(id)
      const [{ data: mData }, { data: evData }] = await Promise.all([
        supabase.from('matches').select('*').eq('id', matchId).single(),
        supabase.from('match_events').select('*').eq('match_id', matchId),
      ])
      const m = mData as Match | null
      setMatch(m)
      if (m) {
        setHomeScore(m.home_score ?? 0)
        setAwayScore(m.away_score ?? 0)
        setFirstScorerTeam(m.first_scorer_team ?? 'home')
      }
      const evs = (evData ?? []) as MatchEvent[]
      setGoalscorers(evs.filter(e => e.event_type === 'goal').map(e => e.player_name))
      setAssists(evs.filter(e => e.event_type === 'assist').map(e => e.player_name))
      setLoading(false)
    }
    load()
  }, [id])

  function addToList(
    list: string[], setList: (v: string[]) => void,
    input: string, setInput: (v: string) => void
  ) {
    const name = input.trim()
    if (name) { setList([...list, name]); setInput('') }
  }

  function removeFromList(list: string[], setList: (v: string[]) => void, idx: number) {
    setList(list.filter((_, i) => i !== idx))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!match || !session) return
    setSaving(true)
    setSaveMsg(null)

    const matchId = match.id
    const events = [
      ...goalscorers.map(p => ({ match_id: matchId, player_name: p, event_type: 'goal' as const })),
      ...assists.map(p => ({ match_id: matchId, player_name: p, event_type: 'assist' as const })),
    ]

    // Step 1: replace match_events (delete then insert)
    const { error: delErr } = await supabase
      .from('match_events').delete().eq('match_id', matchId)
    if (delErr) { setSaving(false); setSaveMsg({ ok: false, text: delErr.message }); return }

    if (events.length > 0) {
      const { error: evErr } = await supabase.from('match_events').insert(events)
      if (evErr) { setSaving(false); setSaveMsg({ ok: false, text: evErr.message }); return }
    }

    // Step 2: update match — trigger fires here and grades all predictions
    const { error: mErr } = await supabase.from('matches').update({
      home_score: homeScore,
      away_score: awayScore,
      first_scorer_team: firstScorerTeam,
      status: 'finished',
    }).eq('id', matchId)
    if (mErr) { setSaving(false); setSaveMsg({ ok: false, text: mErr.message }); return }

    // Step 3: audit log
    await supabase.from('result_audit').insert({
      match_id: matchId,
      changed_by: session.user.id,
      snapshot: { home_score: homeScore, away_score: awayScore, first_scorer_team: firstScorerTeam, events },
    })

    // Refresh match state
    const { data: fresh } = await supabase.from('matches').select('*').eq('id', matchId).single()
    setMatch(fresh as Match)
    setSaving(false)
    setSaveMsg({ ok: true, text: `Saved! Grading ran automatically for all predictions.` })
  }

  if (loading) {
    return <AdminLayout><p className="text-gray-400 py-8 text-center">Loading…</p></AdminLayout>
  }

  if (!match) {
    return <AdminLayout><p className="text-gray-400 py-8 text-center">Match not found.</p></AdminLayout>
  }

  const isFinished = match.status === 'finished'

  return (
    <AdminLayout>
      <button onClick={() => navigate('/admin/results')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Back to results
      </button>

      {/* Match header */}
      <div className="bg-green-800 text-white rounded-2xl px-5 py-4 mb-5">
        <p className="text-xs uppercase tracking-widest text-green-300 mb-1">
          {stageLabel(match.stage, match.group_label)}
          {isFinished && <span className="ml-2 bg-green-700 px-2 py-0.5 rounded-full text-xs">Finished</span>}
        </p>
        <p className="font-bold text-xl">{match.home_team} vs {match.away_team}</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Scores */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">90-min score</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">{match.home_team}</label>
              <input
                type="number" min={0} max={99} required
                value={homeScore}
                onChange={e => setHomeScore(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xl font-bold text-gray-800 text-center focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">{match.away_team}</label>
              <input
                type="number" min={0} max={99} required
                value={awayScore}
                onChange={e => setAwayScore(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xl font-bold text-gray-800 text-center focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {/* First scorer */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">First team to score</p>
          <div className="grid grid-cols-3 gap-2">
            {(['home', 'away', 'none'] as const).map(opt => (
              <button
                key={opt} type="button"
                onClick={() => setFirstScorerTeam(opt)}
                className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                  firstScorerTeam === opt
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

        {/* Goalscorers */}
        <PlayerList
          title="Goalscorers"
          subtitle="Players who scored (own goals: leave blank)"
          items={goalscorers}
          onRemove={i => removeFromList(goalscorers, setGoalscorers, i)}
          inputValue={newGoalscorer}
          onInputChange={setNewGoalscorer}
          onAdd={() => addToList(goalscorers, setGoalscorers, newGoalscorer, setNewGoalscorer)}
        />

        {/* Assists */}
        <PlayerList
          title="Assists"
          subtitle="Players who recorded an assist"
          items={assists}
          onRemove={i => removeFromList(assists, setAssists, i)}
          inputValue={newAssist}
          onInputChange={setNewAssist}
          onAdd={() => addToList(assists, setAssists, newAssist, setNewAssist)}
        />

        {saveMsg && (
          <div className={`rounded-xl px-4 py-3 text-sm ${saveMsg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {saveMsg.text}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition-colors"
        >
          {saving ? 'Saving & grading…' : isFinished ? 'Re-save & re-grade' : 'Save result & grade'}
        </button>
      </form>
    </AdminLayout>
  )
}

// ── Player list sub-component ──────────────────────────────────────────────────

interface PlayerListProps {
  title: string
  subtitle: string
  items: string[]
  onRemove: (i: number) => void
  inputValue: string
  onInputChange: (v: string) => void
  onAdd: () => void
}

function PlayerList({ title, subtitle, items, onRemove, inputValue, onInputChange, onAdd }: PlayerListProps) {
  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); onAdd() }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">{title}</p>
      <p className="text-xs text-gray-400 mb-3">{subtitle}</p>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {items.map((name, i) => (
            <span key={i} className="flex items-center gap-1 bg-green-50 text-green-800 text-xs font-medium px-3 py-1 rounded-full">
              {name}
              <button type="button" onClick={() => onRemove(i)} className="text-green-500 hover:text-green-700 ml-1 font-bold">×</button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Player name"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!inputValue.trim()}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 font-medium text-sm rounded-lg transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  )
}

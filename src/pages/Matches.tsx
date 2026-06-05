import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Header } from '../components/Header'
import type { Match, Prediction } from '../types/database'
import {
  getMatchState,
  formatKickoffTime,
  groupMatchesByDate,
  stageLabel,
  firstTeamLabel,
} from '../lib/utils'

export function Matches() {
  const { session } = useAuth()
  const [matches, setMatches] = useState<Match[]>([])
  const [myPredictions, setMyPredictions] = useState<Record<number, Prediction>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: mData }, { data: pData }] = await Promise.all([
        supabase.from('matches').select('*').order('kickoff_utc'),
        supabase.from('predictions').select('*').eq('user_id', session!.user.id),
      ])
      setMatches((mData ?? []) as Match[])
      const map: Record<number, Prediction> = {}
      for (const p of (pData ?? []) as Prediction[]) map[p.match_id] = p
      setMyPredictions(map)
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

  const grouped = groupMatchesByDate(matches)

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4">
        {matches.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">📋</p>
            <p>No fixtures yet — admin will sync them shortly.</p>
          </div>
        ) : (
          grouped.map(([heading, dayMatches]) => (
            <section key={heading} className="mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2 px-1">
                {heading}
              </h2>
              <div className="space-y-2">
                {dayMatches.map(match => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    prediction={myPredictions[match.id]}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </>
  )
}

function MatchRow({ match, prediction }: { match: Match; prediction?: Prediction }) {
  const state = getMatchState(match.kickoff_utc, match.status)

  const badge = {
    open:     { label: 'Open',     cls: 'bg-green-100 text-green-800' },
    locked:   { label: 'Locked',   cls: 'bg-amber-100 text-amber-800' },
    finished: { label: 'Finished', cls: 'bg-gray-100 text-gray-500'   },
  }[state]

  return (
    <Link
      to={`/matches/${match.id}`}
      className="block bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: teams + meta */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-snug">
            {match.home_team} <span className="text-gray-400 font-normal">vs</span> {match.away_team}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatKickoffTime(match.kickoff_utc)} · {stageLabel(match.stage, match.group_label)}
          </p>
        </div>

        {/* Right: badge + prediction summary */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
            {badge.label}
          </span>
          {prediction ? (
            <span className="text-xs text-gray-500 text-right">
              {prediction.pred_home_score}–{prediction.pred_away_score}
              {' · '}{firstTeamLabel(prediction.pred_first_team)}
              {' · '}{prediction.pred_player_name}
            </span>
          ) : state === 'open' ? (
            <span className="text-xs font-medium text-green-600">＋ Predict</span>
          ) : (
            <span className="text-xs text-gray-300 italic">No prediction</span>
          )}
        </div>
      </div>

      {/* Finished: result row */}
      {state === 'finished' && match.home_score != null && (
        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-700">
            {match.home_score} – {match.away_score}
          </span>
          {prediction && (
            <span className="text-xs font-semibold text-green-700">
              {prediction.base_points} × {/* multiplier shown in detail */}= {prediction.points} pts
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

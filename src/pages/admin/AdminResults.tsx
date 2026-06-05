import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { AdminLayout } from './AdminLayout'
import type { Match } from '../../types/database'
import { getMatchState, formatKickoffTime, formatDateHeading, stageLabel } from '../../lib/utils'

export function AdminResults() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('matches')
      .select('*')
      .order('kickoff_utc')
      .then(({ data }) => {
        setMatches((data ?? []) as Match[])
        setLoading(false)
      })
  }, [])

  const grouped: [string, Match[]][] = []
  const seen = new Set<string>()
  for (const m of matches) {
    const heading = formatDateHeading(m.kickoff_utc)
    if (!seen.has(heading)) { seen.add(heading); grouped.push([heading, []]) }
    grouped[grouped.length - 1][1].push(m)
  }

  return (
    <AdminLayout>
      <h1 className="text-lg font-bold text-gray-800 mb-4">Enter Results</h1>
      {loading ? (
        <p className="text-gray-400 py-8 text-center">Loading…</p>
      ) : matches.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>No fixtures yet. Use the Fixture Sync (coming Phase 4) to load matches.</p>
        </div>
      ) : (
        grouped.map(([heading, dayMatches]) => (
          <section key={heading} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{heading}</h2>
            <div className="space-y-2">
              {dayMatches.map(m => <AdminMatchRow key={m.id} match={m} />)}
            </div>
          </section>
        ))
      )}
    </AdminLayout>
  )
}

function AdminMatchRow({ match }: { match: Match }) {
  const state = getMatchState(match.kickoff_utc, match.status)

  const badge = {
    open:     { label: 'Open',     cls: 'bg-green-100 text-green-700' },
    locked:   { label: 'In play',  cls: 'bg-amber-100 text-amber-700' },
    finished: { label: 'Finished', cls: 'bg-gray-100 text-gray-500'   },
  }[state]

  return (
    <Link
      to={`/admin/results/${match.id}`}
      className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:shadow-md transition-shadow"
    >
      <div>
        <p className="text-sm font-semibold text-gray-800">
          {match.home_team} vs {match.away_team}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatKickoffTime(match.kickoff_utc)} · {stageLabel(match.stage, match.group_label)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {state === 'finished' && match.home_score != null && (
          <span className="text-sm font-bold text-gray-600">
            {match.home_score}–{match.away_score}
          </span>
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-gray-300 text-sm">›</span>
      </div>
    </Link>
  )
}

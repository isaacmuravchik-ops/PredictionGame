import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Header } from '../components/Header'
import type { LeaderboardRow } from '../types/database'

export function Leaderboard() {
  const { session } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('leaderboard')
      .select('*')
      .then(({ data }) => {
        setRows((data ?? []) as LeaderboardRow[])
        setLoading(false)
      })
  }, [])

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-4">
        <h1 className="text-lg font-bold text-gray-800 mb-4">Leaderboard</h1>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🏆</p>
            <p>No scores yet — check back after the first match.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-xs text-gray-400 uppercase tracking-wide">
                  <th className="text-center py-3 px-4 font-medium w-10">#</th>
                  <th className="text-left py-3 px-4 font-medium">Team</th>
                  <th className="text-right py-3 px-4 font-medium">Points</th>
                  <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">Scoring</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, i) => {
                  const isMe = row.user_id === session!.user.id
                  return (
                    <tr
                      key={row.user_id}
                      className={isMe ? 'bg-green-50' : 'hover:bg-gray-50'}
                    >
                      <td className="py-3 px-4 text-center font-bold text-gray-400">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-800">
                        {row.team_name}
                        {isMe && (
                          <span className="ml-2 text-xs font-normal text-green-600">(you)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-gray-800">
                        {Number(row.total_points).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-400 hidden sm:table-cell">
                        {Number(row.scoring_matches)} matches
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  )
}

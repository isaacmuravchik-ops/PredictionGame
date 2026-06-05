import { useState, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

type NameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export function Onboarding() {
  const { session, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [teamName, setTeamName] = useState('')
  const [nameStatus, setNameStatus] = useState<NameStatus>('idle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Already has a profile — go to home
  if (profile) return <Navigate to="/" replace />
  // Not signed in — go to sign in
  if (session === null) return <Navigate to="/signin" replace />

  async function checkUniqueness(name: string) {
    if (name.trim().length < 2) {
      setNameStatus('invalid')
      return
    }
    setNameStatus('checking')
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .ilike('team_name', name.trim())
      .maybeSingle()
    setNameStatus(data ? 'taken' : 'available')
  }

  function handleChange(value: string) {
    setTeamName(value)
    setNameStatus('idle')
    setError(null)
    if (checkTimeout.current) clearTimeout(checkTimeout.current)
    if (value.trim().length >= 2) {
      checkTimeout.current = setTimeout(() => checkUniqueness(value), 400)
    }
  }

  async function handleSubmit() {
    if (nameStatus !== 'available' || !session) return
    setSaving(true)
    setError(null)

    const { error: err } = await supabase.from('profiles').insert({
      id: session.user.id,
      team_name: teamName.trim(),
    })

    if (err) {
      setSaving(false)
      if (err.code === '23505') {
        setNameStatus('taken')
        setError('That name is already taken. Choose another.')
      } else {
        setError(err.message)
      }
      return
    }

    await refreshProfile()
    navigate('/', { replace: true })
  }

  const statusHint: Record<NameStatus, { text: string; color: string } | null> = {
    idle: null,
    checking: { text: 'Checking availability…', color: 'text-gray-400' },
    available: { text: '✓ Name is available', color: 'text-green-600' },
    taken: { text: '✗ Name already taken', color: 'text-red-600' },
    invalid: { text: 'Must be at least 2 characters', color: 'text-gray-400' },
  }

  const hint = statusHint[nameStatus]
  const canSubmit = nameStatus === 'available' && !saving

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">⚽</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">World Cup 2026</h1>
          <p className="text-green-300 mt-1 text-sm uppercase tracking-widest">Prediction Game</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Choose your team name</h2>
          <p className="text-gray-500 text-sm mb-1">
            This is the name everyone sees on the leaderboard.
          </p>
          <p className="text-amber-600 text-xs font-medium mb-5 bg-amber-50 rounded-lg px-3 py-2">
            ⚠️ Your team name is permanent and cannot be changed once set.
          </p>

          <form onSubmit={e => { e.preventDefault(); void handleSubmit() }} className="space-y-4">
            <div>
              <label htmlFor="team-name" className="block text-sm font-medium text-gray-700 mb-1">
                Team name
              </label>
              <input
                id="team-name"
                type="text"
                required
                maxLength={40}
                value={teamName}
                onChange={e => handleChange(e.target.value)}
                onBlur={() => teamName.trim() && checkUniqueness(teamName)}
                placeholder="e.g. The Offside Trappers"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {hint && (
                <p className={`mt-1 text-xs ${hint.color}`}>{hint.text}</p>
              )}
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-semibold rounded-lg px-4 py-2.5 transition-colors"
            >
              {saving ? 'Saving…' : 'Save team name'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

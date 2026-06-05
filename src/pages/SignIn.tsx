import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

type Mode = 'signin' | 'signup'

export function SignIn() {
  const { session } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit() {
    setLoading(true)
    setError(null)

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) setError(err.message)
    } else {
      const { error: err } = await supabase.auth.signUp({ email: email.trim(), password })
      if (err) setError(err.message)
    }

    setLoading(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setPassword('')
  }

  return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">⚽</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">World Cup 2026</h1>
          <p className="text-green-300 mt-1 text-sm uppercase tracking-widest">Prediction Game</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h2>

          <form onSubmit={e => { e.preventDefault(); void handleSubmit() }} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2.5 transition-colors"
            >
              {loading
                ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
                : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            {mode === 'signin' ? (
              <>
                New here?{' '}
                <button onClick={() => switchMode('signup')} className="text-green-700 font-medium hover:underline">
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => switchMode('signin')} className="text-green-700 font-medium hover:underline">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

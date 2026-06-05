import { useState, FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export function SignIn() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)
    if (err) {
      setError(err.message)
    } else {
      setSent(true)
    }
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
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✉️</div>
              <h2 className="text-lg font-semibold text-gray-800">Check your email</h2>
              <p className="text-gray-500 mt-2 text-sm">
                We sent a sign-in link to <span className="font-medium text-gray-700">{email}</span>.
                Click it to continue.
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="mt-4 text-sm text-green-700 underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Sign in</h2>
              <p className="text-gray-500 text-sm mb-5">
                Enter your email and we'll send you a magic link — no password needed.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                {error && (
                  <p className="text-red-600 text-sm">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2.5 transition-colors"
                >
                  {loading ? 'Sending…' : 'Send magic link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

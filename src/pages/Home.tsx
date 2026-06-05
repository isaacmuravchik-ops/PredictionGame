import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export function Home() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/signin', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-green-800 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚽</span>
          <span className="font-bold text-sm tracking-wide uppercase">WC 2026 Predictions</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-green-200 text-sm hidden sm:block">{profile?.team_name}</span>
          <button
            onClick={signOut}
            className="text-green-200 hover:text-white text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Placeholder content — replaced in Phase 2 */}
      <main className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 text-lg">
          Welcome, <span className="font-semibold text-gray-700">{profile?.team_name}</span>!
        </p>
        <p className="text-gray-400 mt-2 text-sm">Match list coming in Phase 2.</p>
      </main>
    </div>
  )
}

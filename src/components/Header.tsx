import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export function Header() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/signin', { replace: true })
  }

  return (
    <header className="bg-green-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow">
      <Link to="/" className="flex items-center gap-2">
        <span className="text-lg">⚽</span>
        <span className="font-bold text-sm tracking-wide uppercase hidden sm:block">WC 2026 Predictions</span>
        <span className="font-bold text-sm tracking-wide uppercase sm:hidden">WC 2026</span>
      </Link>

      <nav className="flex items-center gap-4">
        <Link to="/leaderboard" className="text-green-200 hover:text-white text-sm transition-colors">
          Leaderboard
        </Link>
        {profile?.is_admin && (
          <Link to="/admin" className="text-amber-300 hover:text-amber-100 text-sm transition-colors">
            Admin
          </Link>
        )}
        <span className="text-green-300 text-sm hidden sm:block">{profile?.team_name}</span>
        <button
          onClick={signOut}
          className="text-green-200 hover:text-white text-sm transition-colors"
        >
          Sign out
        </button>
      </nav>
    </header>
  )
}

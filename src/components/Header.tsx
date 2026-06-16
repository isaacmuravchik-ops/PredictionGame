import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export function Header() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [showRules, setShowRules] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/signin', { replace: true })
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
      <header className="bg-green-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow">
        <Link to="/" className="flex items-center gap-2" onClick={closeMenu}>
          <span className="text-lg">⚽</span>
          <span className="font-bold text-sm tracking-wide uppercase hidden sm:block">WC 2026 Predictions</span>
          <span className="font-bold text-sm tracking-wide uppercase sm:hidden">WC 2026</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-4">
          <Link to="/leaderboard" className="text-green-200 hover:text-white text-sm transition-colors">
            Leaderboard
          </Link>
          <Link to="/stats" className="text-green-200 hover:text-white text-sm transition-colors">
            Stats
          </Link>
          <Link to="/bot-picks" className="text-green-200 hover:text-white text-sm transition-colors">
            🤖 Bot
          </Link>
          {profile?.is_admin && (
            <Link to="/admin" className="text-amber-300 hover:text-amber-100 text-sm transition-colors">
              Admin
            </Link>
          )}
          <button
            onClick={() => setShowRules(true)}
            className="text-green-200 hover:text-white text-sm transition-colors"
          >
            How to play
          </button>
          <span className="text-green-300 text-sm">{profile?.team_name}</span>
          <button onClick={signOut} className="text-green-200 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden text-green-200 hover:text-white text-2xl leading-none p-1"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="sm:hidden bg-green-900 text-white flex flex-col sticky top-[52px] z-20 shadow-lg">
          <Link to="/leaderboard" onClick={closeMenu} className="px-5 py-3 text-sm text-green-200 hover:bg-green-800 hover:text-white border-b border-green-800 transition-colors">
            Leaderboard
          </Link>
          <Link to="/stats" onClick={closeMenu} className="px-5 py-3 text-sm text-green-200 hover:bg-green-800 hover:text-white border-b border-green-800 transition-colors">
            Stats
          </Link>
          <Link to="/bot-picks" onClick={closeMenu} className="px-5 py-3 text-sm text-green-200 hover:bg-green-800 hover:text-white border-b border-green-800 transition-colors">
            🤖 Bot
          </Link>
          {profile?.is_admin && (
            <Link to="/admin" onClick={closeMenu} className="px-5 py-3 text-sm text-amber-300 hover:bg-green-800 hover:text-amber-100 border-b border-green-800 transition-colors">
              Admin
            </Link>
          )}
          <button
            onClick={() => { setShowRules(true); closeMenu() }}
            className="px-5 py-3 text-sm text-green-200 hover:bg-green-800 hover:text-white border-b border-green-800 transition-colors text-left"
          >
            How to play
          </button>
          {profile?.team_name && (
            <div className="px-5 py-3 text-sm text-green-300 border-b border-green-800">
              {profile.team_name}
            </div>
          )}
          <button
            onClick={() => { signOut(); closeMenu() }}
            className="px-5 py-3 text-sm text-green-200 hover:bg-green-800 hover:text-white transition-colors text-left"
          >
            Sign out
          </button>
        </div>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-green-800 text-white px-5 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">How to play</h2>
            <p className="text-green-300 text-xs mt-0.5">WC 2026 Prediction Game</p>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* What you pick */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">What you predict</h3>
            <ul className="space-y-1 text-sm text-gray-700">
              <li className="flex gap-2"><span>⚽</span><span>Final score (90 minutes)</span></li>
              <li className="flex gap-2"><span>🏹</span><span>First team to score</span></li>
              <li className="flex gap-2"><span>👤</span><span>One player to score or assist</span></li>
            </ul>
            <p className="text-xs text-gray-400 mt-2">Predictions lock at kickoff — no changes after that.</p>
          </section>

          {/* Base points */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Base points</h3>
            <div className="space-y-1">
              <ScoreRow label="Exact scoreline" pts={5} highlight />
              <ScoreRow label="Right result + goal difference or one score correct" pts={3} />
              <ScoreRow label="Right result (win / draw / loss)" pts={2} />
              <ScoreRow label="Wrong result" pts={0} />
              <div className="border-t border-gray-100 my-2" />
              <ScoreRow label="First team to score — correct" pts={1} />
              <div className="border-t border-gray-100 my-2" />
              <ScoreRow label="Your player scores" pts={2} />
              <ScoreRow label="Your player assists" pts={1} />
              <ScoreRow label="Your player scores and assists" pts={3} highlight />
            </div>
            <p className="text-xs text-gray-400 mt-2">Maximum base: <span className="font-semibold text-gray-600">9 pts</span> (exact score + first scorer + goal + assist)</p>
          </section>

          {/* Multipliers */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Stage multiplier</h3>
            <p className="text-xs text-gray-500 mb-2">Final points = base × multiplier. Knockout picks are worth more.</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {[
                ['Group stage',   '×1.0'],
                ['Round of 32',   '×1.5'],
                ['Round of 16',   '×2.0'],
                ['Quarter-final', '×2.5'],
                ['Semi-final',    '×3.0'],
                ['3rd Place',     '×2.0'],
                ['Final',         '×4.0'],
              ].map(([stage, mult]) => (
                <div key={stage} className="flex justify-between text-sm py-0.5">
                  <span className="text-gray-600">{stage}</span>
                  <span className={`font-semibold ${mult === '×4.0' ? 'text-green-700' : 'text-gray-700'}`}>{mult}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Example */}
          <section className="bg-green-50 rounded-xl px-4 py-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Examples</h3>
            <p className="text-sm text-gray-700">
              You predict <span className="font-semibold">2–1</span>, correct first scorer, and your player scores.
              That's <span className="font-semibold">5 + 1 + 2 = 8 base pts</span>. In a quarter-final (×2.5) that's{' '}
              <span className="font-bold text-green-700">20 pts</span>.
            </p>
            <p className="text-sm text-gray-700">
              You predict <span className="font-semibold">2–1</span>, actual score is <span className="font-semibold">2–0</span>: right result and the 2 matched, so{' '}
              <span className="font-semibold">3 pts</span> for the scoreline.
            </p>
          </section>

          <button
            onClick={onClose}
            className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

function ScoreRow({ label, pts, highlight }: { label: string; pts: number; highlight?: boolean }) {
  return (
    <div className={`flex justify-between items-center text-sm py-0.5 ${highlight ? 'font-semibold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span className={`tabular-nums ml-4 shrink-0 ${pts > 0 ? 'text-green-700' : 'text-gray-400'}`}>
        {pts > 0 ? `+${pts} pts` : '0 pts'}
      </span>
    </div>
  )
}

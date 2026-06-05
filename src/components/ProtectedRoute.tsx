import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function Spinner() {
  return (
    <div className="min-h-screen bg-green-900 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">⚽</div>
        <p className="text-green-300 text-sm">Loading…</p>
      </div>
    </div>
  )
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()

  // Still resolving session / profile
  if (session === undefined || (session && profile === undefined)) return <Spinner />

  // Not authenticated
  if (!session) return <Navigate to="/signin" replace />

  // Authenticated but no team name yet
  if (!profile) return <Navigate to="/onboarding" replace />

  return <>{children}</>
}

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

export function AdminRoute({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()

  if (session === undefined || (session && profile === undefined)) return <Spinner />
  if (!session) return <Navigate to="/signin" replace />
  if (!profile) return <Navigate to="/onboarding" replace />
  if (!profile.is_admin) return <Navigate to="/" replace />

  return <>{children}</>
}

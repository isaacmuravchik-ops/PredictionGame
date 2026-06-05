import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SignIn } from './pages/SignIn'
import { Onboarding } from './pages/Onboarding'
import { AuthCallback } from './pages/AuthCallback'
import { Matches } from './pages/Matches'
import { MatchDetail } from './pages/MatchDetail'
import { Leaderboard } from './pages/Leaderboard'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route
            path="/"
            element={<ProtectedRoute><Matches /></ProtectedRoute>}
          />
          <Route
            path="/matches/:id"
            element={<ProtectedRoute><MatchDetail /></ProtectedRoute>}
          />
          <Route
            path="/leaderboard"
            element={<ProtectedRoute><Leaderboard /></ProtectedRoute>}
          />
          {/* Admin routes added in Phase 3 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { SignIn } from './pages/SignIn'
import { Onboarding } from './pages/Onboarding'
import { AuthCallback } from './pages/AuthCallback'
import { Matches } from './pages/Matches'
import { MatchDetail } from './pages/MatchDetail'
import { Leaderboard } from './pages/Leaderboard'
import { Stats } from './pages/Stats'
import { AdminResults } from './pages/admin/AdminResults'
import { AdminResultEditor } from './pages/admin/AdminResultEditor'
import { AdminFixtures } from './pages/admin/AdminFixtures'
import { AdminRoster } from './pages/admin/AdminRoster'
import { AdminData } from './pages/admin/AdminData'
import { AdminUsers } from './pages/admin/AdminUsers'
import { AdminBot } from './pages/admin/AdminBot'
import { BotPicks } from './pages/BotPicks'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public auth routes */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/onboarding" element={<Onboarding />} />

          {/* Player routes */}
          <Route path="/" element={<ProtectedRoute><Matches /></ProtectedRoute>} />
          <Route path="/matches/:id" element={<ProtectedRoute><MatchDetail /></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
          <Route path="/stats" element={<ProtectedRoute><Stats /></ProtectedRoute>} />
          <Route path="/bot-picks" element={<ProtectedRoute><BotPicks /></ProtectedRoute>} />

          {/* Admin routes */}
          <Route path="/admin" element={<Navigate to="/admin/results" replace />} />
          <Route path="/admin/results" element={<AdminRoute><AdminResults /></AdminRoute>} />
          <Route path="/admin/results/:id" element={<AdminRoute><AdminResultEditor /></AdminRoute>} />
          <Route path="/admin/fixtures" element={<AdminRoute><AdminFixtures /></AdminRoute>} />
          <Route path="/admin/roster" element={<AdminRoute><AdminRoster /></AdminRoute>} />
          <Route path="/admin/data" element={<AdminRoute><AdminData /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
          <Route path="/admin/bot" element={<AdminRoute><AdminBot /></AdminRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

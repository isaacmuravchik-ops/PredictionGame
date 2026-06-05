import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase v2 detects the token hash or PKCE code automatically on client init.
    // If a code param is present, exchange it for a session.
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(() => {
        navigate('/', { replace: true })
      })
    } else {
      // Hash-based flow: the client already processed it; navigate once session is ready.
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          navigate('/', { replace: true })
        } else {
          // Fallback: listen for the session to arrive
          const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
              subscription.unsubscribe()
              navigate('/', { replace: true })
            }
          })
        }
      })
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-green-900 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">⚽</div>
        <p className="text-white text-lg">Signing you in…</p>
      </div>
    </div>
  )
}

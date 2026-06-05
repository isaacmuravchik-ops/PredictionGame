import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types/database'

interface AuthContextType {
  session: Session | null | undefined   // undefined = still loading
  profile: Profile | null | undefined   // undefined = still loading
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: undefined,
  profile: undefined,
  refreshProfile: async () => {},
})

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)

  const refreshProfile = async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (s?.user.id) {
      const p = await fetchProfile(s.user.id)
      setProfile(p)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session?.user.id) {
        const p = await fetchProfile(data.session.user.id)
        setProfile(p)
      } else {
        setProfile(null)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      if (s?.user.id) {
        const p = await fetchProfile(s.user.id)
        setProfile(p)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

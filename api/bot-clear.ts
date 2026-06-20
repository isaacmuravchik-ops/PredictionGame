import { createClient } from '@supabase/supabase-js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization as string | undefined
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  const jwt = authHeader.slice(7)

  const supabaseUrl = process.env.VITE_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing server environment variables' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })
  const { data: callerProfile } = await admin
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!callerProfile?.is_admin) return res.status(403).json({ error: 'Forbidden' })

  const { data: botProfile } = await admin
    .from('profiles').select('id').eq('is_bot', true).maybeSingle()
  if (!botProfile) return res.status(404).json({ error: 'Bot not found' })

  // Find upcoming scheduled match IDs
  const now = new Date()
  const { data: upcomingMatches } = await admin
    .from('matches')
    .select('id')
    .eq('status', 'scheduled')
    .gt('kickoff_utc', now.toISOString())

  if (!upcomingMatches || upcomingMatches.length === 0) {
    return res.status(200).json({ deleted: 0, message: 'No upcoming matches' })
  }

  const { data: deleted, error: deleteErr } = await admin
    .from('predictions')
    .delete()
    .eq('user_id', botProfile.id)
    .in('match_id', upcomingMatches.map((m: any) => m.id))
    .select('id')

  if (deleteErr) return res.status(500).json({ error: deleteErr.message })

  return res.status(200).json({ deleted: (deleted ?? []).length })
}

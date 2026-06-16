import { createClient } from '@supabase/supabase-js'

// Returns upcoming matches with a boolean flag for whether the bot has predicted them.
// Intentionally returns NO prediction content so the admin can't see picks before kickoff.
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

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
  if (!botProfile) return res.status(200).json({ matches: [] })

  // All upcoming scheduled matches
  const { data: upcomingMatches } = await admin
    .from('matches')
    .select('id, home_team, away_team, stage, group_label, kickoff_utc')
    .eq('status', 'scheduled')
    .gt('kickoff_utc', new Date().toISOString())
    .order('kickoff_utc', { ascending: true })

  if (!upcomingMatches || upcomingMatches.length === 0) {
    return res.status(200).json({ matches: [] })
  }

  // Which of those have bot predictions (no prediction content returned)
  const { data: botPreds } = await admin
    .from('predictions')
    .select('match_id')
    .eq('user_id', botProfile.id)
    .in('match_id', upcomingMatches.map((m: any) => m.id))

  const predictedIds = new Set((botPreds ?? []).map((p: any) => p.match_id))

  const matches = upcomingMatches.map((m: any) => ({
    id: m.id,
    home_team: m.home_team,
    away_team: m.away_team,
    stage: m.stage,
    group_label: m.group_label,
    kickoff_utc: m.kickoff_utc,
    predicted: predictedIds.has(m.id),
  }))

  return res.status(200).json({ matches })
}

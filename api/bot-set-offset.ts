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

  // Fetch total_points for all human players from leaderboard view
  const { data: rows } = await admin
    .from('leaderboard')
    .select('user_id, total_points, is_bot')
  const humanRows = (rows ?? []).filter((r: any) => !r.is_bot)
  if (humanRows.length === 0) {
    return res.status(200).json({ offset: 0, message: 'No human players yet' })
  }

  const sorted = humanRows
    .map((r: any) => Number(r.total_points))
    .sort((a: number, b: number) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]

  const { error: updateErr } = await admin
    .from('profiles')
    .update({ points_offset: median })
    .eq('id', botProfile.id)
  if (updateErr) return res.status(500).json({ error: updateErr.message })

  return res.status(200).json({ success: true, offset: median, humanCount: humanRows.length })
}

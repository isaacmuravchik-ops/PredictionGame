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

  // Verify the caller is an admin
  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })
  const { data: callerProfile } = await admin
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!callerProfile?.is_admin) return res.status(403).json({ error: 'Forbidden' })

  // Prevent duplicate bot creation
  const { data: existing } = await admin
    .from('profiles').select('id, team_name').eq('is_bot', true).maybeSingle()
  if (existing) {
    return res.status(409).json({ error: 'Bot already exists', botId: existing.id, teamName: existing.team_name })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
  const teamName: string = (body.teamName ?? 'Claude AI').toString().trim() || 'Claude AI'

  // Create a real auth user for the bot so the profiles FK is satisfied
  const { data: authData, error: createErr } = await admin.auth.admin.createUser({
    email: `claudebot+${Date.now()}@predictiongame.internal`,
    password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    email_confirm: true,
  })
  if (createErr || !authData.user) {
    return res.status(500).json({ error: createErr?.message ?? 'Failed to create auth user' })
  }

  const { error: profileErr } = await admin.from('profiles').insert({
    id: authData.user.id,
    team_name: teamName,
    is_bot: true,
    is_admin: false,
    points_offset: 0,
  })
  if (profileErr) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return res.status(500).json({ error: profileErr.message })
  }

  return res.status(200).json({ success: true, botId: authData.user.id, teamName })
}

import { createClient } from '@supabase/supabase-js'

const STAGE_MULTIPLIERS: Record<string, number> = {
  group: 1.0, r32: 1.5, r16: 2.0, qf: 2.5, sf: 3.0, '3rd': 2.0, final: 4.0,
}
const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16',
  qf: 'Quarter-final', sf: 'Semi-final', '3rd': '3rd Place', final: 'Final',
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization as string | undefined
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  const jwt = authHeader.slice(7)

  const supabaseUrl = process.env.VITE_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const anthropicKey = process.env.ANTHROPIC_API_KEY!
  if (!supabaseUrl || !serviceRoleKey || !anthropicKey) {
    return res.status(500).json({ error: 'Missing server environment variables' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Verify the caller is an admin
  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })
  const { data: callerProfile } = await admin
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!callerProfile?.is_admin) return res.status(403).json({ error: 'Forbidden' })

  const { data: botProfile } = await admin
    .from('profiles').select('id').eq('is_bot', true).maybeSingle()
  if (!botProfile) return res.status(404).json({ error: 'Bot not found. Create it first.' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const allUpcoming: boolean = body.allUpcoming === true
  const force: boolean = body.force === true

  const now = new Date()
  const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Upcoming matches not yet kicked off, capped to next 24h unless allUpcoming is set
  const baseQuery = admin
    .from('matches')
    .select('id, home_team, away_team, stage, group_label, kickoff_utc')
    .eq('status', 'scheduled')
    .gt('kickoff_utc', now.toISOString())
    .order('kickoff_utc', { ascending: true })

  const { data: matches } = await (
    allUpcoming ? baseQuery : baseQuery.lte('kickoff_utc', cutoff.toISOString())
  )

  if (!matches || matches.length === 0) {
    return res.status(200).json({ predicted: 0, message: 'No upcoming matches' })
  }

  // Exclude matches the bot already has a prediction for
  const { data: existingPreds } = await admin
    .from('predictions')
    .select('match_id')
    .eq('user_id', botProfile.id)
    .in('match_id', matches.map((m: any) => m.id))

  const existingIds = new Set((existingPreds ?? []).map((p: any) => p.match_id))
  const unpredicted = force ? matches : matches.filter((m: any) => !existingIds.has(m.id))

  if (unpredicted.length === 0) {
    return res.status(200).json({ predicted: 0, message: 'All upcoming matches already predicted' })
  }

  // Load rosters for involved teams
  const teams = [...new Set(unpredicted.flatMap((m: any) => [m.home_team, m.away_team]))]
  const { data: players } = await admin
    .from('players').select('team, name').in('team', teams)
  const rosterMap: Record<string, string[]> = {}
  for (const p of players ?? []) {
    if (!rosterMap[p.team]) rosterMap[p.team] = []
    rosterMap[p.team].push(p.name)
  }

  const results: Array<{ matchId: number; success: boolean; prompt?: string; rawResponse?: string; prediction?: object; error?: string }> = []

  for (const match of unpredicted) {
    const homeRoster: string[] = rosterMap[match.home_team] ?? []
    const awayRoster: string[] = rosterMap[match.away_team] ?? []
    const allPlayers = [...homeRoster, ...awayRoster]
    const mult = STAGE_MULTIPLIERS[match.stage] ?? 1.0
    const stageName = STAGE_LABELS[match.stage] ?? match.stage

    const prompt = `You are predicting a FIFA World Cup 2026 match for a fun prediction league.

Match: ${match.home_team} (Home) vs ${match.away_team} (Away)
Stage: ${stageName} (×${mult} points multiplier)
Kickoff: ${new Date(match.kickoff_utc).toUTCString()}
${match.group_label ? `Group: ${match.group_label}` : ''}

${homeRoster.length > 0 ? `${match.home_team} squad: ${homeRoster.join(', ')}` : `No ${match.home_team} roster available`}
${awayRoster.length > 0 ? `${match.away_team} squad: ${awayRoster.join(', ')}` : `No ${match.away_team} roster available`}

Consider current international form, squad quality, and tournament context. Pick one player most likely to score or assist.
${allPlayers.length > 0 ? 'Your player pick MUST be an exact name from the squad lists above.' : ''}

Return ONLY valid JSON with no markdown wrapping:
{
  "home": <integer 0-4>,
  "away": <integer 0-4>,
  "first_team": "home" | "away" | "none",
  "player": "<player name>",
  "rationale": "<1-2 sentences explaining your prediction>"
}`

    try {
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!apiRes.ok) {
        results.push({ matchId: match.id, success: false, error: `Anthropic API ${apiRes.status}` })
        continue
      }

      const apiData = await apiRes.json() as any
      const raw: string = apiData.content?.[0]?.text ?? ''

      let parsed: any
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        parsed = JSON.parse(jsonMatch?.[0] ?? raw)
      } catch {
        results.push({ matchId: match.id, success: false, prompt, rawResponse: raw, error: 'Failed to parse Claude response' })
        continue
      }

      const homeScore = Math.max(0, Math.min(4, Math.round(Number(parsed.home ?? 1))))
      const awayScore = Math.max(0, Math.min(4, Math.round(Number(parsed.away ?? 1))))
      const firstTeam: string = ['home', 'away', 'none'].includes(parsed.first_team)
        ? parsed.first_team : 'home'

      let playerName: string = String(parsed.player ?? '').trim()
      if (allPlayers.length > 0) {
        // Strip accents so "Mbappe" matches "Mbappé", etc.
        const norm = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const lp = norm(playerName)
        const found = allPlayers.find(p => {
          const np = norm(p)
          return np === lp ||
            np.split(' ').every(part => lp.includes(part)) ||
            lp.split(' ').every(part => np.includes(part))
        })
        if (!found) {
          const fallback = firstTeam === 'home' ? homeRoster : firstTeam === 'away' ? awayRoster : homeRoster
          playerName = fallback[0] ?? allPlayers[0] ?? playerName
        } else {
          playerName = found
        }
      }
      if (!playerName) playerName = match.home_team

      const rationale = String(parsed.rationale ?? '').slice(0, 500).trim()

      const { error: insertErr } = await admin.from('predictions').upsert({
        user_id: botProfile.id,
        match_id: match.id,
        pred_home_score: homeScore,
        pred_away_score: awayScore,
        pred_first_team: firstTeam,
        pred_player_name: playerName,
        rationale,
      }, { onConflict: 'user_id,match_id' })

      if (insertErr) {
        results.push({ matchId: match.id, success: false, error: insertErr.message })
      } else {
        results.push({
          matchId: match.id, success: true,
          prompt,
          rawResponse: raw,
          prediction: { homeScore, awayScore, firstTeam, playerName, rationale },
        })
      }
    } catch (e: any) {
      results.push({ matchId: match.id, success: false, error: String(e?.message ?? e) })
    }
  }

  const predicted = results.filter(r => r.success).length
  return res.status(200).json({ predicted, total: unpredicted.length, results })
}

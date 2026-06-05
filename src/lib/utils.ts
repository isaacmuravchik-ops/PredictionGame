import type { Match } from '../types/database'

export function getMatchState(kickoffUtc: string, status: string): 'open' | 'locked' | 'finished' {
  if (status === 'finished') return 'finished'
  if (new Date(kickoffUtc) <= new Date()) return 'locked'
  return 'open'
}

// All times displayed in Eastern Time — the broadcast/host timezone for WC 2026.
const ET = 'America/New_York'

function safeDate(utcString: string): Date | null {
  const d = new Date(utcString)
  return isNaN(d.getTime()) ? null : d
}

export function formatKickoffTime(utcString: string): string {
  const d = safeDate(utcString)
  if (!d) return '—'
  try {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: ET })
  } catch {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
}

export function formatDateHeading(utcString: string): string {
  const d = safeDate(utcString)
  if (!d) return 'Unknown date'
  try {
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: ET })
  } catch {
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  }
}

export function groupMatchesByDate(matches: Match[]): [string, Match[]][] {
  const result: [string, Match[]][] = []
  const seen = new Set<string>()
  for (const m of matches) {
    const heading = formatDateHeading(m.kickoff_utc)
    if (!seen.has(heading)) {
      seen.add(heading)
      result.push([heading, []])
    }
    result[result.length - 1][1].push(m)
  }
  return result
}

export function stageLabel(stage: string, groupLabel: string | null): string {
  if (stage === 'group') return `Group ${groupLabel ?? ''}`
  const labels: Record<string, string> = {
    r32: 'Round of 32',
    r16: 'Round of 16',
    qf: 'Quarter-final',
    sf: 'Semi-final',
    '3rd': '3rd Place',
    final: 'Final',
  }
  return labels[stage] ?? stage
}

export function firstTeamLabel(value: string): string {
  if (value === 'home') return 'Home'
  if (value === 'away') return 'Away'
  return 'No goals'
}

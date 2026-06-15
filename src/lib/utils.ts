import type { Match } from '../types/database'

// ─── Flag emoji ───────────────────────────────────────────────────────────────

// Converts a 2-letter ISO 3166-1 alpha-2 code to a flag emoji via
// Regional Indicator Symbols (U+1F1E6–U+1F1FF).
function isoToFlag(code: string): string {
  return [...code.toUpperCase()]
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join('')
}

const SPECIAL_FLAGS: Record<string, string> = {
  england:          '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  scotland:         '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  wales:            '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'northern ireland': '🏴󠁧󠁢󠁮󠁩󠁲󠁿',
}

const COUNTRY_CODES: Record<string, string> = {
  afghanistan: 'af', albania: 'al', algeria: 'dz', angola: 'ao',
  argentina: 'ar', armenia: 'am', australia: 'au', austria: 'at',
  azerbaijan: 'az', bahrain: 'bh', bangladesh: 'bd', belgium: 'be',
  benin: 'bj', bolivia: 'bo', 'bosnia & herzegovina': 'ba',
  'bosnia and herzegovina': 'ba', botswana: 'bw', brazil: 'br',
  bulgaria: 'bg', burkina: 'bf', burundi: 'bi', cambodia: 'kh',
  cameroon: 'cm', canada: 'ca', 'cape verde': 'cv', chile: 'cl',
  china: 'cn', colombia: 'co', 'costa rica': 'cr', croatia: 'hr',
  cuba: 'cu', 'czech republic': 'cz', czechia: 'cz', denmark: 'dk',
  'dr congo': 'cd', ecuador: 'ec', egypt: 'eg', 'el salvador': 'sv',
  ethiopia: 'et', finland: 'fi', france: 'fr', gabon: 'ga',
  gambia: 'gm', germany: 'de', ghana: 'gh', greece: 'gr',
  guatemala: 'gt', guinea: 'gn', haiti: 'ht', honduras: 'hn',
  hungary: 'hu', iceland: 'is', india: 'in', indonesia: 'id',
  iran: 'ir', iraq: 'iq', ireland: 'ie', israel: 'il', italy: 'it',
  'ivory coast': 'ci', "côte d'ivoire": 'ci', "cote d'ivoire": 'ci',
  jamaica: 'jm', japan: 'jp', jordan: 'jo', kenya: 'ke',
  'korea republic': 'kr', 'south korea': 'kr', kuwait: 'kw',
  lebanon: 'lb', libya: 'ly', mali: 'ml', mauritania: 'mr',
  mexico: 'mx', morocco: 'ma', mozambique: 'mz', namibia: 'na',
  netherlands: 'nl', 'new zealand': 'nz', nicaragua: 'ni',
  nigeria: 'ng', norway: 'no', oman: 'om', panama: 'pa',
  paraguay: 'py', peru: 'pe', philippines: 'ph', poland: 'pl',
  portugal: 'pt', qatar: 'qa', romania: 'ro', russia: 'ru',
  rwanda: 'rw', 'saudi arabia': 'sa', senegal: 'sn', serbia: 'rs',
  sierra: 'sl', singapore: 'sg', slovakia: 'sk', slovenia: 'si',
  somalia: 'so', 'south africa': 'za', 'south sudan': 'ss',
  spain: 'es', 'sri lanka': 'lk', sudan: 'sd', sweden: 'se',
  switzerland: 'ch', syria: 'sy', taiwan: 'tw', tajikistan: 'tj',
  tanzania: 'tz', thailand: 'th', togo: 'tg', 'trinidad & tobago': 'tt',
  'trinidad and tobago': 'tt', tunisia: 'tn', turkey: 'tr',
  turkmenistan: 'tm', uganda: 'ug', ukraine: 'ua',
  'united arab emirates': 'ae', 'united states': 'us', usa: 'us',
  uruguay: 'uy', uzbekistan: 'uz', venezuela: 've', vietnam: 'vn',
  yemen: 'ye', zambia: 'zm', zimbabwe: 'zw',
}

export function flagEmoji(teamName: string): string {
  const key = teamName.toLowerCase().trim()
  if (SPECIAL_FLAGS[key]) return SPECIAL_FLAGS[key]
  const code = COUNTRY_CODES[key]
  return code ? isoToFlag(code) : ''
}

export const STAGE_MULTIPLIERS: Record<string, number> = {
  group: 1.0, r32: 1.5, r16: 2.0, qf: 2.5, sf: 3.0, '3rd': 2.0, final: 4.0,
}

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

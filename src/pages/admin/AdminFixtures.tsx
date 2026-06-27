import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { AdminLayout } from './AdminLayout'

const OF_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

interface ParsedMatch {
  ext_id: string
  stage: string
  group_label: string | null
  home_team: string
  away_team: string
  kickoff_utc: string
  status: 'scheduled'
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function inferStage(roundName: string): string {
  const n = roundName.toLowerCase()
  if (n.includes('third') || n.includes('3rd')) return '3rd'
  if (n.includes('final') && !n.includes('semi') && !n.includes('quarter')) return 'final'
  if (n.includes('semi')) return 'sf'
  if (n.includes('quarter')) return 'qf'
  if (n.includes('round of 16') || n.includes('r16') || n.includes('sixteen')) return 'r16'
  if (n.includes('round of 32') || n.includes('r32') || n.includes('thirty-two')) return 'r32'
  return 'group'
}

/**
 * Converts a local date + time string (with embedded UTC offset) to a UTC ISO string.
 *
 * openfootball times look like "13:00 UTC-6" or "15:00 UTC-4".
 * We extract the per-match offset from the string so each venue's timezone is handled
 * independently. If no offset is present in the string, we assume UTC.
 */
function parseKickoff(date: string, time: string | undefined, year: number): string | null {
  try {
    // Already an ISO string — store as-is (treat as UTC).
    if (date.includes('T')) {
      const d = new Date(date.endsWith('Z') ? date : date + 'Z')
      return isNaN(d.getTime()) ? null : d.toISOString()
    }

    // Extract UTC offset from the time string, e.g. "13:00 UTC-6" → offset = -6.
    // If absent, fall back to UTC (offset = 0).
    let rawTime = (time ?? '00:00').trim()
    let utcOffset = 0
    const offsetMatch = rawTime.match(/^(\d{1,2}:\d{2})\s+UTC([+-]\d+)$/i)
    if (offsetMatch) {
      rawTime    = offsetMatch[1]
      utcOffset  = parseInt(offsetMatch[2], 10)
    }

    const tp = rawTime.match(/(\d{1,2}):(\d{2})/)
    if (!tp) return null
    const h   = parseInt(tp[1], 10)
    const min = parseInt(tp[2], 10)

    // Handle "Jun/11" style dates as well as "YYYY-MM-DD".
    let isoDate = date
    if (/^[A-Za-z]/.test(date)) {
      const months: Record<string, string> = {
        jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
        jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
      }
      const m = date.match(/([A-Za-z]+)[/\s](\d+)/)
      if (m) {
        const mo = months[m[1].toLowerCase().slice(0, 3)] ?? '06'
        isoDate = `${year}-${mo}-${m[2].padStart(2, '0')}`
      }
    }

    const parts = isoDate.split('-').map(Number)
    if (parts.length < 3 || parts.some(isNaN)) return null
    const [y, mo, d] = parts

    // Convert local → UTC: subtract utcOffset.
    // e.g. "13:00 UTC-6": localMs = 13:00, utcMs = 13:00 - (-6 × 3600s) = 19:00 UTC ✓
    const localMs = Date.UTC(y, mo - 1, d, h, min, 0)
    if (isNaN(localMs)) return null
    return new Date(localMs - utcOffset * 3_600_000).toISOString()
  } catch {
    return null
  }
}

function teamName(t: unknown): string | null {
  if (!t) return null
  if (typeof t === 'string') return t
  if (typeof t === 'object') {
    const o = t as Record<string, unknown>
    return (o.name ?? o.team ?? o.title ?? null) as string | null
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFixtures(data: any, autoYear = 2026): ParsedMatch[] {
  const results: ParsedMatch[] = []
  let autoNum = 1

  // openfootball/worldcup.json uses a flat `matches[]` array where each match
  // carries its own `round` (stage name) and `group` fields.
  const flatMatches: unknown[] =
      Array.isArray(data?.matches) ? data.matches
    : Array.isArray(data?.games)   ? data.games
    : []

  if (flatMatches.length > 0) {
    for (const raw of flatMatches) {
      const m    = raw as Record<string, unknown>
      const home = teamName(m.team1 ?? m.home ?? m.home_team ?? m.homeTeam)
      const away = teamName(m.team2 ?? m.away ?? m.away_team ?? m.awayTeam)
      if (!home || !away) continue

      const date = (m.date ?? m.kickoff ?? '') as string
      if (!date) continue

      const time = (m.time ?? m.kickoff_time) as string | undefined
      const num  = (m.num ?? m.id ?? m.match_id ?? autoNum++) as number

      const kickoffUtc = parseKickoff(date, time, autoYear)
      if (kickoffUtc === null) continue

      const roundName  = (m.round ?? m.stage ?? '') as string
      const stage      = inferStage(roundName)
      const groupLabel = stage === 'group'
        ? ((m.group as string | undefined)?.replace(/^Group\s+/i, '').trim() ?? null)
        : null

      results.push({
        ext_id: `wc2026-${num}`,
        stage,
        group_label: groupLabel,
        home_team: home,
        away_team: away,
        kickoff_utc: kickoffUtc,
        status: 'scheduled',
      })
    }
    return results
  }

  // Fallback: rounds-based structure (data.rounds / data.stages / data.matchdays / data.groups).
  const rounds: Array<{
    name?: string; group?: string; stage?: string
    matches?: unknown[]; games?: unknown[]
  }> =
      Array.isArray(data?.rounds)     ? data.rounds
    : Array.isArray(data?.stages)     ? data.stages
    : Array.isArray(data?.matchdays)  ? data.matchdays
    : Array.isArray(data?.groups)     ? data.groups
    : []

  for (const round of rounds) {
    const roundName      = round.name ?? round.stage ?? ''
    const stage          = inferStage(roundName)
    const groupFromRound = stage === 'group'
      ? (roundName.match(/\bGroup\s+([A-L])\b/i)?.[1]?.toUpperCase() ?? null)
      : null
    const matchList = (round.matches ?? round.games ?? []) as unknown[]

    for (const raw of matchList) {
      const m    = raw as Record<string, unknown>
      const home = teamName(m.team1 ?? m.home ?? m.home_team ?? m.homeTeam)
      const away = teamName(m.team2 ?? m.away ?? m.away_team ?? m.awayTeam)
      if (!home || !away) continue

      const date = (m.date ?? m.kickoff ?? '') as string
      if (!date) continue

      const time = (m.time ?? m.kickoff_time) as string | undefined
      const num  = (m.num ?? m.id ?? m.match_id ?? autoNum++) as number

      const kickoffUtc = parseKickoff(date, time, autoYear)
      if (kickoffUtc === null) continue

      const groupLabel =
        (m.group as string | undefined)?.replace(/^Group\s+/i, '').trim() ?? groupFromRound

      results.push({
        ext_id: `wc2026-${num}`,
        stage,
        group_label: stage === 'group' ? (groupLabel ?? null) : null,
        home_team: home,
        away_team: away,
        kickoff_utc: kickoffUtc,
        status: 'scheduled',
      })
    }
  }

  return results
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summariseStructure(data: any): string {
  if (typeof data !== 'object' || data === null) return JSON.stringify(data).slice(0, 200)
  const keys = Object.keys(data)
  const lines: string[] = [`Top-level keys: ${keys.join(', ')}`]
  for (const k of keys.slice(0, 4)) {
    const v = data[k]
    if (Array.isArray(v))
      lines.push(`  ${k}: array[${v.length}]${v[0] ? ' — first item keys: ' + Object.keys(v[0]).join(', ') : ''}`)
    else if (typeof v === 'object' && v !== null)
      lines.push(`  ${k}: object — keys: ${Object.keys(v).join(', ')}`)
    else
      lines.push(`  ${k}: ${JSON.stringify(v).slice(0, 60)}`)
  }
  return lines.join('\n')
}

function isPlaceholderName(name: string): boolean {
  const n = name.trim().toLowerCase()
  return (
    n === 'tbd' ||
    n === '' ||
    n.startsWith('winner') ||
    n.startsWith('runner') ||
    n.startsWith('loser') ||
    /^[wl]\d+/.test(n) ||   // W49, L50 etc.
    n.includes(' of ')       // "Winner of Match 49"
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminFixtures() {
  const [url, setUrl]               = useState(OF_URL)
  const [fetching, setFetching]     = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [rawDebug, setRawDebug]     = useState<string | null>(null)
  const [preview, setPreview]       = useState<ParsedMatch[] | null>(null)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number; error?: string } | null>(null)

  async function handleFetch() {
    setFetching(true)
    setFetchError(null)
    setRawDebug(null)
    setPreview(null)
    setImportResult(null)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`)
      const json = await res.json()
      const matches = parseFixtures(json)
      if (matches.length === 0) {
        setRawDebug(summariseStructure(json))
        throw new Error('No matches parsed — see structure below to diagnose the format')
      }
      setPreview(matches)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Fetch failed')
    }
    setFetching(false)
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true)

    // Fetch all existing matches so we can decide per-row what to do.
    const { data: existingRows } = await supabase
      .from('matches').select('ext_id, status, home_team, away_team')
    const existingMap = new Map(
      (existingRows ?? [])
        .filter(r => r.ext_id)
        .map(r => [r.ext_id as string, r as { status: string; home_team: string; away_team: string }])
    )

    const toInsert: ParsedMatch[] = []
    const toUpdate: Array<{ ext_id: string; home_team: string; away_team: string; kickoff_utc: string }> = []

    for (const m of preview) {
      const existing = existingMap.get(m.ext_id)
      if (!existing) {
        // Brand-new match — insert it.
        toInsert.push(m)
      } else if (existing.status === 'finished') {
        // Finished match — never touch it.
      } else if (isPlaceholderName(existing.home_team) || isPlaceholderName(existing.away_team)) {
        // Placeholder team name → fill in with real teams from the JSON.
        // Only update the three fields that change; all other columns are left alone.
        toUpdate.push({ ext_id: m.ext_id, home_team: m.home_team, away_team: m.away_team, kickoff_utc: m.kickoff_utc })
      }
      // else: scheduled match with real team names → leave completely untouched.
    }

    const CHUNK = 50
    let insertedCount = 0
    let updatedCount = 0
    let firstError: string | null = null

    for (let i = 0; i < toInsert.length && !firstError; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK)
      const { error } = await supabase.from('matches').insert(chunk)
      if (error) { firstError = `Insert batch ${Math.floor(i / CHUNK) + 1}: ${error.message}`; break }
      insertedCount += chunk.length
    }

    // Upsert with a minimal payload so only home_team/away_team/kickoff_utc are written.
    for (let i = 0; i < toUpdate.length && !firstError; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK)
      const { error } = await supabase.from('matches').upsert(chunk, { onConflict: 'ext_id' })
      if (error) { firstError = `Update batch ${Math.floor(i / CHUNK) + 1}: ${error.message}`; break }
      updatedCount += chunk.length
    }

    setImporting(false)
    const skipped = preview.length - toInsert.length - toUpdate.length
    if (firstError) {
      setImportResult({ inserted: insertedCount, updated: updatedCount, skipped, error: firstError })
    } else {
      setImportResult({ inserted: insertedCount, updated: updatedCount, skipped })
      setPreview(null)
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-lg font-bold text-gray-800 mb-1">Fixture Sync</h1>
      <p className="text-sm text-gray-500 mb-5">
        Fetch and import fixtures from openfootball. Each match's UTC offset is read
        directly from the JSON (e.g. "13:00 UTC-6"), so times are stored correctly
        regardless of venue timezone. All times display in Eastern Time on the site.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-4">
        <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
          Source URL
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
          />
          <button
            onClick={handleFetch}
            disabled={fetching || !url.trim()}
            className="px-4 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-medium text-sm rounded-lg transition-colors whitespace-nowrap"
          >
            {fetching ? 'Fetching…' : 'Fetch & Preview'}
          </button>
        </div>

        {fetchError && <p className="text-red-600 text-sm mt-2">{fetchError}</p>}
        {rawDebug && (
          <pre className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-2 text-xs text-gray-600 whitespace-pre-wrap font-mono">
            {rawDebug}
          </pre>
        )}
      </div>

      <PasteImport onParsed={setPreview} onImportResult={setImportResult} />

      {preview && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mt-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Preview — {preview.length} matches
            </p>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-medium text-sm rounded-lg transition-colors"
            >
              {importing ? 'Importing…' : `Import new matches`}
            </button>
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 px-2 font-medium">#</th>
                  <th className="text-left pb-2 px-2 font-medium">Match</th>
                  <th className="text-left pb-2 px-2 font-medium">Stage</th>
                  <th className="text-left pb-2 px-2 font-medium">Kickoff (UTC stored)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.map((m, i) => (
                  <tr key={m.ext_id}>
                    <td className="py-1.5 px-2 text-gray-400">{i + 1}</td>
                    <td className="py-1.5 px-2 font-medium text-gray-800">{m.home_team} vs {m.away_team}</td>
                    <td className="py-1.5 px-2 text-gray-500">{m.stage}{m.group_label ? ` ${m.group_label}` : ''}</td>
                    <td className="py-1.5 px-2 text-gray-400 font-mono">
                      {m.kickoff_utc.replace('T', ' ').replace('.000Z', ' UTC')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {importResult && (
        <div className={`rounded-xl px-4 py-3 text-sm mt-4 ${importResult.error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
          {importResult.error
            ? `Import failed after ${importResult.inserted} inserted / ${importResult.updated} updated: ${importResult.error}`
            : `✓ ${importResult.inserted} new matches inserted, ${importResult.updated} placeholder matches filled in, ${importResult.skipped} existing matches left untouched.`}
        </div>
      )}
    </AdminLayout>
  )
}

// ─── Paste JSON fallback ───────────────────────────────────────────────────────

function PasteImport({
  onParsed,
  onImportResult,
}: {
  onParsed: (m: ParsedMatch[]) => void
  onImportResult: (r: { count: number; error?: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr]   = useState<string | null>(null)

  void onImportResult

  function handleParse() {
    setErr(null)
    try {
      const json = JSON.parse(text)
      const matches = parseFixtures(json)
      if (matches.length === 0) {
        setErr('Still no matches found.\n\n' + summariseStructure(json))
        return
      }
      onParsed(matches)
      setOpen(false)
      setText('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm text-green-700 font-medium hover:underline"
      >
        {open ? '▾ Hide paste panel' : '▸ Paste JSON manually (fallback)'}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-400">
            Paste raw fixture JSON. UTC offsets embedded in time strings (e.g. "13:00 UTC-6")
            are parsed per-match automatically.
          </p>
          <textarea
            rows={8}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder='{"matches": [{"round": "Matchday 1", "date": "2026-06-11", "time": "13:00 UTC-6", ...}]}'
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {err && (
            <pre className="text-red-600 text-xs whitespace-pre-wrap font-mono bg-red-50 rounded-lg px-3 py-2">
              {err}
            </pre>
          )}
          <button
            onClick={handleParse}
            disabled={!text.trim()}
            className="px-4 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-medium text-sm rounded-lg transition-colors"
          >
            Parse & Preview
          </button>
        </div>
      )}
    </div>
  )
}

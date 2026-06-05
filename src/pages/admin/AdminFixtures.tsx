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

function inferGroup(roundName: string): string | null {
  const m = roundName.match(/\bGroup\s+([A-L])\b/i)
  return m ? m[1].toUpperCase() : null
}

// UTC offset of the times in the source JSON.
// EST = UTC-5: a 14:00 EST kickoff is stored as 19:00 UTC.
const SOURCE_UTC_OFFSET = -5

// Parse a date+time string into an ISO UTC string, applying SOURCE_UTC_OFFSET.
// Handles: "2026-06-11" + "17:00", "Jun/11" + "17:00", "2026-06-11T17:00:00Z"
function parseKickoff(date: string, time?: string, year = 2026): string {
  // Already a full ISO timestamp with explicit zone — keep as-is
  if (date.includes('T')) return date.endsWith('Z') ? date : date + 'Z'

  let isoDate = date
  // "Jun/11" or "Jun 11" → "2026-06-11"
  if (/^[A-Za-z]/.test(date)) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const m = date.match(/([A-Za-z]+)[/\s](\d+)/)
    if (m) {
      const mo = months[m[1].toLowerCase().slice(0, 3)] ?? '06'
      const day = m[2].padStart(2, '0')
      isoDate = `${year}-${mo}-${day}`
    }
  }

  const t = (time ?? '00:00').padStart(5, '0')
  const [h, min] = t.split(':').map(Number)
  const [y, mo, d] = isoDate.split('-').map(Number)
  // Construct the local time as a UTC epoch value, then subtract the offset to get true UTC.
  const localMs = Date.UTC(y, mo - 1, d, h, min, 0)
  const utcMs = localMs - SOURCE_UTC_OFFSET * 3_600_000
  return new Date(utcMs).toISOString().replace('.000Z', 'Z')
}

// Resolve team name from various field shapes.
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
  // Normalise: some files put rounds at top level, others nest them
  const rounds: Array<{
    name?: string
    group?: string
    stage?: string
    matches?: unknown[]
    games?: unknown[]
  }> = Array.isArray(data?.rounds)
    ? data.rounds
    : Array.isArray(data?.stages)
    ? data.stages
    : Array.isArray(data?.matchdays)
    ? data.matchdays
    : Array.isArray(data?.groups)
    ? data.groups
    : []

  // Some files have a flat top-level matches/games array — wrap in one round
  const flatMatches =
    rounds.length === 0 && (Array.isArray(data?.matches) || Array.isArray(data?.games))
      ? data.matches ?? data.games
      : null
  if (flatMatches) rounds.push({ name: 'Group stage', matches: flatMatches })

  const results: ParsedMatch[] = []
  let autoNum = 1

  for (const round of rounds) {
    const roundName = round.name ?? round.stage ?? ''
    const stage = inferStage(roundName)
    const groupFromRound = stage === 'group' ? inferGroup(roundName) : null
    const matchList = (round.matches ?? round.games ?? []) as unknown[]

    for (const raw of matchList) {
      const m = raw as Record<string, unknown>

      // Team names — try several field name conventions
      const home = teamName(m.team1 ?? m.home ?? m.home_team ?? m.homeTeam)
      const away = teamName(m.team2 ?? m.away ?? m.away_team ?? m.awayTeam)
      if (!home || !away) continue

      const date = (m.date ?? m.kickoff ?? m.date_utc ?? '') as string
      if (!date) continue

      const time = (m.time ?? m.kickoff_time ?? m.time_utc) as string | undefined
      const num = (m.num ?? m.id ?? m.match_id ?? autoNum++) as number

      const groupLabel =
        (m.group as string | undefined)?.trim().toUpperCase().replace(/^GROUP\s+/i, '') ??
        groupFromRound

      results.push({
        ext_id: `wc2026-${num}`,
        stage,
        group_label: stage === 'group' ? groupLabel ?? null : null,
        home_team: home,
        away_team: away,
        kickoff_utc: parseKickoff(date, time, autoYear),
        status: 'scheduled',
      })
    }
  }

  return results
}

// Returns a compact human-readable summary of the JSON's top-level structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summariseStructure(data: any): string {
  if (typeof data !== 'object' || data === null) return JSON.stringify(data).slice(0, 200)
  const keys = Object.keys(data)
  const lines: string[] = [`Top-level keys: ${keys.join(', ')}`]
  for (const k of keys.slice(0, 4)) {
    const v = data[k]
    if (Array.isArray(v)) {
      lines.push(`  ${k}: array[${v.length}]${v[0] ? ' — first item keys: ' + Object.keys(v[0]).join(', ') : ''}`)
    } else if (typeof v === 'object' && v !== null) {
      lines.push(`  ${k}: object — keys: ${Object.keys(v).join(', ')}`)
    } else {
      lines.push(`  ${k}: ${JSON.stringify(v).slice(0, 60)}`)
    }
  }
  return lines.join('\n')
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminFixtures() {
  const [url, setUrl] = useState(OF_URL)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [rawDebug, setRawDebug] = useState<string | null>(null)
  const [preview, setPreview] = useState<ParsedMatch[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ count: number; error?: string } | null>(null)

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
        // Show structure so we can diagnose the format
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

    // Fetch ext_ids of already-finished matches — never touch those
    const { data: finishedRows } = await supabase
      .from('matches')
      .select('ext_id')
      .eq('status', 'finished')
    const finishedIds = new Set((finishedRows ?? []).map(r => r.ext_id as string))

    // Everything else (new matches AND existing scheduled placeholders) gets upserted,
    // so placeholder "Winner A vs Runner-up B" rows get overwritten with real team names.
    const toUpsert = preview.filter(m => !finishedIds.has(m.ext_id))

    const { error } = await supabase
      .from('matches')
      .upsert(toUpsert, { onConflict: 'ext_id' })

    setImporting(false)
    if (error) {
      setImportResult({ count: 0, error: error.message })
    } else {
      setImportResult({ count: toUpsert.length })
      setPreview(null)
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-lg font-bold text-gray-800 mb-1">Fixture Sync</h1>
      <p className="text-sm text-gray-500 mb-5">
        Fetch and import matches from an openfootball-format JSON source. Times are treated as
        UTC — cross-check against the official FIFA schedule after import. Re-importing is safe:
        scheduled placeholder matches (knockout TBD slots) are overwritten with real teams once
        known; finished matches are always protected.
      </p>

      {/* URL + fetch */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-4">
        <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
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

        {fetchError && (
          <p className="mt-2 text-red-600 text-sm">{fetchError}</p>
        )}

        {rawDebug && (
          <pre className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap font-mono">
            {rawDebug}
          </pre>
        )}

        <p className="mt-2 text-xs text-gray-400">
          If the default URL 404s or fails, paste the raw JSON into the box below instead.
        </p>
      </div>

      {/* Paste JSON fallback */}
      <PasteImport onParsed={setPreview} onImportResult={setImportResult} />

      {/* Preview table */}
      {preview && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Preview — {preview.length} matches
            </p>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-medium text-sm rounded-lg transition-colors"
            >
              {importing ? 'Importing…' : `Import ${preview.length} matches`}
            </button>
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 px-2 font-medium">#</th>
                  <th className="text-left pb-2 px-2 font-medium">Match</th>
                  <th className="text-left pb-2 px-2 font-medium">Stage</th>
                  <th className="text-left pb-2 px-2 font-medium">Kickoff (UTC assumed)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.map((m, i) => (
                  <tr key={m.ext_id}>
                    <td className="py-1.5 px-2 text-gray-400">{i + 1}</td>
                    <td className="py-1.5 px-2 font-medium text-gray-800">
                      {m.home_team} vs {m.away_team}
                    </td>
                    <td className="py-1.5 px-2 text-gray-500">
                      {m.stage}{m.group_label ? ` ${m.group_label}` : ''}
                    </td>
                    <td className="py-1.5 px-2 text-gray-400 font-mono">
                      {m.kickoff_utc.replace('T', ' ').replace(':00Z', ' UTC')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div
          className={`rounded-xl px-4 py-3 text-sm mt-4 ${
            importResult.error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'
          }`}
        >
          {importResult.error
            ? `Import failed: ${importResult.error}`
            : `✓ ${importResult.count} matches queued for import. Check the Results tab — new matches appear immediately.`}
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
  const [err, setErr] = useState<string | null>(null)

  function handleParse() {
    setErr(null)
    try {
      const json = JSON.parse(text)
      const matches = parseFixtures(json)
      if (matches.length === 0) {
        setErr(
          'Still no matches found.\n\n' + summariseStructure(json) +
          '\n\nPaste the structure above into the chat and Claude will update the parser.'
        )
        return
      }
      onParsed(matches)
      setOpen(false)
      setText('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  async function handleDirectImport(raw: ParsedMatch[]) {
    const { error } = await supabase
      .from('matches')
      .upsert(raw, { onConflict: 'ext_id', ignoreDuplicates: true })
    if (error) onImportResult({ count: 0, error: error.message })
    else onImportResult({ count: raw.length })
  }

  void handleDirectImport // suppress unused warning — called via onParsed path

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
            Paste the raw fixture JSON (from any source — openfootball, your own file, etc.)
            and click Parse. The parser accepts the openfootball{' '}
            <code className="bg-gray-100 px-1 rounded">rounds[]</code> format.
          </p>
          <textarea
            rows={8}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder='{"rounds": [{"name": "Matchday 1 - Group A", "matches": [...]}]}'
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

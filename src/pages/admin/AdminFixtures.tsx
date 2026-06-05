import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { AdminLayout } from './AdminLayout'

const OF_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

const TZ_OPTIONS = [
  { label: 'EDT  UTC−4  (US Eastern, Jun–Nov)', value: -4 },
  { label: 'EST  UTC−5  (US Eastern, Nov–Mar)', value: -5 },
  { label: 'CDT  UTC−5  (US Central, Mar–Nov)', value: -5 },
  { label: 'CST  UTC−6  (US Central, Nov–Mar)', value: -6 },
  { label: 'PDT  UTC−7  (US Pacific, Mar–Nov)', value: -7 },
  { label: 'PST  UTC−8  (US Pacific, Nov–Mar)', value: -8 },
  { label: 'UTC  UTC+0  (already UTC)',          value:  0 },
]

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

// Converts a local date+time (in utcOffset timezone) to a UTC ISO string.
// Returns null for unparseable input — those rows are skipped.
function parseKickoff(date: string, time: string | undefined, year: number, utcOffset: number): string | null {
  try {
    if (date.includes('T')) {
      const d = new Date(date.endsWith('Z') ? date : date + 'Z')
      return isNaN(d.getTime()) ? null : d.toISOString()
    }

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

    const rawTime = (time ?? '00:00').trim()
    const tp = rawTime.match(/(\d{1,2}):(\d{2})/)
    if (!tp) return null
    const h = parseInt(tp[1], 10)
    const min = parseInt(tp[2], 10)

    const parts = isoDate.split('-').map(Number)
    if (parts.length < 3 || parts.some(isNaN)) return null
    const [y, mo, d] = parts

    const localMs = Date.UTC(y, mo - 1, d, h, min, 0)
    if (isNaN(localMs)) return null

    // Subtract utcOffset to convert local → UTC.
    // e.g. local 15:00 at UTC-4: 15:00 - (-4 * 3600000) = 19:00 UTC ✓
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
function parseFixtures(data: any, utcOffset: number, autoYear = 2026): ParsedMatch[] {
  const rounds: Array<{
    name?: string; group?: string; stage?: string
    matches?: unknown[]; games?: unknown[]
  }> = Array.isArray(data?.rounds)   ? data.rounds
     : Array.isArray(data?.stages)   ? data.stages
     : Array.isArray(data?.matchdays)? data.matchdays
     : Array.isArray(data?.groups)   ? data.groups
     : []

  const flatMatches =
    rounds.length === 0 && (Array.isArray(data?.matches) || Array.isArray(data?.games))
      ? (data.matches ?? data.games) : null
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
      const home = teamName(m.team1 ?? m.home ?? m.home_team ?? m.homeTeam)
      const away = teamName(m.team2 ?? m.away ?? m.away_team ?? m.awayTeam)
      if (!home || !away) continue

      const date = (m.date ?? m.kickoff ?? m.date_utc ?? '') as string
      if (!date) continue

      const time = (m.time ?? m.kickoff_time ?? m.time_utc) as string | undefined
      const num  = (m.num ?? m.id ?? m.match_id ?? autoNum++) as number

      const kickoffUtc = parseKickoff(date, time, autoYear, utcOffset)
      if (kickoffUtc === null) continue

      const groupLabel =
        (m.group as string | undefined)?.trim().toUpperCase().replace(/^GROUP\s+/i, '') ??
        groupFromRound

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

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminFixtures() {
  const [url, setUrl]               = useState(OF_URL)
  const [tzOffset, setTzOffset]     = useState(-4)          // default EDT
  const [fetching, setFetching]     = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [rawDebug, setRawDebug]     = useState<string | null>(null)
  const [preview, setPreview]       = useState<ParsedMatch[] | null>(null)
  const [importing, setImporting]   = useState(false)
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
      const matches = parseFixtures(json, tzOffset)
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

    const { data: finishedRows } = await supabase
      .from('matches').select('ext_id').eq('status', 'finished')
    const finishedIds = new Set((finishedRows ?? []).map(r => r.ext_id as string))
    const toUpsert = preview.filter(m => !finishedIds.has(m.ext_id))

    const { error } = await supabase
      .from('matches').upsert(toUpsert, { onConflict: 'ext_id' })

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
        Fetch and import fixtures. Choose the timezone the source JSON uses, then
        Fetch &amp; Preview. Finished matches are never overwritten; scheduled
        placeholders are updated with real teams on re-import.
      </p>

      {/* URL + timezone + fetch */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
            Source timezone
          </label>
          <select
            value={tzOffset}
            onChange={e => setTzOffset(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {TZ_OPTIONS.map(opt => (
              <option key={`${opt.label}-${opt.value}`} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
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
        </div>

        {fetchError && <p className="text-red-600 text-sm">{fetchError}</p>}
        {rawDebug && (
          <pre className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap font-mono">
            {rawDebug}
          </pre>
        )}
      </div>

      {/* Paste JSON fallback */}
      <PasteImport tzOffset={tzOffset} onParsed={setPreview} onImportResult={setImportResult} />

      {/* Preview table */}
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
            ? `Import failed: ${importResult.error}`
            : `✓ ${importResult.count} matches imported. Check the Results tab to verify.`}
        </div>
      )}
    </AdminLayout>
  )
}

// ─── Paste JSON fallback ───────────────────────────────────────────────────────

function PasteImport({
  tzOffset,
  onParsed,
  onImportResult,
}: {
  tzOffset: number
  onParsed: (m: ParsedMatch[]) => void
  onImportResult: (r: { count: number; error?: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr]   = useState<string | null>(null)

  function handleParse() {
    setErr(null)
    try {
      const json = JSON.parse(text)
      const matches = parseFixtures(json, tzOffset)
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

  void onImportResult // used by parent; not called directly from here

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
            Paste raw fixture JSON and click Parse &amp; Preview. The selected
            source timezone above will be applied.
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

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFixtures(data: any): ParsedMatch[] {
  const rounds: Array<{
    name?: string
    matches?: Array<{
      num?: number
      date?: string
      time?: string
      team1?: { name?: string }
      team2?: { name?: string }
      group?: string
    }>
  }> = Array.isArray(data?.rounds) ? data.rounds : []

  const results: ParsedMatch[] = []
  let autoNum = 1

  for (const round of rounds) {
    const roundName = round.name ?? ''
    const stage = inferStage(roundName)
    const groupFromRound = stage === 'group' ? inferGroup(roundName) : null

    for (const m of round.matches ?? []) {
      if (!m.team1?.name || !m.team2?.name || !m.date) continue

      const num = m.num ?? autoNum++
      const time = (m.time ?? '00:00').padStart(5, '0')
      const kickoffUtc = `${m.date}T${time}:00Z`
      const groupLabel = m.group
        ? m.group.trim().toUpperCase().replace(/^GROUP\s+/i, '')
        : groupFromRound

      results.push({
        ext_id: `wc2026-${num}`,
        stage,
        group_label: stage === 'group' ? groupLabel : null,
        home_team: m.team1.name,
        away_team: m.team2.name,
        kickoff_utc: kickoffUtc,
        status: 'scheduled',
      })
    }
  }

  return results
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminFixtures() {
  const [url, setUrl] = useState(OF_URL)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ParsedMatch[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ count: number; error?: string } | null>(null)

  async function handleFetch() {
    setFetching(true)
    setFetchError(null)
    setPreview(null)
    setImportResult(null)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`)
      const json = await res.json()
      const matches = parseFixtures(json)
      if (matches.length === 0) {
        throw new Error(
          'No matches parsed — the URL may be wrong or the format is not openfootball-compatible.'
        )
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
    // ignoreDuplicates: true → insert new matches, skip any that already exist (preserves finished matches)
    const { error } = await supabase
      .from('matches')
      .upsert(preview, { onConflict: 'ext_id', ignoreDuplicates: true })
    setImporting(false)
    if (error) {
      setImportResult({ count: 0, error: error.message })
    } else {
      setImportResult({ count: preview.length })
      setPreview(null)
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-lg font-bold text-gray-800 mb-1">Fixture Sync</h1>
      <p className="text-sm text-gray-500 mb-5">
        Fetch and import matches from an openfootball-format JSON source. Times are treated as
        UTC — cross-check against the official FIFA schedule after import. Existing finished
        matches are never overwritten.
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
        <p className="mt-2 text-xs text-gray-400">
          Tip: if the default URL 404s, the 2026 data may not be published yet — check the{' '}
          <a
            href="https://github.com/openfootball/worldcup.json"
            target="_blank"
            rel="noreferrer"
            className="text-green-700 underline"
          >
            openfootball/worldcup.json
          </a>
          {' '}repo for the correct path.
        </p>
      </div>

      {/* Preview table */}
      {preview && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-4">
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
                      {m.stage}
                      {m.group_label ? ` ${m.group_label}` : ''}
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
          className={`rounded-xl px-4 py-3 text-sm ${
            importResult.error
              ? 'bg-red-50 text-red-800'
              : 'bg-green-50 text-green-800'
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
